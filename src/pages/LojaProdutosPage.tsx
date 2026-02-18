import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LojaFloatingNavIsland } from "@/components/navigation/LojaFloatingNavIsland";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, ImagePlus, X, Pencil, Trash2, Search, Package } from "lucide-react";

interface MarketplaceProduct {
  id: string;
  nome: string;
  descricao: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  preco_original: number;
  preco_desconto: number;
  ativo: boolean;
}

const LojaProdutosPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editProduct, setEditProduct] = useState<MarketplaceProduct | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", preco: "", descricao: "", ativo: true });
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteProduct, setDeleteProduct] = useState<MarketplaceProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Produtos - Nexfit Lojista";
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data: store } = await supabase
        .from("marketplace_stores")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (!store) { setLoading(false); return; }
      setStoreId(store.id);

      const { data } = await (supabase as any)
        .from("marketplace_products")
        .select("id, nome, descricao, image_url, image_urls, preco_original, preco_desconto, ativo")
        .eq("store_id", store.id)
        .order("nome");

      if (data) setProducts(data as MarketplaceProduct[]);
      setLoading(false);
    };
    void load();
  }, [user]);

  // ── Create helpers (Removed - Move to Stock Module) ──

  // ── Edit helpers ──
  const openEdit = (p: MarketplaceProduct) => {
    setEditProduct(p);
    setEditForm({
      nome: p.nome,
      preco: p.preco_desconto.toFixed(2).replace(".", ","),
      descricao: p.descricao ?? "",
      ativo: p.ativo,
    });
    setExistingImageUrls(p.image_urls ?? (p.image_url ? [p.image_url] : []));
    setEditImageFiles([]);
    setEditImagePreviews([]);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    const totalCurrent = existingImageUrls.length + editImageFiles.length;
    const remaining = 3 - totalCurrent;
    const toAdd = files.slice(0, remaining);
    setEditImageFiles((prev) => [...prev, ...toAdd]);
    setEditImagePreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  const removeExistingImage = (index: number) => {
    setExistingImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const removeEditNewImage = (index: number) => {
    setEditImageFiles((prev) => prev.filter((_, i) => i !== index));
    setEditImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const extractStoragePath = (url: string): string | null => {
    const marker = "/object/public/marketplace_store_images/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
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

  const handleEditSave = async () => {
    if (!storeId || !editProduct) return;
    const nome = editForm.nome.trim();
    const preco = Number(editForm.preco.replace(",", "."));
    if (!nome || !preco || Number.isNaN(preco)) {
      toast({ title: "Preencha nome e preço válidos", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      // Delete removed images from storage
      const originalUrls = editProduct.image_urls ?? (editProduct.image_url ? [editProduct.image_url] : []);
      const removedUrls = originalUrls.filter((u) => !existingImageUrls.includes(u));
      for (const url of removedUrls) {
        const path = extractStoragePath(url);
        if (path) {
          await supabase.storage.from("marketplace_store_images").remove([path]);
        }
      }

      // Upload new images
      const newUploadedUrls = await uploadImages(editImageFiles, storeId);
      const finalUrls = [...existingImageUrls, ...newUploadedUrls];

      const { error } = await (supabase as any)
        .from("marketplace_products")
        .update({
          nome,
          descricao: editForm.descricao.trim() || null,
          preco_original: preco,
          preco_desconto: preco,
          image_url: finalUrls[0] ?? null,
          image_urls: finalUrls,
          ativo: editForm.ativo,
        })
        .eq("id", editProduct.id);

      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editProduct.id
              ? { ...p, nome, descricao: editForm.descricao.trim() || null, preco_original: preco, preco_desconto: preco, image_url: finalUrls[0] ?? null, image_urls: finalUrls, ativo: editForm.ativo }
              : p
          )
        );
        setEditProduct(null);
        toast({ title: "Produto atualizado!" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar imagem", description: err.message, variant: "destructive" });
    }
    setEditSaving(false);
  };

  // ── Delete helpers ──
  const handleDelete = async () => {
    if (!deleteProduct) return;
    setDeleting(true);

    // Delete images from storage
    const urls = deleteProduct.image_urls ?? (deleteProduct.image_url ? [deleteProduct.image_url] : []);
    const paths = urls.map(extractStoragePath).filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabase.storage.from("marketplace_store_images").remove(paths);
    }

    const { error } = await supabase.from("marketplace_products").delete().eq("id", deleteProduct.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== deleteProduct.id));
      toast({ title: "Produto excluído!" });
    }
    setDeleteProduct(null);
    setDeleting(false);
  };

  const totalEditImages = existingImageUrls.length + editImageFiles.length;

  return (
    <main className="min-h-screen bg-black px-4 pb-28 pt-8 safe-bottom-floating-nav">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Produtos</p>
        <h1 className="mt-1 text-2xl font-black text-white uppercase tracking-tight">Meus Produtos</h1>
      </header>


      {/* ── Product List ── */}
      {loading ? (
        <div className="flex justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
            <Package className="h-8 w-8 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-500">Nenhum produto cadastrado ainda.</p>
          <p className="text-xs text-zinc-600 mt-2">Cadastre novos produtos no módulo de Estoque.</p>
        </div>
      ) : (
        <div className="grid gap-3 pb-8">
          {products.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06]">
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-white/5 border border-white/5">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.nome} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-6 w-6 text-zinc-700" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-white truncate pr-2">{p.nome}</p>
                    <div className={`h-2 w-2 rounded-full ${p.ativo ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary))]' : 'bg-zinc-700'}`} />
                  </div>
                  <p className="text-sm font-medium text-primary mt-0.5">R$ {p.preco_desconto.toFixed(2)}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mt-1">{p.ativo ? "Disponível na loja" : "Indisponível"}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteProduct(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editProduct} onOpenChange={(open) => { if (!open) setEditProduct(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border border-white/10 bg-black/90 backdrop-blur-xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400">Nome</Label>
              <Input
                value={editForm.nome}
                onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))}
                className="bg-white/5 border-white/10 text-white focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Preço (R$)</Label>
              <Input
                value={editForm.preco}
                onChange={(e) => setEditForm((f) => ({ ...f, preco: e.target.value }))}
                className="bg-white/5 border-white/10 text-white focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Imagens (Máx 3)</Label>
              <input ref={editFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEditFileChange} />
              <div className="flex gap-2 flex-wrap">
                {existingImageUrls.map((url, i) => (
                  <div key={`existing-${i}`} className="relative inline-block">
                    <img src={url} alt={`Img ${i + 1}`} className="h-20 w-20 rounded-lg border border-white/10 object-cover" />
                    <button type="button" onClick={() => removeExistingImage(i)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {editImagePreviews.map((preview, i) => (
                  <div key={`new-${i}`} className="relative inline-block">
                    <img src={preview} alt={`Nova ${i + 1}`} className="h-20 w-20 rounded-lg border border-white/10 object-cover" />
                    <button type="button" onClick={() => removeEditNewImage(i)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {totalEditImages < 3 && (
                  <button type="button" onClick={() => editFileInputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 bg-white/5 text-zinc-500 hover:border-primary/50 hover:text-primary transition-colors">
                    <ImagePlus className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Descrição</Label>
              <Textarea
                value={editForm.descricao}
                onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))}
                className="min-h-[80px] bg-white/5 border-white/10 text-white focus:border-primary/50"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/5 p-3">
              <Label className="text-zinc-300">Produto Ativo</Label>
              <Switch checked={editForm.ativo} onCheckedChange={(v) => setEditForm((f) => ({ ...f, ativo: v }))} className="data-[state=checked]:bg-primary" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => setEditProduct(null)}>Cancelar</Button>
            <Button className="bg-primary text-black hover:bg-primary/90 font-bold" onClick={handleEditSave} disabled={editSaving}>{editSaving ? "Salvando..." : "Salvar Alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!deleteProduct} onOpenChange={(open) => { if (!open) setDeleteProduct(null); }}>
        <DialogContent className="max-w-sm border border-white/10 bg-black/90 backdrop-blur-xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Excluir produto</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Tem certeza que deseja excluir <strong>{deleteProduct?.nome}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => setDeleteProduct(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20">{deleting ? "Excluindo..." : "Excluir Definitivamente"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LojaFloatingNavIsland />
    </main>
  );
};

export default LojaProdutosPage;
