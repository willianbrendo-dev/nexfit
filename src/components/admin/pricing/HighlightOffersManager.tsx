import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

type HighlightOffer = {
    id: string;
    title: string;
    description: string | null;
    duration_days: number;
    price_cents: number;
    features: string[];
    is_active: boolean;
    sort_order: number;
    badge_label: string | null;
};

export const HighlightOffersManager = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingOffer, setEditingOffer] = useState<HighlightOffer | null>(null);
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        duration_days: 7,
        price_cents: 0,
        features: [] as string[],
        badge_label: "",
        is_active: true,
        sort_order: 0,
    });
    const [featureInput, setFeatureInput] = useState("");
    const [saving, setSaving] = useState(false);
    const [offerToDelete, setOfferToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const { data: offers = [], isLoading } = useQuery<HighlightOffer[]>({
        queryKey: ["highlight-offers"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("highlight_offers")
                .select("*")
                .order("sort_order");
            if (error) throw error;
            return data || [];
        },
    });

    const openCreateDialog = () => {
        setEditingOffer(null);
        setFormData({
            title: "",
            description: "",
            duration_days: 7,
            price_cents: 0,
            features: [],
            badge_label: "",
            is_active: true,
            sort_order: offers.length,
        });
        setDialogOpen(true);
    };

    const openEditDialog = (offer: HighlightOffer) => {
        setEditingOffer(offer);
        setFormData({
            title: offer.title,
            description: offer.description || "",
            duration_days: offer.duration_days,
            price_cents: offer.price_cents,
            features: offer.features,
            badge_label: offer.badge_label || "",
            is_active: offer.is_active,
            sort_order: offer.sort_order,
        });
        setDialogOpen(true);
    };

    const handleAddFeature = () => {
        if (featureInput.trim()) {
            setFormData((prev) => ({ ...prev, features: [...prev.features, featureInput.trim()] }));
            setFeatureInput("");
        }
    };

    const handleRemoveFeature = (index: number) => {
        setFormData((prev) => ({ ...prev, features: prev.features.filter((_, i) => i !== index) }));
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            toast({ title: "Erro", description: "Título é obrigatório", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                title: formData.title,
                description: formData.description || null,
                duration_days: formData.duration_days,
                price_cents: formData.price_cents,
                features: formData.features,
                badge_label: formData.badge_label || null,
                is_active: formData.is_active,
                sort_order: formData.sort_order,
            };

            if (editingOffer) {
                const { error } = await supabase
                    .from("highlight_offers")
                    .update(payload)
                    .eq("id", editingOffer.id);
                if (error) throw error;
                toast({ title: "Atualizado", description: "Oferta atualizada com sucesso." });
            } else {
                const { error } = await supabase.from("highlight_offers").insert(payload);
                if (error) throw error;
                toast({ title: "Criado", description: "Nova oferta criada com sucesso." });
            }

            queryClient.invalidateQueries({ queryKey: ["highlight-offers"] });
            setDialogOpen(false);
        } catch (e: any) {
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from("highlight_offers").delete().eq("id", id);
            if (error) throw error;
            toast({ title: "Removido", description: "Oferta removida com sucesso." });
            queryClient.invalidateQueries({ queryKey: ["highlight-offers"] });
        } catch (e: any) {
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
            setOfferToDelete(null);
        }
    };

    if (isLoading) {
        return (
            <Card className="border-white/5 bg-white/5 backdrop-blur-sm">
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card className="border-white/5 bg-white/5 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Pacotes de Destaque</CardTitle>
                    <Button onClick={openCreateDialog} className="bg-primary">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Pacote
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader className="bg-white/5">
                            <TableRow className="border-white/5">
                                <TableHead className="text-muted-foreground">Título</TableHead>
                                <TableHead className="text-muted-foreground">Duração</TableHead>
                                <TableHead className="text-muted-foreground">Preço</TableHead>
                                <TableHead className="text-muted-foreground">Status</TableHead>
                                <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {offers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        Nenhum pacote cadastrado
                                    </TableCell>
                                </TableRow>
                            ) : (
                                offers.map((offer) => (
                                    <TableRow key={offer.id} className="border-white/5 hover:bg-white/5">
                                        <TableCell className="font-medium text-white">
                                            {offer.title}
                                            {offer.badge_label && (
                                                <Badge className="ml-2 bg-orange-500/20 text-orange-400">{offer.badge_label}</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{offer.duration_days} dias</TableCell>
                                        <TableCell className="text-muted-foreground">R$ {(offer.price_cents / 100).toFixed(2)}</TableCell>
                                        <TableCell>
                                            {offer.is_active ? (
                                                <Badge className="bg-green-500/20 text-green-400">Ativo</Badge>
                                            ) : (
                                                <Badge className="bg-gray-500/20 text-gray-400">Inativo</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditDialog(offer)}
                                                    className="h-8 w-8 text-blue-400 hover:bg-blue-400/10"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setOfferToDelete(offer.id)}
                                                    className="h-8 w-8 text-red-400 hover:bg-red-400/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingOffer ? "Editar" : "Criar"} Pacote de Destaque</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Configure os detalhes do pacote de destaque para lojas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Título *</Label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                                    className="bg-black/20 border-white/10"
                                    placeholder="Ex: Destaque Premium"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Badge (Opcional)</Label>
                                <Input
                                    value={formData.badge_label}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, badge_label: e.target.value }))}
                                    className="bg-black/20 border-white/10"
                                    placeholder="Ex: Mais Vendido"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Descrição</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                className="bg-black/20 border-white/10"
                                placeholder="Descrição do pacote..."
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Duração (dias)</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={formData.duration_days}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, duration_days: parseInt(e.target.value) || 1 }))}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Preço (R$)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={(formData.price_cents / 100).toFixed(2)}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, price_cents: Math.round(parseFloat(e.target.value) * 100) || 0 }))}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Features</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={featureInput}
                                    onChange={(e) => setFeatureInput(e.target.value)}
                                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddFeature())}
                                    className="bg-black/20 border-white/10"
                                    placeholder="Digite uma feature e pressione Enter"
                                />
                                <Button type="button" onClick={handleAddFeature} size="sm" className="bg-green-600">
                                    Adicionar
                                </Button>
                            </div>
                            <div className="mt-2 space-y-1">
                                {formData.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center justify-between rounded bg-black/20 px-3 py-2 text-sm">
                                        <span>{feature}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveFeature(idx)}
                                            className="h-6 text-red-400 hover:bg-red-400/10"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3">
                            <Label>Pacote Ativo</Label>
                            <Switch
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)} className="hover:bg-white/10">
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {editingOffer ? "Atualizar" : "Criar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!offerToDelete} onOpenChange={(open) => !open && setOfferToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Oferta</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir esta oferta? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => offerToDelete && handleDelete(offerToDelete)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
