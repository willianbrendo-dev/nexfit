import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Clock, CheckCircle2, Truck, MapPin, Calendar, Store, CreditCard, Tag, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPaymentByReference, checkPixPaymentStatus } from "@/lib/pixPaymentTracking";
import { QrCode, Copy, ExternalLink, Loader2 } from "lucide-react";
import QRCodeLib from "qrcode";

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
    pix_payload: string | null;
    store_id: string;
    store_name?: string;
    items: OrderItem[];
}

export default function MarketplaceOrderDetailPage() {
    const { orderId } = useParams<{ orderId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [paymentInfo, setPaymentInfo] = useState<any>(null);
    const [verifyingPayment, setVerifyingPayment] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user || !orderId) {
            navigate("/auth");
            return;
        }

        const loadOrder = async () => {
            try {
                // Fetch order details
                const { data: orderData, error: orderError } = await supabase
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
            pix_payload,
            store_id
          `)
                    .eq("id", orderId)
                    .eq("user_id", user.id)
                    .maybeSingle();

                if (orderError) throw orderError;
                if (!orderData) {
                    toast({
                        title: "Pedido não encontrado",
                        variant: "destructive",
                    });
                    navigate("/marketplace/pedidos");
                    return;
                }

                // Get store name
                const { data: storeData } = await supabase
                    .from("marketplace_stores")
                    .select("nome")
                    .eq("id", orderData.store_id)
                    .maybeSingle();

                // Get order items
                const { data: itemsData } = await supabase
                    .from("marketplace_order_items")
                    .select("id, product_name, product_image, quantity, unit_price, subtotal")
                    .eq("order_id", orderId);

                setOrder({
                    ...orderData,
                    store_name: storeData?.nome || "Loja",
                    items: itemsData || [],
                } as Order);
            } catch (error: any) {
                console.error("Error loading order:", error);
                toast({
                    title: "Erro ao carregar pedido",
                    description: error.message,
                    variant: "destructive",
                });
                navigate("/marketplace/pedidos");
            } finally {
                setLoading(false);
            }
        };

        loadOrder();
    }, [orderId, user, navigate, toast]);

    useEffect(() => {
        if (order?.status === "pending") {
            const loadPayment = async () => {
                try {
                    const payment = await getPaymentByReference(order.id, "marketplace_order");
                    if (payment) {
                        setPaymentInfo(payment);
                        if (payment.pix_qr_code) {
                            setQrCodeUrl(payment.pix_qr_code);
                        } else if (payment.pix_payload) {
                            const url = await QRCodeLib.toDataURL(payment.pix_payload);
                            setQrCodeUrl(url);
                        }
                    }
                } catch (error) {
                    console.error("Error loading payment info:", error);
                }
            };
            loadPayment();
        }
    }, [order]);

    const handleVerifyPayment = async () => {
        if (!paymentInfo?.id) return;
        setVerifyingPayment(true);
        try {
            const status = await checkPixPaymentStatus(paymentInfo.id);
            if (status === "paid") {
                toast({ title: "Pagamento confirmado!" });
                window.location.reload(); // Simple way to refresh status
            } else {
                toast({ title: "Pagamento ainda pendente." });
            }
        } catch (error: any) {
            toast({ title: "Erro ao verificar", description: error.message, variant: "destructive" });
        } finally {
            setVerifyingPayment(false);
        }
    };

    const handleCopyPix = async () => {
        if (!paymentInfo?.pix_payload) return;
        await navigator.clipboard.writeText(paymentInfo.pix_payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "Copiado!" });
    };

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

    const getStatusTimeline = (status: string) => {
        const steps = [
            { key: "pending", label: "Pedido Criado", icon: ShoppingBag },
            { key: "paid", label: "Pagamento Confirmado", icon: CreditCard },
            { key: "shipped", label: "Em Transporte", icon: Truck },
            { key: "delivered", label: "Entregue", icon: CheckCircle2 },
        ];

        const statusOrder = ["pending", "paid", "shipped", "delivered"];
        const currentIndex = statusOrder.indexOf(status);

        return steps.map((step, index) => ({
            ...step,
            completed: index <= currentIndex,
            active: index === currentIndex,
        }));
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Carregando pedido...</p>
            </div>
        );
    }

    if (!order) {
        return null;
    }

    const statusInfo = getStatusInfo(order.status);
    const StatusIcon = statusInfo.icon;
    const timeline = getStatusTimeline(order.status);

    return (
        <div className="safe-bottom-floating-nav min-h-screen bg-background text-foreground pb-20">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <BackIconButton to="/marketplace/pedidos" />
                        <div className="flex-1">
                            <h1 className="text-2xl font-black uppercase tracking-tight">Detalhes do Pedido</h1>
                            <p className="text-xs text-muted-foreground font-mono">
                                #{order.id.slice(0, 8)}
                            </p>
                        </div>
                        <Badge
                            className={`${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor} border font-black text-[10px] uppercase tracking-wider`}
                        >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6 space-y-4">
                {/* Timeline */}
                <Card className="border-white/5 bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-6">
                        <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Package className="h-4 w-4 text-primary" />
                            Status do Pedido
                        </h2>
                        <div className="space-y-4">
                            {timeline.map((step, index) => {
                                const StepIcon = step.icon;
                                return (
                                    <div key={step.key} className="flex items-start gap-4">
                                        <div className="relative">
                                            <div
                                                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${step.completed
                                                    ? "border-primary bg-primary/20"
                                                    : "border-white/10 bg-white/5"
                                                    }`}
                                            >
                                                <StepIcon
                                                    className={`h-5 w-5 ${step.completed ? "text-primary" : "text-muted-foreground"
                                                        }`}
                                                />
                                            </div>
                                            {index < timeline.length - 1 && (
                                                <div
                                                    className={`absolute left-1/2 top-10 h-8 w-0.5 -translate-x-1/2 ${step.completed ? "bg-primary/30" : "bg-white/5"
                                                        }`}
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1 pt-2">
                                            <p
                                                className={`text-sm font-semibold ${step.completed ? "text-foreground" : "text-muted-foreground"
                                                    }`}
                                            >
                                                {step.label}
                                            </p>
                                            {step.active && (
                                                <p className="text-xs text-primary mt-1">Em andamento</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Store Info */}
                <Card className="border-white/5 bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                                <Store className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Loja</p>
                                <p className="text-sm font-bold">{order.store_name}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Order Items */}
                <Card className="border-white/5 bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4 text-primary" />
                            Produtos ({order.items.length})
                        </h2>
                        <div className="space-y-3">
                            {order.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                    <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                                        {item.product_image ? (
                                            <img
                                                src={item.product_image}
                                                alt={item.product_name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center">
                                                <Package className="h-6 w-6 text-muted-foreground/30" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">{item.product_name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.quantity}x R$ {item.unit_price.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-primary">
                                            R$ {item.subtotal.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Delivery Info */}
                {order.delivery_city && (
                    <Card className="border-white/5 bg-white/[0.02] backdrop-blur-sm">
                        <CardContent className="p-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-primary" />
                                Endereço de Entrega
                            </h2>
                            <div className="space-y-1">
                                <p className="text-sm text-foreground">{order.delivery_address}</p>
                                <p className="text-sm text-muted-foreground">{order.delivery_city}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Order Summary */}
                <Card className="border-white/5 bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Tag className="h-4 w-4 text-primary" />
                            Resumo do Pedido
                        </h2>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal</span>
                                <span>R$ {order.subtotal.toFixed(2)}</span>
                            </div>
                            {order.discount_amount > 0 && (
                                <div className="flex justify-between text-primary">
                                    <span>Desconto</span>
                                    <span>- R$ {order.discount_amount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-muted-foreground">
                                <span>Frete</span>
                                <span>{order.shipping_cost > 0 ? `R$ ${order.shipping_cost.toFixed(2)}` : "Grátis"}</span>
                            </div>
                            <div className="flex justify-between border-t border-white/5 pt-2 text-base font-bold text-foreground">
                                <span>Total</span>
                                <span className="text-primary">R$ {order.total.toFixed(2)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Order Date */}
                <Card className="border-white/5 bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Pedido realizado em {new Date(order.created_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Pending Payment Section */}
                {order.status === "pending" && paymentInfo && (
                    <Card className="border-primary/30 bg-primary/5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]">
                        <CardContent className="p-6 text-center space-y-4">
                            <h2 className="text-lg font-black uppercase italic tracking-tighter text-primary flex items-center justify-center gap-2">
                                <Clock className="h-5 w-5 animate-pulse" />
                                Pagamento Pendente
                            </h2>

                            {paymentInfo.payment_method === 'pix' ? (
                                <>
                                    {qrCodeUrl && (
                                        <div className="mx-auto w-48 h-48 bg-white p-2 rounded-2xl shadow-xl">
                                            <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground max-w-[200px] mx-auto uppercase font-bold tracking-tight">
                                        Escaneie o QR Code ou use o Pix Copia e Cola abaixo
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 rounded-xl h-11 font-bold border-white/10"
                                            onClick={handleCopyPix}
                                        >
                                            {copied ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                                            {copied ? "Copiado!" : "Copiar Pix"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="flex-1 rounded-xl h-11 font-bold shadow-lg shadow-primary/20"
                                            onClick={handleVerifyPayment}
                                            disabled={verifyingPayment}
                                        >
                                            {verifyingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                            Já paguei
                                        </Button>
                                    </div>
                                </>
                            ) : paymentInfo.payment_url ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground uppercase font-bold">Pagamento via Cartão</p>
                                    <Button
                                        className="w-full h-12 rounded-xl font-bold bg-[#009ee3] hover:bg-[#008ad0] text-white shadow-lg shadow-blue-500/20"
                                        onClick={() => window.open(paymentInfo.payment_url, '_blank')}
                                    >
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        Concluir no Mercado Pago
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[10px] text-muted-foreground uppercase tracking-widest"
                                        onClick={handleVerifyPayment}
                                        disabled={verifyingPayment}
                                    >
                                        {verifyingPayment ? "Verificando..." : "Verificar status agora"}
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">
                                    Informações de pagamento indisponíveis no momento.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Actions */}
                <div className="space-y-2">
                    <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => navigate(`/marketplace/loja/${order.store_id}`)}
                    >
                        <Store className="h-4 w-4 mr-2" />
                        Visitar Loja
                    </Button>
                    <Button
                        className="w-full"
                        variant="ghost"
                        onClick={() => navigate("/marketplace/pedidos")}
                    >
                        Ver Todos os Pedidos
                    </Button>
                </div>
            </div>

            <FloatingNavIsland />
        </div>
    );
}
