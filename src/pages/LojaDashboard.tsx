import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LojaFloatingNavIsland } from "@/components/navigation/LojaFloatingNavIsland";
import { StoreNotificationCenter } from "@/components/store/StoreNotificationCenter";
import { Package, DollarSign, TrendingUp, ShoppingBag, LogOut, Clock, CheckCircle2, XCircle, ChevronRight, User } from "lucide-react";

interface StoreInfo {
  id: string;
  nome: string;
  profile_image_url: string | null;
  banner_image_url: string | null;
  subscription_plan: string | null;
}

interface OrderRow {
  id: string;
  status: string;
  total: number;
  created_at: string;
  delivery_city: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "text-yellow-400", icon: Clock },
  accepted: { label: "Aceito", color: "text-[#56FF02]", icon: CheckCircle2 },
  rejected: { label: "Rejeitado", color: "text-red-500", icon: XCircle },
  cart: { label: "Carrinho", color: "text-zinc-500", icon: ShoppingBag },
};

const LojaDashboardPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [productCount, setProductCount] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [abandonedCarts, setAbandonedCarts] = useState<any[]>([]);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    document.title = "Painel do Lojista - Nexfit";
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const { data: storeData, error } = await supabase
        .from("marketplace_stores")
        .select("id, nome, profile_image_url, banner_image_url, subscription_plan")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (error) {
        toast({ title: "Erro ao carregar loja", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (!storeData) {
        setLoading(false);
        return;
      }

      setStore(storeData as StoreInfo);
      setIsPro(true); // Always unlocked

      // Count products
      const { count: pCount } = await supabase
        .from("marketplace_products")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeData.id);

      setProductCount(pCount ?? 0);

      // Fetch orders (non-cart)
      const { data: ordersData } = await (supabase as any)
        .from("marketplace_orders")
        .select("id, status, total, created_at, delivery_city")
        .eq("store_id", storeData.id)
        .neq("status", "cart")
        .order("created_at", { ascending: false })
        .limit(50);

      const ordersList = (ordersData ?? []) as OrderRow[];
      setOrders(ordersList);

      // Calculate revenue from accepted orders
      const acceptedOrders = ordersList.filter((o) => o.status === "accepted");
      const total = acceptedOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
      setTotalRevenue(total);

      // Monthly revenue
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthOrders = acceptedOrders.filter((o) => o.created_at >= startOfMonth);
      const monthTotal = monthOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
      setMonthRevenue(monthTotal);

      // Fetch abandoned carts (last_cart_activity < 24h)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const { data: abandonedData } = await (supabase as any)
        .from("marketplace_orders")
        .select(`
          id, 
          last_cart_activity, 
          status,
          user:profiles(id, nome, avatar_url, whatsapp)
        `)
        .eq("store_id", storeData.id)
        .eq("status", "cart")
        .lt("last_cart_activity", oneDayAgo.toISOString())
        .order("last_cart_activity", { ascending: false });

      if (abandonedData) {
        setAbandonedCarts(abandonedData);
      }

      setLoading(false);
    };
    void load();
  }, [user, toast]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </main>
    );
  }

  if (!store) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-center">
        <p className="text-sm text-zinc-400">
          Nenhuma loja vinculada à sua conta. Contate o Admin Master.
        </p>
        <LojaFloatingNavIsland />
      </main>
    );
  }

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const recentOrders = orders.slice(0, 10);

  const stats = [
    { icon: DollarSign, label: "Faturamento total", value: `R$ ${totalRevenue.toFixed(2)}`, color: "text-primary" },
    { icon: TrendingUp, label: "Faturamento mensal", value: `R$ ${monthRevenue.toFixed(2)}`, color: "text-primary" },
    { icon: ShoppingBag, label: "Pedidos pendentes", value: String(pendingOrders.length), color: "text-yellow-400" },
    { icon: Package, label: "Produtos ativos", value: String(productCount), color: "text-primary" },
    { icon: Clock, label: "Carrinhos abandonados", value: String(abandonedCarts.length), color: "text-orange-400" },
  ];

  return (
    <main className="min-h-screen bg-black pb-28 safe-bottom-floating-nav">
      {/* Premium Header Card */}
      <section className="relative px-4 pt-4">
        <div className="relative flex min-h-[140px] flex-col justify-end overflow-hidden rounded-[32px] border border-white/5 bg-white/[0.03] p-6 backdrop-blur-xl">
          {store.banner_image_url && (
            <div className="absolute inset-0 z-0">
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              <img src={store.banner_image_url} alt="Banner" className="h-full w-full object-cover opacity-60" />
            </div>
          )}

          <div className="relative z-10 flex items-end gap-4">
            <div className="relative h-20 w-20 rounded-2xl border-2 border-white/10 bg-black/40 backdrop-blur-md overflow-hidden shadow-2xl">
              {store.profile_image_url ? (
                <img src={store.profile_image_url} alt={store.nome} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-primary" />
                </div>
              )}
            </div>
            <div className="flex-1 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">Painel do Lojista</p>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight leading-none drop-shadow-md">{store.nome}</h1>
            </div>

            <div className="flex items-center gap-2">
              <StoreNotificationCenter />
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/auth", { replace: true });
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 px-4 mt-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-md transition-all hover:bg-white/[0.06]">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                  <span className="text-[9px] uppercase tracking-wider text-zinc-400">{stat.label}</span>
                </div>
                <p className="text-xl font-black text-white">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <section className="mt-8 px-4">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-400">
            <Clock className="h-4 w-4 text-yellow-400" />
            Aguardando Ação ({pendingOrders.length})
          </h2>
          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <OrderCard key={order.id} order={order} storeId={store.id} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Orders */}
      <section className="mt-8 px-4">
        <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-zinc-400">Pedidos Recentes</h2>
        {recentOrders.length === 0 ? (
          <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-8 text-center backdrop-blur-md">
            <p className="text-xs text-zinc-500">
              Nenhum pedido recente. Os pedidos aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <OrderCard key={order.id} order={order} storeId={store.id} navigate={navigate} />
            ))}
          </div>
        )}
      </section>

      {/* Abandoned Carts Section */}
      <section className="mt-8 px-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-orange-400" />
            Carrinhos Abandonados
          </h2>
          {!isPro && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">PRO</span>
          )}
        </div>

        {abandonedCarts.length === 0 ? (
          <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-8 text-center backdrop-blur-md">
            <p className="text-xs text-zinc-500">Nenhum carrinho abandonado detectado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {abandonedCarts.slice(0, 5).map((cart) => (
              <AbandonedCartCard
                key={cart.id}
                cart={cart}
                isPro={isPro}
                navigate={navigate}
              />
            ))}
          </div>
        )}
        {!isPro && abandonedCarts.length > 0 && (
          <button
            className="w-full mt-4 flex items-center justify-center rounded-xl bg-primary/10 py-3 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary/20 transition-colors"
            onClick={() => navigate("/loja/plano")}
          >
            Upgrade para recuparar vendas
          </button>
        )}
      </section>

      <LojaFloatingNavIsland />
    </main >
  );
};

