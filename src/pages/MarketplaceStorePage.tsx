import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { ShoppingCart, Plus, Eye, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ProductImageCarousel } from "@/components/marketplace/ProductImageCarousel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Store {
  id: string;
  nome: string;
  descricao: string | null;
  cover_image_url: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  desconto_percent: number;
  store_type: string;
}

interface Product {
  id: string;
  nome: string;
  descricao: string | null;
  image_url: string | null;
  image_urls: string[];
  preco_original: number;
  preco_desconto: number;
}

export default function MarketplaceStorePage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  useEffect(() => {
    const fetchStoreAndProducts = async () => {
      if (!storeId) return;

      const { data: storeData } = await supabase
        .from("marketplace_stores")
        .select("id, nome, descricao, cover_image_url, profile_image_url, banner_image_url, desconto_percent, store_type")
        .eq("id", storeId)
        .eq("status", "aprovado")
        .maybeSingle();

      if (storeData) {
        setStore(storeData as Store);
        document.title = `${storeData.nome} - Marketplace Nexfit`;

        const { data: productsData } = await (supabase as any)
          .from("marketplace_products")
          .select("id, nome, descricao, image_url, image_urls, preco_original, preco_desconto")
          .eq("store_id", storeId)
          .eq("ativo", true)
          .order("nome");

        if (productsData) setProducts(productsData as Product[]);
      }

      setLoading(false);
    };

    fetchStoreAndProducts();
  }, [storeId]);

  // Load cart count
  useEffect(() => {
    if (!user || !storeId) return;

    const loadCart = async () => {
      const { data: order } = await (supabase as any)
        .from("marketplace_orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("store_id", storeId)
        .eq("status", "cart")
        .maybeSingle();

      if (order) {
        const { data: items } = await (supabase as any)
          .from("marketplace_order_items")
          .select("quantity")
          .eq("order_id", order.id);

        if (items) {
          const total = (items as any[]).reduce((sum: number, i: any) => sum + (i.quantity ?? 0), 0);
          setCartCount(total);
        }
      }
    };

    loadCart();
  }, [user, storeId]);

  const handleAddToCart = async (product: Product) => {
    if (!user || !storeId) {
      toast({ title: "Faça login para adicionar ao carrinho", variant: "destructive" });
      return;
    }

    setAddingToCart(product.id);

    try {
      // Get or create cart order
      let { data: order } = await (supabase as any)
        .from("marketplace_orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("store_id", storeId)
        .eq("status", "cart")
        .maybeSingle();

      if (!order) {
        const { data: newOrder, error: orderErr } = await (supabase as any)
          .from("marketplace_orders")
          .insert({
            user_id: user.id,
            store_id: storeId,
            status: "cart",
            last_cart_activity: new Date().toISOString()
          })
          .select("id")
          .maybeSingle();

        if (orderErr) throw orderErr;
        order = newOrder;
      }

      if (!order) throw new Error("Erro ao criar pedido");

      // Check if product already in cart
      const { data: existingItem } = await (supabase as any)
        .from("marketplace_order_items")
        .select("id, quantity")
        .eq("order_id", order.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existingItem) {
        await (supabase as any)
          .from("marketplace_order_items")
          .update({
            quantity: existingItem.quantity + 1,
            subtotal: (existingItem.quantity + 1) * product.preco_desconto,
          })
          .eq("id", existingItem.id);
      } else {
        await (supabase as any)
          .from("marketplace_order_items")
          .insert({
            order_id: order.id,
            product_id: product.id,
            product_name: product.nome,
            product_image: product.image_url,
            quantity: 1,
            unit_price: product.preco_desconto,
            subtotal: product.preco_desconto,
          });
      }

      // Update cart activity timestamp whenever something changes
      await (supabase as any)
        .from("marketplace_orders")
        .update({ last_cart_activity: new Date().toISOString() })
        .eq("id", order.id);

      setCartCount((prev) => prev + 1);
      toast({ title: "Adicionado ao carrinho", description: product.nome });
    } catch (err: any) {
      toast({ title: "Erro ao adicionar", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setAddingToCart(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loja não encontrada.</p>
      </div>
    );
  }

  const bannerUrl = store.banner_image_url || store.cover_image_url;
  const profileUrl = store.profile_image_url;

  return (
    <div className="safe-bottom-floating-nav min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <div className="relative h-[240px] w-full overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt={store.nome} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 via-background to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

        {/* Top Navbar overlay */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4 px-6">
          <BackIconButton to={`/marketplace/categoria/${store.store_type}`} className="bg-background/20 backdrop-blur-md border-white/10 hover:bg-background/40" />

          <div className="flex items-center gap-2">
            {/* Orders Button */}
            <button
              type="button"
              onClick={() => navigate("/marketplace/pedidos")}
              className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-background/20 backdrop-blur-md border border-white/10 transition-all hover:bg-background/40 active:scale-95"
            >
              <Package className="h-5 w-5 text-white" />
            </button>

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => navigate(`/marketplace/loja/${storeId}/carrinho`)}
              className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-primary shadow-2xl shadow-primary/40 transition-transform active:scale-95"
            >
              <ShoppingCart className="h-5 w-5 text-black" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-white text-[10px] font-bold text-black ring-2 ring-primary">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Store Header Info */}
      <div className="container mx-auto px-4 pb-8">
        <div className="relative -mt-12 flex flex-col items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-6">
          {/* Profile Image with Ring Effect */}
          <div className="relative h-24 w-24 flex-shrink-0 animate-in zoom-in-50 duration-500">
            <div className="absolute inset-[-4px] animate-pulse rounded-full bg-gradient-to-tr from-primary via-primary/40 to-transparent opacity-50" />
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow-2xl">
              {profileUrl ? (
                <img src={profileUrl} alt={store.nome} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-muted-foreground/30">
                  {store.nome.charAt(0)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex-1 space-y-2 sm:mt-8">
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">{store.nome}</h1>
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider text-[10px] px-2">
                    LOJA CERTIFICADA
                  </Badge>
                  {store.desconto_percent > 0 && (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black text-[10px]">
                      ATÉ {store.desconto_percent}% OFF
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {store.descricao && (
              <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground opacity-80">
                {store.descricao}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Products Selection Header */}
      <div className="sticky top-0 z-40 bg-background/80 py-4 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-foreground">
            Catálogo
          </h2>
          <div className="h-1 w-20 rounded-full bg-gradient-to-r from-primary to-transparent" />
        </div>
      </div>

      {/* Products Selection Header content was already added by previous tool call */}

      {/* Products Grid */}
      <div className="container mx-auto px-4 pb-12">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
            <div className="mb-4 rounded-full bg-muted/50 p-6">
              <ShoppingCart className="h-10 w-10 opacity-30" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Nenhum produto disponível no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                handleAddToCart={handleAddToCart}
                addingToCart={addingToCart}
                onQuickView={() => {
                  setSelectedProduct(product);
                  setQuickViewOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      <Dialog open={quickViewOpen} onOpenChange={setQuickViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-xl">
          {selectedProduct && (
            <div className="flex flex-col">
              <div className="relative aspect-square w-full overflow-hidden bg-muted sm:aspect-video">
                <ProductImageCarousel
                  images={selectedProduct.image_urls?.length ? selectedProduct.image_urls : (selectedProduct.image_url ? [selectedProduct.image_url] : [])}
                  alt={selectedProduct.nome}
                />
              </div>

              <div className="space-y-6 p-6">
                <div>
                  <DialogHeader className="mb-2">
                    <DialogTitle className="text-2xl font-black tracking-tight">{selectedProduct.nome}</DialogTitle>
                  </DialogHeader>
                  {selectedProduct.descricao && (
                    <p className="text-sm font-medium leading-relaxed text-muted-foreground opacity-80">
                      {selectedProduct.descricao}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-6">
                  <div className="flex flex-col">
                    {selectedProduct.preco_original > selectedProduct.preco_desconto && (
                      <span className="text-xs font-medium text-muted-foreground line-through opacity-50">
                        R$ {selectedProduct.preco_original.toFixed(2)}
                      </span>
                    )}
                    <span className="text-2xl font-black text-primary">
                      R$ {selectedProduct.preco_desconto.toFixed(2)}
                    </span>
                  </div>

                  <Button
                    variant="premium"
                    size="lg"
                    className="h-12 px-8"
                    onClick={() => {
                      handleAddToCart(selectedProduct);
                      setQuickViewOpen(false);
                    }}
                    disabled={addingToCart === selectedProduct.id}
                  >
                    {addingToCart === selectedProduct.id ? "ADICIONANDO..." : (
                      <span className="flex items-center gap-2">
                        ADICIONAR <ShoppingCart className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FloatingNavIsland />
    </div>
  );
}

function ProductCard({ product, handleAddToCart, addingToCart, onQuickView }: any) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
      {/* Product Image Stage */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.image_url || "/placeholder.svg"}
          alt={product.nome}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {/* Quick View Overlay (Eye) */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <button
            onClick={onQuickView}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-transform hover:scale-110 active:scale-90"
          >
            <Eye className="h-6 w-6" />
          </button>
        </div>

        {product.preco_original > product.preco_desconto && (
          <div className="absolute left-2 top-2 z-10">
            <Badge className="bg-primary text-black font-black text-[8px] px-1.5 py-0.5">
              OFERTA
            </Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex-1">
          <h3 className="line-clamp-1 text-[11px] font-bold text-foreground group-hover:text-primary transition-colors">{product.nome}</h3>
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[13px] font-black text-primary">
              R$ {product.preco_desconto.toFixed(2)}
            </span>
          </div>

          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-black shadow-lg shadow-primary/20 transition-transform hover:scale-110 active:scale-90 disabled:opacity-50"
            onClick={() => handleAddToCart(product)}
            disabled={addingToCart === product.id}
          >
            {addingToCart === product.id ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
