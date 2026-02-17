import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, CheckCircle2, Truck, MapPin, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderItem {
    id: string;
    product_name: string;
    product_image: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface Order {
    id: string;
    created_at: string;
    status: string;
    total: number;
    subtotal: number;
    discount_amount: number;
    shipping_cost: number;
    delivery_address: string | null;
    delivery_city: string | null;
    payment_method: string | null;
    store_id: string;
    store_name?: string;
    items: OrderItem[];
}

export default function MarketplaceOrdersPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all");

    useEffect(() => {
        if (!user) {
            navigate("/auth");
            return;
        }

        const loadOrders = async () => {
            try {
                // Fetch orders excluding cart status
                const { data: ordersData, error } = await supabase
                    .from("marketplace_orders")
                    .select(`
            id,
            created_at,
            status,
            total,
            subtotal,
            discount_amount,
            shipping_cost,
            delivery_address,
            delivery_city,
            payment_method,
            store_id
          `)
                    .eq("user_id", user.id)
                    .neq("status", "cart")
                    .order("created_at", { ascending: false });

                if (error) throw error;

                if (!ordersData || ordersData.length === 0) {
                    setOrders([]);
                    setLoading(false);
                    return;
                }

                // Fetch store names and items for each order
                const ordersWithDetails = await Promise.all(
                    ordersData.map(async (order) => {
                        // Get store name
                        const { data: storeData } = await supabase
                            .from("marketplace_stores")
                            .select("nome")
                            .eq("id", order.store_id)
                            .maybeSingle();

                        // Get order items
                        const { data: itemsData } = await supabase
                            .from("marketplace_order_items")
                            .select("id, product_name, product_image, quantity, unit_price, subtotal")
                            .eq("order_id", order.id);

                        return {
                            ...order,
                            store_name: storeData?.nome || "Loja",
                            items: itemsData || [],
                        } as Order;
                    })
                );

                setOrders(ordersWithDetails);
            } catch (error: any) {
                console.error("Error loading orders:", error);
                toast({
                    title: "Erro ao carregar pedidos",
                    description: error.message,
                    variant: "destructive",
                });
            } finally {
                setLoading(false);
            }
        };

        loadOrders();
    }, [user, navigate, toast]);

    const getStatusInfo = (status: string) => {
        switch (status) {
            case "pending":
                return {
                    label: "Aguardando Pagamento",
                    icon: Clock,
                    color: "text-yellow-400",
                    bgColor: "bg-yellow-500/10",
                    borderColor: "border-yellow-500/20",
                };
            case "paid":
                return {
                    label: "Pago",
                    icon: CheckCircle2,
                    color: "text-emerald-400",
                    bgColor: "bg-emerald-500/10",
                    borderColor: "border-emerald-500/20",
                };
            case "shipped":
                return {
                    label: "Enviado",
                    icon: Truck,
                    color: "text-blue-400",
                    bgColor: "bg-blue-500/10",
                    borderColor: "border-blue-500/20",
                };
            case "delivered":
                return {
                    label: "Entregue",
                    icon: CheckCircle2,
                    color: "text-primary",
                    bgColor: "bg-primary/10",
                    borderColor: "border-primary/20",
                };
            default:
                return {
                    label: status,
                    icon: Package,
                    color: "text-muted-foreground",
                    bgColor: "bg-muted/10",
                    borderColor: "border-muted/20",
                };
        }
    };

    const filteredOrders = filter === "all"
        ? orders
        : orders.filter(order => order.status === filter);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Carregando pedidos...</p>
            </div>
        );
    }

    return (
        <div className="safe-bottom-floating-nav min-h-screen bg-background text-foreground pb-20">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <BackIconButton to="/marketplace" />
                        <div className="flex-1">
                            <h1 className="text-2xl font-black uppercase tracking-tight">Meus Pedidos</h1>
                            <p className="text-xs text-muted-foreground font-medium">
                                {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="sticky top-[73px] z-30 bg-background/80 backdrop-blur-xl border-b border-white/5">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        {[
                            { value: "all", label: "Todos" },
                            { value: "pending", label: "Pendentes" },
                            { value: "paid", label: "Pagos" },
                            { value: "shipped", label: "Enviados" },
                            { value: "delivered", label: "Entregues" },
                        ].map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => setFilter(tab.value)}
                                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filter === tab.value
                                        ? "bg-primary text-black"
                                        : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Orders List */}
            <div className="container mx-auto px-4 py-6">
                {filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                        <div className="mb-4 rounded-full bg-muted/50 p-6">
                            <Package className="h-10 w-10 opacity-30" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                            {filter === "all"
                                ? "Você ainda não fez nenhum pedido."
                                : `Nenhum pedido ${getStatusInfo(filter).label.toLowerCase()}.`}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredOrders.map((order) => {
                            const statusInfo = getStatusInfo(order.status);
                            const StatusIcon = statusInfo.icon;

                            return (
                                <Card
                                    key={order.id}
                                    className="overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur-sm hover:border-primary/30 transition-all cursor-pointer"
                                    onClick={() => navigate(`/marketplace/pedido/${order.id}`)}
                                >
                                    <CardContent className="p-4">
                                        {/* Order Header */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-xs font-mono text-muted-foreground">
                                                        #{order.id.slice(0, 8)}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-bold">{order.store_name}</p>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(order.created_at).toLocaleDateString("pt-BR")}
                                                </div>
                                            </div>
                                            <Badge
                                                className={`${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor} border font-black text-[10px] uppercase tracking-wider`}
                                            >
                                                <StatusIcon className="h-3 w-3 mr-1" />
                                                {statusInfo.label}
                                            </Badge>
                                        </div>

                                        {/* Order Items Preview */}
                                        <div className="space-y-2 mb-4">
                                            {order.items.slice(0, 2).map((item) => (
                                                <div key={item.id} className="flex items-center gap-3">
                                                    <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                                                        {item.product_image ? (
                                                            <img
                                                                src={item.product_image}
                                                                alt={item.product_name}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="h-full w-full flex items-center justify-center">
                                                                <Package className="h-5 w-5 text-muted-foreground/30" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium truncate">{item.product_name}</p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {item.quantity}x R$ {item.unit_price.toFixed(2)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            {order.items.length > 2 && (
                                                <p className="text-[10px] text-muted-foreground font-medium">
                                                    +{order.items.length - 2} {order.items.length - 2 === 1 ? "item" : "itens"}
                                                </p>
                                            )}
                                        </div>

                                        {/* Order Total */}
                                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                Total
                                            </span>
                                            <span className="text-lg font-black text-primary">
                                                R$ {order.total.toFixed(2)}
                                            </span>
                                        </div>

                                        {/* Delivery Info */}
                                        {order.delivery_city && (
                                            <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                                                <MapPin className="h-3 w-3" />
                                                {order.delivery_city}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            <FloatingNavIsland />
        </div>
    );
}
