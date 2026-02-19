import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useToast } from "@/hooks/use-toast";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2, Ticket, ShieldCheck, Truck, MapPin, QrCode, Copy, CheckCircle2, Loader2, CreditCard, ExternalLink } from "lucide-react";
import { buildPixPayload } from "@/lib/pix";
import * as QRCodeLib from "qrcode";
import { createPixPayment, checkPixPaymentStatus } from "@/lib/pixPaymentTracking";
import mercadoPagoLogo from "@/assets/mercado-pago.png";

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product_name: string;
  product_image: string | null;
}

interface Coupon {
  id: string;
  discount_percent: number;
  free_shipping: boolean;
}

interface PixConfig {
  pix_key: string;
  receiver_name: string;
  city: string;
}

export default function MarketplaceCartPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useAuth();
  const { plan } = useUserPlan();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [orderId, setOrderId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("");
  const [storeCity, setStoreCity] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showCoupons, setShowCoupons] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [storeShippingCost, setStoreShippingCost] = useState(0);
  const [couponsUsedThisMonth, setCouponsUsedThisMonth] = useState(0);
  const [vipCouponInput, setVipCouponInput] = useState("");
  const [isVipCouponApplied, setIsVipCouponApplied] = useState(false);
  const [gpsCity, setGpsCity] = useState<string | null>(null);
  const [fetchingGps, setFetchingGps] = useState(false);

  // Delivery
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Checkout / PIX
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout">("cart");
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pixConfig, setPixConfig] = useState<PixConfig | null>(null);
  const [pixPaymentId, setPixPaymentId] = useState<string | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | null>(null);

  const hasCouponAccess = plan === "ADVANCE" || plan === "ELITE";

  useEffect(() => {
    document.title = "Carrinho - Nexfit Marketplace";
  }, []);

  // Auto-verify payment with polling when payment is pending
  useEffect(() => {
    if (!pixPaymentId || paymentStatus !== "pending") return;

    console.log("[Cart] Starting auto-verification polling for payment:", pixPaymentId);

    const pollInterval = setInterval(async () => {
      try {
        console.log("[Cart] Polling payment status...");
        const status = await checkPixPaymentStatus(pixPaymentId);

        if (status === "paid") {
          console.log("[Cart] Payment confirmed via polling!");
          setPaymentStatus("paid");

          // Update order status
          if (orderId) {
            await (supabase as any)
              .from("marketplace_orders")
              .update({ status: "paid" })
              .eq("id", orderId);
          }

          toast({
            title: "Pagamento confirmado!",
            description: "Seu pedido está sendo processado.",
          });

          clearInterval(pollInterval);

          // Navigate to orders page after a short delay
          setTimeout(() => {
            navigate("/marketplace/pedidos");
          }, 2000);
        }
      } catch (error) {
        console.error("[Cart] Error polling payment:", error);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      console.log("[Cart] Cleaning up polling interval");
      clearInterval(pollInterval);
    };
  }, [pixPaymentId, paymentStatus, orderId, navigate, toast]);

  // Realtime subscription for instant payment confirmation
  useEffect(() => {
    if (!pixPaymentId) return;

    console.log("[Cart] Setting up Realtime subscription for payment:", pixPaymentId);

    const channel = supabase
      .channel(`pix_payment_${pixPaymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pix_payments',
          filter: `id=eq.${pixPaymentId}`
        },
        async (payload) => {
          console.log("[Cart] Realtime update received:", payload);
          const newStatus = (payload.new as any).status;

          if (newStatus === "paid" && paymentStatus !== "paid") {
            console.log("[Cart] Payment confirmed via Realtime!");
            setPaymentStatus("paid");

            // Update order status
            if (orderId) {
              await (supabase as any)
                .from("marketplace_orders")
                .update({ status: "paid" })
                .eq("id", orderId);
            }

            toast({
              title: "Pagamento confirmado!",
              description: "Seu pedido está sendo processado.",
            });

            // Navigate to orders page after a short delay
            setTimeout(() => {
              navigate("/marketplace/pedidos");
            }, 2000);
          }
        }
      )
      .subscribe();

    return () => {
      console.log("[Cart] Cleaning up Realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [pixPaymentId, paymentStatus, orderId, navigate, toast]);

  useEffect(() => {
    const load = async () => {
      if (!user || !storeId) return;

      // Get store info
      const { data: storeData } = await (supabase as any)
        .from("marketplace_stores")
        .select("nome, city, shipping_cost")
        .eq("id", storeId)
        .maybeSingle();
      if (storeData) {
        setStoreName(storeData.nome);
        setStoreCity((storeData as any).city ?? null);
        setStoreShippingCost((storeData as any).shipping_cost ?? 0);
      }

      // Get cart order
      const { data: order } = await (supabase as any)
        .from("marketplace_orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("store_id", storeId)
        .eq("status", "cart")
        .maybeSingle();

      if (!order) {
        setLoading(false);
        return;
      }

      setOrderId(order.id);

      // Get cart items (product info denormalized in order_items)
      const { data: cartItems } = await (supabase as any)
        .from("marketplace_order_items")
        .select("id, product_id, quantity, unit_price, subtotal, product_name, product_image")
        .eq("order_id", order.id);

      if (cartItems && cartItems.length > 0) {
        setItems(cartItems as CartItem[]);
      }

      // Load available coupons
      if (hasCouponAccess) {
        const { data: couponData } = await (supabase as any)
          .from("marketplace_coupons")
          .select("id, discount_percent, free_shipping")
          .eq("user_id", user.id)
          .is("used_at", null)
          .gte("expires_at", new Date().toISOString())
          .limit(10);

        if (couponData) setCoupons(couponData);
      }

      // Load store pix config
      const { data: pixData } = await (supabase as any)
        .from("pix_configs")
        .select("pix_key, receiver_name, bank_name")
        .or(`store_id.eq.${storeId},marketplace_store_id.eq.${storeId}`)
        .maybeSingle();

      if (pixData?.pix_key) {
        setPixConfig({
          pix_key: pixData.pix_key,
          receiver_name: pixData.receiver_name || storeName,
          city: (storeData as any)?.city || "BRASIL",
        });
      }

      // Fetch coupons used this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await (supabase as any)
        .from("marketplace_coupons")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("used_at", startOfMonth.toISOString());

      setCouponsUsedThisMonth(count || 0);

      // Attempt GPS check
      if ("geolocation" in navigator) {
        setFetchingGps(true);
        navigator.geolocation.getCurrentPosition(async (position) => {
          try {
            // Simplified reverse geocoding approach or just use a placeholder
            // In a real app, we'd call an API here. 
            // For now, let's assume if the user is 0,0 it's a test, otherwise we'd need an API.
            // I'll add a mock city based on existence of position for demo.
            setGpsCity(null); // Will fill if we had an API
          } catch (e) { } finally { setFetchingGps(false); }
        }, () => setFetchingGps(false));
      }

      setLoading(false);
    };
    void load();
  }, [user, storeId, hasCouponAccess]);

  const updateQuantity = async (item: CartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) return removeItem(item);

    await (supabase as any)
      .from("marketplace_order_items")
      .update({ quantity: newQty, subtotal: newQty * item.unit_price })
      .eq("id", item.id);

    // Update cart activity
    if (orderId) {
      await (supabase as any)
        .from("marketplace_orders")
        .update({ last_cart_activity: new Date().toISOString() })
        .eq("id", orderId);
    }

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, quantity: newQty, subtotal: newQty * item.unit_price } : i
      )
    );
  };

  const removeItem = async (item: CartItem) => {
    await (supabase as any).from("marketplace_order_items").delete().eq("id", item.id);

    // Update cart activity
    if (orderId) {
      await (supabase as any)
        .from("marketplace_orders")
        .update({ last_cart_activity: new Date().toISOString() })
        .eq("id", orderId);
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const discountAmount = selectedCoupon ? subtotal * (selectedCoupon.discount_percent / 100) : 0;

  // Logic Improvements:
  const isVipElite = selectedCoupon?.id === "VIPELITE";
  const isSameCity = (storeCity && deliveryCity.trim().toLowerCase() === storeCity.toLowerCase()) ||
    (storeCity && gpsCity && gpsCity.toLowerCase() === storeCity.toLowerCase());

  const freeShipping = (isVipElite && plan === "ELITE") || (plan === "ELITE" && isSameCity);
  const shippingCost = (plan === "FREE") ? storeShippingCost : (freeShipping ? 0 : storeShippingCost);

  const total = subtotal - discountAmount + shippingCost;

  const handleProceedToCheckout = () => {
    if (!deliveryAddress.trim()) {
      toast({ title: "Informe o endereço de entrega", variant: "destructive" });
      return;
    }
    if (!deliveryCity.trim()) {
      toast({ title: "Informe a cidade", variant: "destructive" });
      return;
    }

    setCheckoutStep("checkout");
  };

  const handleCopyPix = async () => {
    if (!pixPayload) return;
    await navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Código Pix copiado!" });
  };

  const handleConfirmOrder = async () => {
    if (!orderId || !user || !storeId) return;
    setSubmitting(true);

    try {
      // 1. Update order with address and totals
      await (supabase as any)
        .from("marketplace_orders")
        .update({
          subtotal,
          discount_amount: discountAmount,
          shipping_cost: shippingCost,
          total,
          status: "pending",
          coupon_id: selectedCoupon?.id ?? null,
          delivery_address: deliveryAddress.trim(),
          delivery_city: deliveryCity.trim(),
          payment_method: paymentMethod,
        })
        .eq("id", orderId);

      // 2. Create automated payment via Unified Service
      console.log("[Cart] Creating payment via service:", paymentMethod);
      const result = await createPixPayment({
        userId: user.id,
        userEmail: user.email,
        userName: user.user_metadata?.full_name || user.user_metadata?.nome || "Cliente",
        amount: total,
        paymentType: "marketplace_order",
        referenceId: orderId,
        description: `Pedido ${storeName} #${orderId.slice(0, 8)}`,
        paymentMethod: paymentMethod,
      });

      // 3. Update state with payment info
      setPixPaymentId(result.paymentId);
      setPixPayload(result.pixPayload);
      setPixQrDataUrl(result.pixQrCode);
      setPaymentUrl(result.paymentUrl || null);
      setPaymentStatus("pending");

      // 4. Mark coupon as used
      if (selectedCoupon && !isVipCouponApplied) {
        await (supabase as any)
          .from("marketplace_coupons")
          .update({ used_at: new Date().toISOString(), order_id: orderId })
          .eq("id", selectedCoupon.id);
      }

      toast({
        title: "Pedido criado!",
        description: paymentMethod === 'pix' ? "Aguardando pagamento PIX." : "Aguardando pagamento via cartão."
      });
    } catch (error: any) {
      console.error("Error confirming order:", error);
      toast({ title: "Erro ao finalizar pedido", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!pixPaymentId || !orderId) return;
    setVerifyingPayment(true);

    try {
      const status = await checkPixPaymentStatus(pixPaymentId);

      if (status === "paid") {
        setPaymentStatus("paid");

        // Update order status
        await (supabase as any)
          .from("marketplace_orders")
          .update({ status: "paid" })
          .eq("id", orderId);

        toast({
          title: "Pagamento confirmado!",
          description: "Seu pedido está sendo processado.",
        });

        // Navigate to orders page after a short delay
        setTimeout(() => {
          navigate("/marketplace/pedidos");
        }, 2000);
      } else {
        toast({
          title: "Pagamento pendente",
          description: "Ainda não identificamos seu pagamento. Tente novamente em alguns instantes.",
          variant: "default"
        });
      }
    } catch (error: any) {
      console.error("Error verifying payment:", error);
      toast({
        title: "Erro ao verificar pagamento",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setVerifyingPayment(false);
    }
  };


  const applyVipCoupon = () => {
    if (couponsUsedThisMonth >= 10) {
      toast({ title: "Limite atingido", description: "Você já usou seus 10 cupons mensais.", variant: "destructive" });
      return;
    }

    const code = vipCouponInput.toUpperCase().trim();
    if (code === "VIPADVANCE" && (plan === "ADVANCE" || plan === "ELITE")) {
      setSelectedCoupon({ id: "VIPADVANCE", discount_percent: 5, free_shipping: false });
      setIsVipCouponApplied(true);
      toast({ title: "VIP ADVANCE aplicado! 5% OFF" });
    } else if (code === "VIPELITE" && plan === "ELITE") {
      setSelectedCoupon({ id: "VIPELITE", discount_percent: 10, free_shipping: true });
      setIsVipCouponApplied(true);
      toast({ title: "VIP ELITE aplicado! 10% OFF + Frete Grátis" });
    } else {
      toast({ title: "Cupom inválido", description: "Verifique o código ou seu plano.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando carrinho...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 pb-32 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <BackIconButton to={checkoutStep === "checkout" ? undefined : `/marketplace/loja/${storeId}`} onClick={checkoutStep === "checkout" ? () => setCheckoutStep("cart") : undefined} />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {checkoutStep === "checkout" ? "Checkout" : "Carrinho"}
          </p>
          <h1 className="text-xl font-semibold text-foreground">{storeName}</h1>
        </div>
      </header>

      {items.length === 0 ? (
        <Card className="border-border/50 bg-card/30">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Seu carrinho está vazio.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate(`/marketplace/loja/${storeId}`)}>
              Voltar à loja
            </Button>
          </CardContent>
        </Card>
      ) : checkoutStep === "cart" ? (
        <CartView
          items={items}
          updateQuantity={updateQuantity}
          removeItem={removeItem}
          hasCouponAccess={hasCouponAccess}
          coupons={coupons}
          selectedCoupon={selectedCoupon}
          setSelectedCoupon={setSelectedCoupon}
          showCoupons={showCoupons}
          setShowCoupons={setShowCoupons}
          subtotal={subtotal}
          discountAmount={discountAmount}
          freeShipping={!!freeShipping}
          total={total}
          deliveryCity={deliveryCity}
          setDeliveryCity={setDeliveryCity}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          storeCity={storeCity}
          onProceed={handleProceedToCheckout}
          toast={toast}
          vipCouponInput={vipCouponInput}
          setVipCouponInput={setVipCouponInput}
          applyVipCoupon={applyVipCoupon}
          couponsUsedThisMonth={couponsUsedThisMonth}
          shippingCost={shippingCost}
          gpsCity={gpsCity}
          fetchingGps={fetchingGps}
          plan={plan}
          isVipCouponApplied={isVipCouponApplied}
        />
      ) : (
        <CheckoutView
          items={items}
          subtotal={subtotal}
          discountAmount={discountAmount}
          selectedCoupon={selectedCoupon}
          freeShipping={!!freeShipping}
          total={total}
          deliveryAddress={deliveryAddress}
          deliveryCity={deliveryCity}
          pixPayload={pixPayload}
          pixQrDataUrl={pixQrDataUrl}
          copied={copied}
          onCopyPix={handleCopyPix}
          onConfirm={handleConfirmOrder}
          submitting={submitting}
          pixConfig={pixConfig}
          shippingCost={shippingCost}
          paymentStatus={paymentStatus}
          onVerifyPayment={handleVerifyPayment}
          verifyingPayment={verifyingPayment}
        />
      )}
      <FloatingNavIsland />
    </div>
  );
}

/* ============ Cart View ============ */
function CartView({
  items, updateQuantity, removeItem,
  hasCouponAccess, coupons, selectedCoupon, setSelectedCoupon, showCoupons, setShowCoupons,
  subtotal, discountAmount, freeShipping, total,
  deliveryCity, setDeliveryCity, deliveryAddress, setDeliveryAddress,
  storeCity, onProceed, toast,
  vipCouponInput, setVipCouponInput, applyVipCoupon, couponsUsedThisMonth,
  shippingCost, gpsCity, fetchingGps, plan, isVipCouponApplied
}: any) {
  return (
    <div className="space-y-4">
      {/* Items */}
      <div className="space-y-2">
        {items.map((item: CartItem) => (
          <Card key={item.id} className="border-border/50 bg-card/30">
            <CardContent className="flex items-center gap-3 py-3">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {item.product_image ? (
                  <img src={item.product_image} alt={item.product_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">Img</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{item.product_name}</p>
                <p className="text-xs text-primary font-semibold">R$ {item.unit_price.toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => updateQuantity(item, -1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:text-foreground">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                <button onClick={() => updateQuantity(item, 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeItem(item)} className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delivery */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            Endereço de entrega
          </div>
          <div className="space-y-2">
            <Input placeholder="Endereço completo" value={deliveryAddress} onChange={(e: any) => setDeliveryAddress(e.target.value)} />
            <Input placeholder="Cidade" value={deliveryCity} onChange={(e: any) => setDeliveryCity(e.target.value)} />
          </div>
          {storeCity && deliveryCity.trim() && (
            <p className="text-xs text-primary">
              {deliveryCity.trim().toLowerCase() === storeCity.toLowerCase()
                ? "✓ Mesma cidade da loja — frete reduzido ou grátis disponível"
                : `Loja em ${storeCity} — frete padrão aplicado`}
            </p>
          )}
          {gpsCity && storeCity && (
            <p className="text-[10px] text-primary flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> GPS confirma: você está em {gpsCity}.
            </p>
          )}
        </CardContent>
      </Card>

      {hasCouponAccess && (
        <Card className="border-primary/30 bg-primary/5 shadow-inner">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Ticket className="h-4 w-4 text-primary animate-pulse" />
                Cupom VIP Mensal ({10 - couponsUsedThisMonth} restantes)
              </div>
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{plan}</Badge>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Ticket className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/40" />
                <Input
                  placeholder="VIPADVANCE ou VIPELITE"
                  value={vipCouponInput}
                  onChange={(e: any) => setVipCouponInput(e.target.value)}
                  className="bg-background/50 h-9 pl-9 text-sm border-primary/20 focus:border-primary transition-all"
                />
              </div>
              <Button size="sm" onClick={applyVipCoupon} className="font-bold shadow-md shadow-primary/20">
                Aplicar
              </Button>
            </div>

            {isVipCouponApplied && selectedCoupon && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/20 p-2 border border-primary/40 animate-in fade-in zoom-in duration-300">
                <div className="bg-primary rounded-full p-1">
                  <CheckCircle2 className="h-3 w-3 text-background" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-primary leading-tight">CUPOM {selectedCoupon.id} ATIVADO!</p>
                  <p className="text-[10px] text-primary/80">-{selectedCoupon.discount_percent}% OFF {selectedCoupon.free_shipping ? "+ Frete Grátis" : ""}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coupon Section */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="py-4">
          <button
            type="button"
            onClick={() => {
              if (!hasCouponAccess) {
                toast({ title: "Cupons indisponíveis", description: "Upgrade para Advance ou Elite.", variant: "destructive" });
                return;
              }
              setShowCoupons(!showCoupons);
            }}
            className="flex w-full items-center gap-2 text-sm"
          >
            <Ticket className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">
              {selectedCoupon ? `Cupom ${selectedCoupon.discount_percent}% aplicado` : "Usar cupom de desconto"}
            </span>
            {!hasCouponAccess && <Badge variant="secondary" className="ml-auto text-[10px]">Premium</Badge>}
          </button>

          {showCoupons && hasCouponAccess && (
            <div className="mt-3 space-y-2">
              {coupons.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum cupom disponível.</p>
              ) : (
                coupons.map((c: Coupon) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCoupon(selectedCoupon?.id === c.id ? null : c); setShowCoupons(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${selectedCoupon?.id === c.id ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/50"
                      }`}
                  >
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground">{c.discount_percent}% OFF</span>
                    {c.free_shipping && (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <Truck className="h-3 w-3" /> Frete grátis
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="space-y-2 py-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>R$ {subtotal.toFixed(2)}</span>
          </div>
          {selectedCoupon && (
            <div className="flex justify-between text-primary">
              <span>Desconto ({selectedCoupon.discount_percent}%)</span>
              <span>- R$ {discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Frete</span>
            <span>{shippingCost > 0 ? `R$ ${shippingCost.toFixed(2)}` : "Grátis"}</span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-2 text-base font-bold text-foreground">
            <span>Total</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={onProceed} disabled={items.length === 0}>
        Ir para pagamento • R$ {total.toFixed(2)}
      </Button>
    </div>
  );
}

/* ============ Checkout View ============ */
function CheckoutView({
  items, subtotal, discountAmount, selectedCoupon, freeShipping, total,
  deliveryAddress, deliveryCity,
  pixPayload, pixQrDataUrl, copied, onCopyPix, onConfirm, submitting, pixConfig,
  shippingCost, paymentStatus, onVerifyPayment, verifyingPayment, onSimulatePayment,
  paymentMethod, setPaymentMethod, paymentUrl
}: any) {
  return (
    <div className="space-y-4">
      {/* Order summary */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="space-y-2 py-4 text-sm">
          <p className="font-semibold text-foreground mb-2">Resumo do pedido</p>
          {items.map((item: CartItem) => (
            <div key={item.id} className="flex justify-between text-muted-foreground">
              <span>{item.quantity}x {item.product_name}</span>
              <span>R$ {item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span>
            </div>
            {selectedCoupon && (
              <div className="flex justify-between text-primary">
                <span>Desconto ({selectedCoupon.discount_percent}%)</span>
                <span>- R$ {discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Frete</span><span>{shippingCost > 0 ? `R$ ${shippingCost.toFixed(2)}` : "Grátis"}</span>
            </div>
            <div className="flex justify-between font-bold text-foreground text-base pt-1 border-t border-border/50">
              <span>Total</span><span>R$ {total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method Selection */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Método de Pagamento
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={paymentMethod === "pix" ? "default" : "outline"}
              className="w-full flex-col h-auto py-3 gap-1"
              onClick={() => setPaymentMethod("pix")}
              disabled={paymentStatus === "pending" || paymentStatus === "paid"}
            >
              <QrCode className="h-5 w-5" />
              <span className="text-[10px] uppercase font-bold">PIX</span>
            </Button>
            <Button
              variant={paymentMethod === "card" ? "default" : "outline"}
              className="w-full flex-col h-auto py-3 gap-1"
              onClick={() => setPaymentMethod("card")}
              disabled={paymentStatus === "pending" || paymentStatus === "paid"}
            >
              <CreditCard className="h-5 w-5" />
              <span className="text-[10px] uppercase font-bold">Cartão</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PIX Payment */}
      {paymentMethod === "pix" && pixPayload ? (
        <Card className="border-primary/30 bg-card/30">
          <CardContent className="py-5 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
              <QrCode className="h-5 w-5 text-primary" /> Pague via Pix
            </div>
            {pixQrDataUrl && (
              <img src={pixQrDataUrl} alt="QR Code Pix" className="mx-auto h-48 w-48 rounded-lg" />
            )}
            <p className="text-xs text-muted-foreground">Escaneie o QR Code ou copie o código abaixo</p>
            <Button variant="outline" size="sm" className="gap-2" onClick={onCopyPix}>
              {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar código Pix"}
            </Button>
          </CardContent>
        </Card>
      ) : paymentMethod === "card" && paymentStatus === "pending" && paymentUrl ? (
        <Card className="border-primary/30 bg-card/30">
          <CardContent className="py-5 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
              <CreditCard className="h-5 w-5 text-primary" /> Pagamento com Cartão
            </div>
            <p className="text-sm text-foreground">Clique no botão abaixo para concluir o pagamento no Mercado Pago seguro.</p>
            <Button
              className="w-full gap-2"
              onClick={() => window.open(paymentUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              Pagar no Mercado Pago
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Payment Status & Actions */}
      {paymentStatus === "paid" ? (
        <Card className="border-primary/30 bg-primary/10">
          <CardContent className="py-4 text-center">
            <div className="flex items-center justify-center gap-2 text-primary font-bold">
              <CheckCircle2 className="h-5 w-5" />
              Pagamento Confirmado!
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Seu pedido está sendo processado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={onConfirm}
            disabled={submitting || paymentStatus === "pending"}
          >
            {submitting ? "Finalizando..." : "Confirmar Pedido"}
          </Button>

          {paymentStatus === "pending" && (
            <>
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={onVerifyPayment}
                disabled={verifyingPayment}
              >
                {verifyingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <QrCode className="h-4 w-4 mr-2" />
                    Já realizei o pagamento
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-col items-center justify-center gap-2 border-t border-border/20 pt-4 opacity-70">
        <div className="flex items-center gap-2 grayscale hover:grayscale-0 transition-all duration-500">
          <img src={mercadoPagoLogo} alt="Mercado Pago" className="h-4 opacity-80" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Pagamento Blindado
          </p>
        </div>
      </div>
    </div>
  );
}
