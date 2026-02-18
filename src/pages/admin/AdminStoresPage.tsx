
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Loader2, Store, Edit, Trash2, Power, PowerOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type InternalStore = {
    id: string;
    name: string;
    store_type: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
};

const STORE_TYPE_LABELS: Record<string, string> = {
    suplementos: "Suplementos",
    roupas: "Roupas Fitness",
    artigos: "Artigos Esportivos",
    nutricao: "Comida Fitness",
    equipamentos: "Equipamentos", // Legacy
    servicos: "Serviços" // Legacy
};

export const AdminStoresPage = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [showNewStoreForm, setShowNewStoreForm] = useState(false);

    // New Store State
    const [newStore, setNewStore] = useState({
        name: "",
        storeType: "suplementos",
        description: "",
        ownerEmail: "",
        ownerPassword: "",
        cnpj: "",
        whatsapp: "",
    });
    const [profileImage, setProfileImage] = useState<File | null>(null);
    const [bannerImage, setBannerImage] = useState<File | null>(null);

    const { data: stores = [], isLoading } = useQuery<InternalStore[]>({
        queryKey: ["admin-stores"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("stores")
                .select("id, name, store_type, is_active, created_at, description")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as InternalStore[];
        },
    });

    const filteredStores = stores.filter(store =>
        store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        store.store_type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreateStore = async () => {
        if (!newStore.name || !newStore.ownerEmail || !newStore.ownerPassword) {
            toast({ title: "Preencha os campos obrigatórios", description: "Nome, Email e Senha são necessários.", variant: "destructive" });
            return;
        }

        setIsCreating(true);
        try {
            let profileImageUrl, bannerImageUrl;

            if (profileImage) {
                const ext = profileImage.name.split(".").pop();
                const path = `profile-${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from("marketplace_store_images").upload(path, profileImage);
                if (!error) profileImageUrl = supabase.storage.from("marketplace_store_images").getPublicUrl(path).data.publicUrl;
            }

            if (bannerImage) {
                const ext = bannerImage.name.split(".").pop();
                const path = `banner-${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from("marketplace_store_images").upload(path, bannerImage);
                if (!error) bannerImageUrl = supabase.storage.from("marketplace_store_images").getPublicUrl(path).data.publicUrl;
            }

            const { data, error } = await supabase.functions.invoke("admin-user-management", {
                body: {
                    action: "create_store_owner",
                    email: newStore.ownerEmail,
                    password: newStore.ownerPassword,
                    storeName: newStore.name,
                    storeType: newStore.storeType,
                    storeDescription: newStore.description,
                    profileImageUrl,
                    bannerImageUrl,
                    cnpj: newStore.cnpj,
                    whatsapp: newStore.whatsapp,
                }
            });

            if (error) { // Function error handled by wrapper usually, but check body
                throw new Error(error.message || "Erro desconhecido");
            }

            toast({ title: "Sucesso", description: "Loja criada com sucesso!" });
            setShowNewStoreForm(false);
            setNewStore({
                name: "", storeType: "suplementos", description: "",
                ownerEmail: "", ownerPassword: "", cnpj: "", whatsapp: ""
            });
            setProfileImage(null);
            setBannerImage(null);
            queryClient.invalidateQueries({ queryKey: ["admin-stores"] });

        } catch (e: any) {
            toast({ title: "Erro", description: e.message || "Falha ao criar loja.", variant: "destructive" });
        } finally {
            setIsCreating(false);
        }
    };

    const toggleStoreStatus = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from("stores")
            .update({ is_active: !currentStatus })
            .eq("id", id);

        if (error) {
            toast({ title: "Erro", description: "Não foi possível atualizar o status.", variant: "destructive" });
        } else {
            toast({ title: "Atualizado", description: `Loja ${!currentStatus ? "ativada" : "desativada"}.` });
            queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Lojas Parceiras</h1>
                    <p className="text-sm text-muted-foreground">Gerencie as lojas do marketplace.</p>
                </div>
                <Dialog open={showNewStoreForm} onOpenChange={setShowNewStoreForm}>
                    <DialogTrigger asChild>
                        <Button className="bg-green-600 hover:bg-green-700 text-white">
                            <Plus className="mr-2 h-4 w-4" /> Nova Loja
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a1a] border-white/10 text-white sm:max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Cadastrar Nova Loja</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Crie uma nova loja e a conta do lojista responsável.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Nome da Loja</Label>
                                    <Input
                                        value={newStore.name}
                                        onChange={e => setNewStore({ ...newStore, name: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tipo</Label>
                                    <Select
                                        value={newStore.storeType}
                                        onValueChange={v => setNewStore({ ...newStore, storeType: v })}
                                    >
                                        <SelectTrigger className="bg-black/20 border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="suplementos">Suplementos</SelectItem>
                                            <SelectItem value="roupas">Roupas Fitness</SelectItem>
                                            <SelectItem value="artigos">Artigos Esportivos</SelectItem>
                                            <SelectItem value="nutricao">Comida Fitness</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Descrição</Label>
                                <Textarea
                                    value={newStore.description}
                                    onChange={e => setNewStore({ ...newStore, description: e.target.value })}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Email do Lojista</Label>
                                    <Input
                                        type="email"
                                        value={newStore.ownerEmail}
                                        onChange={e => setNewStore({ ...newStore, ownerEmail: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Senha Temporária</Label>
                                    <Input
                                        type="password"
                                        value={newStore.ownerPassword}
                                        onChange={e => setNewStore({ ...newStore, ownerPassword: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>CNPJ (Opcional)</Label>
                                    <Input
                                        value={newStore.cnpj}
                                        onChange={e => setNewStore({ ...newStore, cnpj: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>WhatsApp (Opcional)</Label>
                                    <Input
                                        value={newStore.whatsapp}
                                        onChange={e => setNewStore({ ...newStore, whatsapp: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Logo</Label>
                                    <Input type="file" onChange={e => setProfileImage(e.target.files?.[0] || null)} className="bg-black/20 border-white/10 text-xs" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Banner</Label>
                                    <Input type="file" onChange={e => setBannerImage(e.target.files?.[0] || null)} className="bg-black/20 border-white/10 text-xs" />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setShowNewStoreForm(false)}>Cancelar</Button>
                            <Button onClick={handleCreateStore} disabled={isCreating} className="bg-green-600 hover:bg-green-700">
                                {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Criar Loja"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-white/5 bg-white/5 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-medium text-white">Todas as Lojas</CardTitle>
                        <div className="relative w-[250px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar loja..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9 bg-black/20 border-white/10 focus:border-green-500/50"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-white/5 bg-black/20 text-sm">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-white/5 hover:bg-white/5">
                                    <TableHead className="text-muted-foreground">Nome</TableHead>
                                    <TableHead className="text-muted-foreground">Tipo</TableHead>
                                    <TableHead className="text-muted-foreground">Status</TableHead>
                                    <TableHead className="text-muted-foreground">Criado em</TableHead>
                                    <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">Carregando...</TableCell></TableRow>
                                ) : filteredStores.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Nenhuma loja encontrada.</TableCell></TableRow>
                                ) : (
                                    filteredStores.map((store) => (
                                        <TableRow key={store.id} className="border-white/5 hover:bg-white/5">
                                            <TableCell className="font-medium text-white">
                                                <div className="flex items-center gap-2">
                                                    <Store className="h-4 w-4 text-muted-foreground" />
                                                    {store.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="border-white/10 bg-white/5 capitalize">
                                                    {STORE_TYPE_LABELS[store.store_type] || store.store_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {store.is_active ? (
                                                    <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30">Ativo</Badge>
                                                ) : (
                                                    <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30">Inativo</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(store.created_at).toLocaleDateString("pt-BR")}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10"
                                                    onClick={() => toggleStoreStatus(store.id, store.is_active)}
                                                    title={store.is_active ? "Desativar" : "Ativar"}
                                                >
                                                    {store.is_active ? <Power className="h-4 w-4 text-green-400" /> : <PowerOff className="h-4 w-4 text-red-500" />}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminStoresPage;