function OrderCard({ order, storeId, navigate }: { order: OrderRow; storeId: string; navigate: any }) {
  const statusInfo = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;
  const StatusIcon = statusInfo.icon;
  const date = new Date(order.created_at);
  const formatted = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div
      className="group cursor-pointer overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] active:scale-[0.98]"
      onClick={() => navigate(`/loja/pedido/${order.id}`)}
    >
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ${statusInfo.color}`}>
          <StatusIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-white">
            R$ {order.total.toFixed(2)}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {formatted} • {order.delivery_city || "Sem cidade"}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-white/5 ${statusInfo.color}`}>
          {statusInfo.label}
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-white transition-colors" />
      </div>
    </div>
  );
}

function AbandonedCartCard({ cart, isPro, navigate }: any) {
  const date = new Date(cart.last_cart_activity);
  const formatted = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const userName = cart.user?.nome || "Aluno";
  const userAvatar = cart.user?.avatar_url;
  const userWhatsapp = cart.user?.whatsapp;

  const handleNotify = (e: any) => {
    e.stopPropagation();
    if (!isPro) {
      navigate("/loja/plano");
      return;
    }
    if (!userWhatsapp) return;

    const message = `Olá ${userName}! Notamos que você deixou alguns itens no carrinho em nossa loja. Posso te ajudar a finalizar sua compra?`;
    window.open(`https://wa.me/55${userWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-white/10">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/10">
              <User className="h-5 w-5 text-zinc-400" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{userName}</p>
          <p className="text-[10px] text-zinc-500">Abandono em {formatted}</p>
        </div>
        <button
          className={`flex h-8 items-center rounded-lg px-3 text-[10px] font-bold uppercase tracking-wider transition-all
            ${isPro
              ? "bg-primary text-black hover:bg-primary/90"
              : "bg-white/5 text-zinc-500 cursor-not-allowed"}`}
          onClick={handleNotify}
        >
          {isPro ? "Recuperar" : "Bloqueado"}
        </button>
      </div>
    </div>
  );
}

export default LojaDashboardPage;
