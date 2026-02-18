import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";

type OutdoorRow = {
  id: string;
  image_url: string;
  image_path: string;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type OutdoorDraft = {
  clientId: string;
  file: File | null;
  linkUrl: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const MASTER_EMAIL = "biotreinerapp@gmail.com";

const toDatetimeLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromDatetimeLocal = (value: string) => {
  // value is local time; convert to ISO
  const d = new Date(value);
  return d.toISOString();
};

const newDraft = (): OutdoorDraft => ({
  clientId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  file: null,
  linkUrl: "",
  startsAt: toDatetimeLocal(new Date().toISOString()),
  endsAt: "",
  isActive: true,
});

const ensureAdminMasterRole = async () => {
  // Garante que o usuário master possua role admin no banco (necessário para RLS do bucket/tabela).
  await supabase.functions.invoke("ensure-admin-master");
};

export const DashboardOutdoorAdminPanel = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useAdminRole();

  const isAdminMaster = (user?.email ?? "").toLowerCase() === MASTER_EMAIL;

  const [rows, setRows] = useState<OutdoorRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);

  const [drafts, setDrafts] = useState<OutdoorDraft[]>(() => [newDraft()]);
  const [outdoorToDelete, setOutdoorToDelete] = useState<OutdoorRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canRender = !roleLoading && (isAdmin || isAdminMaster);

  const load = async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("dashboard_outdoors")
      .select("id, image_url, image_path, link_url, starts_at, ends_at, is_active, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);

    setLoadingList(false);

    if (error) {
      toast({ title: "Erro ao carregar outdoors", description: error.message, variant: "destructive" });
      return;
    }

    setRows((data ?? []) as OutdoorRow[]);
  };

  useEffect(() => {
    if (!canRender) return;

    // Se for admin master e ainda não tiver role admin no banco, criamos automaticamente.
    if (isAdminMaster && !isAdmin) {
      void ensureAdminMasterRole().then(() => void load());
      return;
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender, isAdminMaster, isAdmin]);

  const uploadImage = async (imageFile: File) => {
    const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `outdoors/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("dashboard_outdoors")
      .upload(filePath, imageFile, { upsert: true, contentType: imageFile.type || "image/png" });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from("dashboard_outdoors").getPublicUrl(filePath);
    return { filePath, publicUrl: publicData.publicUrl };
  };

  const updateDraft = (clientId: string, patch: Partial<OutdoorDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.clientId === clientId ? { ...d, ...patch } : d)));
  };

  const addDraftRow = () => setDrafts((prev) => [...prev, newDraft()]);

  const removeDraftRow = (clientId: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.clientId !== clientId);
      return next.length ? next : [newDraft()];
    });
  };

  const handlePublishAll = async () => {
    const missing = drafts.find((d) => !d.file);
    if (missing) {
      toast({
        title: "Falta imagem",
        description: "Preencha todos os campos de imagem (ou remova as linhas vazias).",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // RLS do bucket/tabela exige role admin. Para o master, garantimos a role automaticamente.
      if (isAdminMaster && !isAdmin) {
        await ensureAdminMasterRole();
      }

      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        if (!d.file) continue;

        const { filePath, publicUrl } = await uploadImage(d.file);

        const payload = {
          image_path: filePath,
          image_url: publicUrl,
          link_url: d.linkUrl.trim() ? d.linkUrl.trim() : null,
          starts_at: fromDatetimeLocal(d.startsAt),
          ends_at: d.endsAt.trim() ? fromDatetimeLocal(d.endsAt) : null,
          is_active: d.isActive,
        };

        const { error } = await supabase.from("dashboard_outdoors").insert(payload as any);
        if (error) throw error;
      }

      setDrafts([newDraft()]);
      toast({ title: "Banners publicados", description: "As imagens foram salvas e já podem aparecer no dashboard do aluno." });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao publicar", description: e?.message ?? "Falha inesperada", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, next: boolean) => {
    const { error } = await supabase.from("dashboard_outdoors").update({ is_active: next }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
  };

  const remove = async (row: OutdoorRow) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("dashboard_outdoors").delete().eq("id", row.id);
      if (error) {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        return;
      }

      // best-effort: remove file from bucket
      if (row.image_path) {
        await supabase.storage.from("dashboard_outdoors").remove([row.image_path]);
      }

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast({ title: "Excluído", description: "Outdoor removido com sucesso." });
    } finally {
      setIsDeleting(false);
      setOutdoorToDelete(null);
    }
  };

  const hint = useMemo(() => {
    return "Recomendado: 360×120 (3:1), JPG/PNG. O link é opcional.";
  }, []);

  if (roleLoading) {
    return (
      <Card className="border border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Outdoor do Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Verificando permissão...</p>
        </CardContent>
      </Card>
    );
  }

  if (!canRender) {
    return (
      <Card className="border border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Outdoor do Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Apenas administradores podem gerenciar o outdoor.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/70 bg-card/80">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Outdoor do Dashboard (360×120)</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          {drafts.map((d, idx) => (
            <div key={d.clientId} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Banner {idx + 1}</p>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeDraftRow(d.clientId)} disabled={saving}>
                  Remover
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Imagem</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    className="bg-background/60"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateDraft(d.clientId, { file: e.target.files?.[0] ?? null })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Link (opcional)</Label>
                  <Input
                    value={d.linkUrl}
                    onChange={(e) => updateDraft(d.clientId, { linkUrl: e.target.value })}
                    className="bg-background/60"
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Início</Label>
                  <Input
                    type="datetime-local"
                    value={d.startsAt}
                    onChange={(e) => updateDraft(d.clientId, { startsAt: e.target.value })}
                    className="bg-background/60"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Fim (opcional)</Label>
                  <Input
                    type="datetime-local"
                    value={d.endsAt}
                    onChange={(e) => updateDraft(d.clientId, { endsAt: e.target.value })}
                    className="bg-background/60"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={d.isActive} onCheckedChange={(v) => updateDraft(d.clientId, { isActive: v })} />
                  <span className="text-xs text-muted-foreground">Ativo</span>
                </div>
              </div>
            </div>
          ))}

          <Button type="button" size="sm" variant="outline" onClick={addDraftRow} disabled={saving}>
            +
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={handlePublishAll} loading={saving} disabled={loadingList}>
            Publicar banners
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={saving || loadingList}>
            Recarregar lista
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingList && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                    Nenhum outdoor cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>
                      <Switch checked={r.is_active} onCheckedChange={(v) => void toggleActive(r.id, v)} />
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs">
                      {r.link_url ? (
                        <a className="text-primary underline" href={r.link_url} target="_blank" rel="noreferrer">
                          {r.link_url}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="ghost" onClick={() => void setOutdoorToDelete(r)}>
                        Excluir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AlertDialog open={!!outdoorToDelete} onOpenChange={(open) => !open && setOutdoorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Outdoor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este outdoor? Esta ação não pode ser desfeita e a imagem será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => outdoorToDelete && void remove(outdoorToDelete)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
