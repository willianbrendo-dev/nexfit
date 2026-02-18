
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Trash2, Edit, Stethoscope, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type TelemedServico = {
    id: string;
    nome: string;
    slug: string;
    icone: string;
    icon_url?: string | null;
    ativo?: boolean;
};

type TelemedProfissional = {
    id: string;
    nome: string;
    crm_crp: string | null;
    bio: string | null;
    foto_url: string | null;
    preco_base: number | null;
    disponivel: boolean;
    servico_id: string | null;
};

export const AdminTelemedicinaPage = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("servicos");

    // Service State
    const [newService, setNewService] = useState({ nome: "", slug: "", icone: "" });
    const [serviceIconFile, setServiceIconFile] = useState<File | null>(null);
    const [isCreatingService, setIsCreatingService] = useState(false);
    const [showServiceDialog, setShowServiceDialog] = useState(false);

    // Professional State
    const [newProfessional, setNewProfessional] = useState({
        nome: "", crm_crp: "", bio: "", preco_base: "", servico_id: "",
        email: "", phone: "", instagram: "", password: ""
    });
    const [profPhotoFile, setProfPhotoFile] = useState<File | null>(null);
    const [profCoverFile, setProfCoverFile] = useState<File | null>(null);
    const [isCreatingProf, setIsCreatingProf] = useState(false);
    const [isUpdatingProf, setIsUpdatingProf] = useState(false);
    const [showProfDialog, setShowProfDialog] = useState(false);
    const [showEditProfDialog, setShowEditProfDialog] = useState(false);
    const [editingProfessional, setEditingProfessional] = useState<any>(null);
    const [profToDelete, setProfToDelete] = useState<any>(null);
    const [serviceToDelete, setServiceToDelete] = useState<any>(null);
    const [isDeleting, setIsDeleting] = useState(false);


    const { data: services = [], isLoading: servicesLoading } = useQuery<TelemedServico[]>({
        queryKey: ["telemedicina-servicos"],
        queryFn: async () => {
            const { data, error } = await supabase.from("telemedicina_servicos").select("*").order("nome");
            if (error) throw error;
            return data;
        },
    });

    const { data: professionals = [], isLoading: profsLoading } = useQuery<any[]>({
        queryKey: ["professionals"],
        queryFn: async () => {
            const { data, error } = await supabase.from("professionals").select("*").order("name");
            if (error) throw error;
            return data;
        },
    });

    const handleCreateService = async () => {
        if (!newService.nome || !newService.slug) {
            toast({ title: "Erro", description: "Nome e Slug são obrigatórios.", variant: "destructive" });
            return;
        }
        setIsCreatingService(true);
        try {
            const { data, error } = await supabase.from("telemedicina_servicos").insert({
                nome: newService.nome,
                slug: newService.slug,
                icone: newService.icone || newService.slug,
                ativo: true
            }).select().single();

            if (error) throw error;

            if (serviceIconFile && data) {
                const ext = serviceIconFile.name.split(".").pop();
                const path = `servico-${data.id}-${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from("telemedicina_icons").upload(path, serviceIconFile);
                if (!upErr) {
                    const publicUrl = supabase.storage.from("telemedicina_icons").getPublicUrl(path).data.publicUrl;
                    await supabase.from("telemedicina_servicos").update({ icon_url: publicUrl }).eq("id", data.id);
                }
            }

            toast({ title: "Sucesso", description: "Serviço criado." });
            setShowServiceDialog(false);
            setNewService({ nome: "", slug: "", icone: "" });
            setServiceIconFile(null);
            queryClient.invalidateQueries({ queryKey: ["telemedicina-servicos"] });
        } catch (e: any) {
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setIsCreatingService(false);
        }
    };

    const handleDeleteService = async (id: string) => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from("telemedicina_servicos").delete().eq("id", id);
            if (error) throw error;
            toast({ title: "Removido", description: "Serviço removido com sucesso." });
            queryClient.invalidateQueries({ queryKey: ["telemedicina-servicos"] });
        } catch (e: any) {
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
            setServiceToDelete(null);
        }
    };

    const handleCreateProfessional = async () => {
        if (!newProfessional.nome || !newProfessional.servico_id || !newProfessional.email || !newProfessional.password) {
            toast({ title: "Erro", description: "Nome, Especialidade, Email e Senha são obrigatórios.", variant: "destructive" });
            return;
        }

        if (newProfessional.password.length < 6) {
            toast({ title: "Erro", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
            return;
        }

        setIsCreatingProf(true);
        try {
            // 1. Create auth user
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: newProfessional.email,
                password: newProfessional.password,
                email_confirm: true,
                user_metadata: {
                    name: newProfessional.nome,
                    role: "professional"
                }
            });

            if (authError) throw new Error(`Erro ao criar usuário: ${authError.message}`);
            if (!authData.user) throw new Error("Usuário não foi criado");

            const userId = authData.user.id;

            // 2. Upload images
            let profileImageUrl = null;
            let coverImageUrl = null;

            if (profPhotoFile) {
                const ext = profPhotoFile.name.split(".").pop();
                const path = `profile-${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from("professional-images").upload(path, profPhotoFile);
                if (!upErr) {
                    profileImageUrl = supabase.storage.from("professional-images").getPublicUrl(path).data.publicUrl;
                }
            }

            if (profCoverFile) {
                const ext = profCoverFile.name.split(".").pop();
                const path = `cover-${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from("professional-images").upload(path, profCoverFile);
                if (!upErr) {
                    coverImageUrl = supabase.storage.from("professional-images").getPublicUrl(path).data.publicUrl;
                }
            }

            // 3. Create professional record
            const { error: profError } = await supabase.from("professionals").insert({
                user_id: userId,
                name: newProfessional.nome,
                crm_crp: newProfessional.crm_crp || null,
                specialty: services.find(s => s.id === newProfessional.servico_id)?.nome || "Especialista",
                telemedicina_servico_id: newProfessional.servico_id,
                bio: newProfessional.bio || null,
                base_price: newProfessional.preco_base ? Number(newProfessional.preco_base) : null,
                email: newProfessional.email,
                phone: newProfessional.phone || null,
                instagram: newProfessional.instagram || null,
                profile_image_url: profileImageUrl,
                cover_image_url: coverImageUrl,
                lp_unlocked: false,
            });

            if (profError) throw profError;

            toast({ title: "Sucesso", description: `Profissional ${newProfessional.nome} criado com sucesso!` });
            setShowProfDialog(false);
            setNewProfessional({ nome: "", crm_crp: "", bio: "", preco_base: "", servico_id: "", email: "", phone: "", instagram: "", password: "" });
            setProfPhotoFile(null);
            setProfCoverFile(null);
            queryClient.invalidateQueries({ queryKey: ["professionals"] });

        } catch (e: any) {
            console.error("Error creating professional:", e);
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setIsCreatingProf(false);
        }
    };

    const handleUpdateProfessional = async () => {
        if (!editingProfessional || !editingProfessional.name || !editingProfessional.specialty) {
            toast({ title: "Erro", description: "Nome e Especialidade são obrigatórios.", variant: "destructive" });
            return;
        }

        setIsUpdatingProf(true);
        try {
            const { error } = await supabase.from("professionals").update({
                name: editingProfessional.name,
                crm_crp: editingProfessional.crm_crp || null,
                specialty: services.find(s => s.id === editingProfessional.telemedicina_servico_id)?.nome || editingProfessional.specialty,
                telemedicina_servico_id: editingProfessional.telemedicina_servico_id,
                bio: editingProfessional.bio || null,
                base_price: editingProfessional.base_price ? Number(editingProfessional.base_price) : null,
                phone: editingProfessional.phone || null,
                instagram: editingProfessional.instagram || null,
            }).eq("id", editingProfessional.id);

            if (error) throw error;

            toast({ title: "Sucesso", description: `Profissional ${editingProfessional.name} atualizado!` });
            setShowEditProfDialog(false);
            setEditingProfessional(null);
            queryClient.invalidateQueries({ queryKey: ["professionals"] });
        } catch (e: any) {
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setIsUpdatingProf(false);
        }
    };

    const handleDeleteProfessional = async (id: string) => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from("professionals").delete().eq("id", id);
            if (error) throw error;
            toast({ title: "Removido", description: "Profissional removido com sucesso." });
            queryClient.invalidateQueries({ queryKey: ["professionals"] });
        } catch (e: any) {
            toast({ title: "Erro", description: e.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
            setProfToDelete(null);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Telemedicina</h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie especialidades e profissionais da saúde.
                    </p>
                </div>
            </div>

            <Tabs defaultValue="servicos" className="w-full" onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-black/20 border-white/10">
                    <TabsTrigger value="servicos">Serviços e Especialidades</TabsTrigger>
                    <TabsTrigger value="profissionais">Profissionais</TabsTrigger>
                </TabsList>

                <TabsContent value="servicos" className="space-y-4 mt-4">
                    <div className="flex justify-end">
                        <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
                            <DialogTrigger asChild>
                                <Button className="bg-green-600 hover:bg-green-700 text-white">
                                    <Plus className="mr-2 h-4 w-4" /> Novo Serviço
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#1a1a1a] border-white/10 text-white">
                                <DialogHeader><DialogTitle>Novo Serviço</DialogTitle></DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Nome (Ex: Psicologia)</Label>
                                        <Input value={newService.nome} onChange={e => setNewService({ ...newService, nome: e.target.value })} className="bg-black/20 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Slug (Ex: psicologia)</Label>
                                        <Input value={newService.slug} onChange={e => setNewService({ ...newService, slug: e.target.value })} className="bg-black/20 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Ícone (SVG/PNG)</Label>
                                        <Input type="file" onChange={e => setServiceIconFile(e.target.files?.[0] || null)} className="bg-black/20 border-white/10" />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setShowServiceDialog(false)}>Cancelar</Button>
                                    <Button onClick={handleCreateService} disabled={isCreatingService} className="bg-green-600">
                                        {isCreatingService ? <Loader2 className="animate-spin" /> : "Criar"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Card className="border-white/5 bg-white/5 backdrop-blur-sm">
                        <CardHeader><CardTitle className="text-base text-white">Serviços Ativos</CardTitle></CardHeader>
                        <CardContent>
                            <div className="rounded-md border border-white/5 bg-black/20 text-sm">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-white/5">
                                            <TableHead className="text-muted-foreground w-[50px]">Ícone</TableHead>
                                            <TableHead className="text-muted-foreground">Nome</TableHead>
                                            <TableHead className="text-muted-foreground">Slug</TableHead>
                                            <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {servicesLoading ? (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Carregando...</TableCell></TableRow>
                                        ) : services.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Nenhum serviço.</TableCell></TableRow>
                                        ) : (
                                            services.map(service => (
                                                <TableRow key={service.id} className="border-white/5 hover:bg-white/5">
                                                    <TableCell>
                                                        {service.icon_url ? (
                                                            <img src={service.icon_url} alt={service.nome} className="h-6 w-6 object-contain" />
                                                        ) : (
                                                            <Stethoscope className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-medium text-white">{service.nome}</TableCell>
                                                    <TableCell className="text-muted-foreground">{service.slug}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-500/10" onClick={() => setServiceToDelete(service)}>
                                                            <Trash2 className="h-4 w-4" />
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
                </TabsContent>

                <TabsContent value="profissionais" className="space-y-4 mt-4">
                    <div className="flex justify-end">
                        <Dialog open={showProfDialog} onOpenChange={setShowProfDialog}>
                            <DialogTrigger asChild>
                                <Button className="bg-green-600 hover:bg-green-700 text-white">
                                    <Plus className="mr-2 h-4 w-4" /> Novo Profissional
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>Novo Profissional</DialogTitle></DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Nome Completo *</Label>
                                        <Input value={newProfessional.nome} onChange={e => setNewProfessional({ ...newProfessional, nome: e.target.value })} className="bg-black/20 border-white/10" placeholder="Ex: Dr. João Silva" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>CRM/CRP/CREF</Label>
                                            <Input value={newProfessional.crm_crp || ""} onChange={e => setNewProfessional({ ...newProfessional, crm_crp: e.target.value })} className="bg-black/20 border-white/10" placeholder="Ex: CRM 12345-SP" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Preço Base (R$)</Label>
                                            <Input type="number" step="0.01" value={newProfessional.preco_base || ""} onChange={e => setNewProfessional({ ...newProfessional, preco_base: e.target.value })} className="bg-black/20 border-white/10" placeholder="150.00" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Serviço de Telemedicina *</Label>
                                        <Select onValueChange={v => setNewProfessional({ ...newProfessional, servico_id: v })}>
                                            <SelectTrigger className="bg-black/20 border-white/10"><SelectValue placeholder="Selecione o serviço..." /></SelectTrigger>
                                            <SelectContent>
                                                {services.map(service => (
                                                    <SelectItem key={service.id} value={service.id}>
                                                        {service.nome}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Bio/Descrição</Label>
                                        <textarea value={newProfessional.bio || ""} onChange={e => setNewProfessional({ ...newProfessional, bio: e.target.value })} className="w-full min-h-[80px] rounded-md bg-black/20 border border-white/10 px-3 py-2 text-sm text-white" placeholder="Experiência e especialidades..." />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Email *</Label>
                                            <Input type="email" value={newProfessional.email || ""} onChange={e => setNewProfessional({ ...newProfessional, email: e.target.value })} className="bg-black/20 border-white/10" placeholder="contato@exemplo.com" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Senha *</Label>
                                            <Input type="password" value={newProfessional.password || ""} onChange={e => setNewProfessional({ ...newProfessional, password: e.target.value })} className="bg-black/20 border-white/10" placeholder="Mínimo 6 caracteres" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Telefone</Label>
                                            <Input value={newProfessional.phone || ""} onChange={e => setNewProfessional({ ...newProfessional, phone: e.target.value })} className="bg-black/20 border-white/10" placeholder="(11) 99999-9999" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Instagram</Label>
                                            <Input value={newProfessional.instagram || ""} onChange={e => setNewProfessional({ ...newProfessional, instagram: e.target.value })} className="bg-black/20 border-white/10" placeholder="@usuario" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Foto de Perfil</Label>
                                            <Input type="file" accept="image/*" onChange={e => setProfPhotoFile(e.target.files?.[0] || null)} className="bg-black/20 border-white/10" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Foto de Capa</Label>
                                            <Input type="file" accept="image/*" onChange={e => setProfCoverFile(e.target.files?.[0] || null)} className="bg-black/20 border-white/10" />
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setShowProfDialog(false)}>Cancelar</Button>
                                    <Button onClick={handleCreateProfessional} disabled={isCreatingProf} className="bg-green-600">
                                        {isCreatingProf ? <Loader2 className="animate-spin" /> : "Criar"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Card className="border-white/5 bg-white/5 backdrop-blur-sm">
                        <CardHeader><CardTitle className="text-base text-white">Profissionais Cadastrados</CardTitle></CardHeader>
                        <CardContent>
                            <div className="rounded-md border border-white/5 bg-black/20 text-sm">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-white/5">
                                            <TableHead className="text-muted-foreground">Nome</TableHead>
                                            <TableHead className="text-muted-foreground">Registro</TableHead>
                                            <TableHead className="text-muted-foreground">Preço</TableHead>
                                            <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {profsLoading ? (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Carregando...</TableCell></TableRow>
                                        ) : professionals.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Nenhum profissional.</TableCell></TableRow>
                                        ) : (
                                            professionals.map(prof => (
                                                <TableRow key={prof.id} className="border-white/5 hover:bg-white/5">
                                                    <TableCell className="font-medium text-white">
                                                        <div className="flex items-center gap-2">
                                                            <User className="h-4 w-4 text-muted-foreground" />
                                                            {prof.name}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">{prof.crm_crp || "-"}</TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {prof.base_price ? `R$ ${Number(prof.base_price).toFixed(2)}` : "A combinar"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-blue-400 hover:bg-blue-500/10"
                                                                onClick={() => {
                                                                    setEditingProfessional(prof);
                                                                    setShowEditProfDialog(true);
                                                                }}
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                                                                onClick={() => setProfToDelete(prof)}
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
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Delete Professional AlertDialog */}
            <AlertDialog open={!!profToDelete} onOpenChange={(open) => !open && setProfToDelete(null)}>
                <AlertDialogContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Profissional</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            Tem certeza que deseja excluir o profissional <strong className="text-white">{profToDelete?.name}</strong>? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting} className="border-white/10 hover:bg-white/5">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => profToDelete && handleDeleteProfessional(profToDelete.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Service AlertDialog */}
            <AlertDialog open={!!serviceToDelete} onOpenChange={(open) => !open && setServiceToDelete(null)}>
                <AlertDialogContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Serviço</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            Tem certeza que deseja excluir o serviço <strong className="text-white">{serviceToDelete?.nome}</strong>? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting} className="border-white/10 hover:bg-white/5">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => serviceToDelete && handleDeleteService(serviceToDelete.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Edit Professional Dialog */}
            <Dialog open={showEditProfDialog} onOpenChange={setShowEditProfDialog}>
                <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Editar Profissional</DialogTitle></DialogHeader>
                    {editingProfessional && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Nome Completo *</Label>
                                <Input
                                    value={editingProfessional.name}
                                    onChange={e => setEditingProfessional({ ...editingProfessional, name: e.target.value })}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>CRM/CRP/CREF</Label>
                                    <Input
                                        value={editingProfessional.crm_crp || ""}
                                        onChange={e => setEditingProfessional({ ...editingProfessional, crm_crp: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Preço Base (R$)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={editingProfessional.base_price || ""}
                                        onChange={e => setEditingProfessional({ ...editingProfessional, base_price: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Serviço de Telemedicina *</Label>
                                <Select
                                    value={editingProfessional.telemedicina_servico_id}
                                    onValueChange={v => setEditingProfessional({ ...editingProfessional, telemedicina_servico_id: v })}
                                >
                                    <SelectTrigger className="bg-black/20 border-white/10"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {services.map(service => (
                                            <SelectItem key={service.id} value={service.id}>
                                                {service.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Bio/Descrição</Label>
                                <textarea
                                    value={editingProfessional.bio || ""}
                                    onChange={e => setEditingProfessional({ ...editingProfessional, bio: e.target.value })}
                                    className="w-full min-h-[80px] rounded-md bg-black/20 border border-white/10 px-3 py-2 text-sm text-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Telefone</Label>
                                    <Input
                                        value={editingProfessional.phone || ""}
                                        onChange={e => setEditingProfessional({ ...editingProfessional, phone: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Instagram</Label>
                                    <Input
                                        value={editingProfessional.instagram || ""}
                                        onChange={e => setEditingProfessional({ ...editingProfessional, instagram: e.target.value })}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => {
                            setShowEditProfDialog(false);
                            setEditingProfessional(null);
                        }}>Cancelar</Button>
                        <Button onClick={handleUpdateProfessional} disabled={isUpdatingProf} className="bg-green-600">
                            {isUpdatingProf ? <Loader2 className="animate-spin" /> : "Salvar Alterações"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminTelemedicinaPage;
