import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LojaFloatingNavIsland } from "@/components/navigation/LojaFloatingNavIsland";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Warehouse, AlertTriangle, Plus, Minus, Crown, Search, Package, Lock, ImagePlus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProductStock {
  id: string;
  nome: string;
  stock: number;
  min_stock_alert: number;
  image_url: string | null;
}

const LojaEstoquePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(true); // Default to true to avoid flash
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingAlert, setEditingAlert] = useState<{ id: string, value: string } | null>(null);
  const [editingStock, setEditingStock] = useState<{ id: string, value: string } | null>(null);

  // Registration state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    preco: "",
    descricao: "",
    stock: "0",
    min_stock_alert: "5"
  });
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Estoque - Nexfit Lojista";
  }, []);

  const loadStock = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: store } = await (supabase as any)
        .from("marketplace_stores")
        .select("id, subscription_plan")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (!store) return;
      setStoreId(store.id);

      const isStorePro = true; // Always unlocked
      setIsPro(isStorePro);

      const { data } = await (supabase as any)
        .from("marketplace_products")
        .select("id, nome, stock, min_stock_alert, image_url")
        .eq("store_id", store.id)
        .order("nome");

      if (data) setProducts(data as ProductStock[]);
    } catch (error) {
      console.error("Erro ao carregar estoque:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadStock(); }, [loadStock]);

  const updateField = async (id: string, field: 'stock' | 'min_stock_alert', value: number) => {
    if (value < 0) return;
    setUpdating(`${id}-${field}`);
    try {
      const { error } = await (supabase as any)
        .from("marketplace_products")
        .update({ [field]: value })
        .eq("id", id);

      if (error) throw error;

      setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
      toast({ title: "Atualizado com sucesso" });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(null);
      if (field === 'stock') setEditingStock(null);
      if (field === 'min_stock_alert') setEditingAlert(null);
    }
  };

  // ── Registration Helpers ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Selecione um arquivo de imagem", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Imagem deve ter no máximo 5MB", variant: "destructive" });
        return;
      }
    }
    const remaining = 3 - imageFiles.length;
    const toAdd = files.slice(0, remaining);
    setImageFiles((prev) => [...prev, ...toAdd]);
    setImagePreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const clearImages = () => {
    setImageFiles([]);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadImages = async (files: File[], sId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `products/${sId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("marketplace_store_images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("marketplace_store_images").getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const handleSave = async () => {
    if (!storeId) return;
    const nome = form.nome.trim();
    const preco = Number(form.preco.replace(",", "."));
    const stockQty = Number(form.stock);
    const minAlert = Number(form.min_stock_alert);

    if (!nome || !preco || Number.isNaN(preco)) {
      toast({ title: "Preencha nome e preço válidos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const uploadedUrls = await uploadImages(imageFiles, storeId);
      const { data, error } = await (supabase as any)
        .from("marketplace_products")
        .insert({
          store_id: storeId,
          nome,
          descricao: form.descricao.trim() || null,
          image_url: uploadedUrls[0] ?? null,
          image_urls: uploadedUrls,
          preco_original: preco,
          preco_desconto: preco,
          ativo: true,
          stock: stockQty,
          min_stock_alert: minAlert
        })
        .select()
        .maybeSingle();

      if (error || !data) {
        toast({ title: "Erro ao cadastrar", description: error?.message, variant: "destructive" });
      } else {
        setProducts((p) => [...p, data as ProductStock]);
        setForm({ nome: "", preco: "", descricao: "", stock: "0", min_stock_alert: "5" });
        clearImages();
        setShowForm(false);
        toast({ title: "Produto cadastrado com estoque!" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao cadastrar", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const filteredProducts = products.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockCount = products.filter(p => p.stock <= p.min_stock_alert).length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </main>
    );
  }



  return (
    <main className="min-h-screen bg-black px-4 pb-28 pt-8 safe-bottom-floating-nav">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Estoque</p>
          <h1 className="mt-1 text-2xl font-black text-white uppercase tracking-tight">Gestão de Estoque</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </header>

      <div className="grid gap-4 mb-6">
        <div className="relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${lowStockCount > 0 ? 'bg-red-500/20 text-red-500' : 'bg-primary/20 text-primary'}`}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Produtos em alerta</p>
              <p className="text-2xl font-black text-white">{lowStockCount}</p>
            </div>
          </div>
          {lowStockCount > 0 && (
            <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Atenção: Estoque baixo detectado</p>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Buscar produto..."
            className="h-12 rounded-xl border-white/5 bg-white/5 pl-11 text-white placeholder:text-zinc-600 focus:border-primary/50 focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredProducts.map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06]">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-white/5 border border-white/5">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.nome} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-6 w-6 text-zinc-700" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white truncate pr-2 uppercase tracking-tight">{p.nome}</p>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Estoque Atual</span>
                    {editingStock?.id === p.id ? (
                      <Input
                        type="number"
                        autoFocus
                        className="h-7 w-20 bg-white/10 border-white/10 text-xs font-bold p-1"
                        value={editingStock.value}
                        onChange={(e) => setEditingStock({ id: p.id, value: e.target.value })}
                        onBlur={() => updateField(p.id, 'stock', Number(editingStock.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateField(p.id, 'stock', Number(editingStock.value));
                        }}
                      />
                    ) : (
                      <div
                        className={`flex items-center gap-2 cursor-pointer group/stock`}
                        onClick={() => setEditingStock({ id: p.id, value: String(p.stock) })}
                      >
                        <span className={`text-sm font-black ${p.stock <= p.min_stock_alert ? 'text-red-500' : 'text-primary'}`}>
                          {p.stock} un
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover/stock:opacity-100 transition-opacity">
                          <button
                            className="h-5 w-5 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-zinc-400"
                            onClick={(e) => { e.stopPropagation(); updateField(p.id, 'stock', p.stock - 1); }}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            className="h-5 w-5 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-zinc-400"
                            onClick={(e) => { e.stopPropagation(); updateField(p.id, 'stock', p.stock + 1); }}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Alerta Mínimo</span>
                    {editingAlert?.id === p.id ? (
                      <Input
                        type="number"
                        autoFocus
                        className="h-7 w-20 bg-white/10 border-white/10 text-xs font-bold p-1"
                        value={editingAlert.value}
                        onChange={(e) => setEditingAlert({ id: p.id, value: e.target.value })}
                        onBlur={() => updateField(p.id, 'min_stock_alert', Number(editingAlert.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateField(p.id, 'min_stock_alert', Number(editingAlert.value));
                        }}
                      />
                    ) : (
                      <div
                        className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                        onClick={() => setEditingAlert({ id: p.id, value: String(p.min_stock_alert) })}
                      >
                        <span className="text-xs font-bold text-zinc-400">{p.min_stock_alert}</span>
                        <Crown className="h-3 w-3 text-amber-500/50" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {p.stock <= p.min_stock_alert && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 animate-pulse">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 && (
          <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-8 text-center">
            <Warehouse className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">
              {searchTerm ? "Nenhum produto encontrado." : "Estoque vazio."}
            </p>
          </div>
        )}
      </div>

      <LojaFloatingNavIsland />

      {/* ── Registration Dialog ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border border-white/10 bg-black/90 backdrop-blur-xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Cadastrar Novo Produto</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Adicione um novo produto diretamente ao estoque.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">Nome do Produto</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Whey Protein 900g"
                className="h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-zinc-600 focus:border-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Preço (R$)</Label>
                <Input
                  value={form.preco}
                  onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
                  placeholder="Ex: 199,90"
                  className="h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-zinc-600 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider font-bold text-primary">Estoque Inicial</Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  className="h-11 rounded-xl border-primary/20 bg-primary/5 text-white focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider font-bold text-amber-500">Alerta de Estoque Mínimo</Label>
              <Input
                type="number"
                value={form.min_stock_alert}
                onChange={(e) => setForm((f) => ({ ...f, min_stock_alert: e.target.value }))}
                className="h-11 rounded-xl border-amber-500/20 bg-amber-500/5 text-white focus:border-amber-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">Imagens (Máx 3)</Label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
              <div className="flex gap-3 flex-wrap">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="relative inline-block group">
                    <img src={preview} alt={`Preview ${i + 1}`} className="h-20 w-20 rounded-xl border border-white/10 object-cover" />
                    <button type="button" onClick={() => removeImage(i)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {imageFiles.length < 3 && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 bg-white/5 text-zinc-400 transition-colors hover:border-primary/50 hover:text-primary hover:bg-primary/5">
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[8px] uppercase font-bold tracking-wide">Adicionar</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400 uppercase tracking-wider">Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Detalhes do produto..."
                className="min-h-[80px] rounded-xl border-white/10 bg-white/5 text-white placeholder:text-zinc-600 focus:border-primary/50"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => { setShowForm(false); clearImages(); }}
              className="text-zinc-400 hover:text-white hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest"
            >
              {saving ? "Cadastrando..." : "Cadastrar Produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default LojaEstoquePage;
