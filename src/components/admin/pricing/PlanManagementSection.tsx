import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Settings2 } from "lucide-react";
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

interface Plan {
    id: string;
    name: string;
    user_type: string;
    price_cents: number;
    validity_days: number;
    is_active: boolean;
    modules?: string[]; // Simplified for the component state
}

interface Module {
    id: string;
    key: string;
    label: string;
}

interface PlanManagementSectionProps {
    userType: 'ALUNO' | 'PROFISSIONAL' | 'LOJISTA';
    title: string;
}

export const PlanManagementSection = ({ userType, title }: PlanManagementSectionProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Form state
    const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [planToDelete, setPlanToDelete] = useState<{ id: string, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Fetch plans
    const { data: plans = [], isLoading: isLoadingPlans } = useQuery({
        queryKey: ["app-access-plans", userType],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("app_access_plans")
                .select(`
                    *,
                    plan_modules (
                        module_id,
                        access_modules (key)
                    )
                `)
                .eq("user_type", userType)
                .order("price_cents");

            if (error) throw error;

            return data.map((plan: any) => ({
                ...plan,
                modules: plan.plan_modules?.map((pm: any) => pm.access_modules?.key) || []
            }));
        },
    });

    // Fetch modules
    const { data: modules = [] } = useQuery({
        queryKey: ["access-modules"],
        queryFn: async () => {
            const { data, error } = await supabase.from("access_modules").select("*").order("label");
            if (error) throw error;
            return data as Module[];
        },
    });

    const handleSavePlan = async () => {
        if (!editingPlan?.name) return;

        setIsSaving(true);
        try {
            const planData = {
                name: editingPlan.name,
                user_type: userType,
                price_cents: Math.round(Number(editingPlan.price_cents || 0) * 100),
                validity_days: Number(editingPlan.validity_days || 30),
                is_active: true,
            };

            let planId = editingPlan.id;

            if (planId) {
                // Update
                const { error } = await supabase
                    .from("app_access_plans")
                    .update(planData)
                    .eq("id", planId);
                if (error) throw error;
            } else {
                // Insert
                const { data, error } = await supabase
                    .from("app_access_plans")
                    .insert(planData)
                    .select()
                    .single();
                if (error) throw error;
                planId = data.id;
            }

            // Sync Modules
            // 1. Delete existing modules for this plan
            await supabase.from("plan_modules").delete().eq("plan_id", planId);

            // 2. Insert new modules
            if (selectedModules.length > 0) {
                const moduleInserts = selectedModules.map(moduleKey => {
                    const mod = modules.find(m => m.key === moduleKey);
                    return { plan_id: planId, module_id: mod?.id };
                });
                const { error: moduleError } = await supabase.from("plan_modules").insert(moduleInserts);
                if (moduleError) throw moduleError;
            }

            toast({ title: "Sucesso", description: "Plano salvo com sucesso." });
            setIsDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["app-access-plans", userType] });
        } catch (error: any) {
            toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePlan = async (id: string) => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from("app_access_plans").delete().eq("id", id);
            if (error) throw error;
            toast({ title: "Excluído", description: "Plano removido com sucesso." });
            queryClient.invalidateQueries({ queryKey: ["app-access-plans", userType] });
        } catch (error: any) {
            toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
            setPlanToDelete(null);
        }
    };

    const openCreateDialog = () => {
        setEditingPlan({ name: "", price_cents: 0, validity_days: 30 });
        setSelectedModules([]);
        setIsDialogOpen(true);
    };

    const openEditDialog = (plan: Plan) => {
        setEditingPlan({ ...plan, price_cents: plan.price_cents / 100 });
        setSelectedModules(plan.modules || []);
        setIsDialogOpen(true);
    };

    if (isLoadingPlans) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <Button onClick={openCreateDialog} className="bg-primary text-black hover:bg-primary/90">
                    <Plus className="mr-2 h-4 w-4" /> Novo Plano
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plans.length === 0 ? (
                    <div className="col-span-full py-12 text-center border border-white/5 rounded-3xl bg-white/[0.02] backdrop-blur-sm">
                        <p className="text-zinc-500 italic">Nenhum plano configurado para {userType.toLowerCase()}s.</p>
                    </div>
                ) : (
                    plans.map((plan: Plan) => (
                        <Card key={plan.id} className="relative overflow-hidden border-white/5 bg-black/40 backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02] group hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10">
                            {/* Card Glow Effect */}
                            <div className="absolute -inset-0.5 bg-gradient-to-b from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                            <CardHeader className="relative z-10">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-black italic uppercase tracking-tighter text-white">{plan.name}</CardTitle>
                                        <div className="mt-1 flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-primary uppercase">
                                            <span className="h-px w-4 bg-primary/50" />
                                            R$ {(plan.price_cents / 100).toFixed(2)} / {plan.validity_days} dias
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full" onClick={() => openEditDialog(plan)}>
                                            <Settings2 className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-full" onClick={() => {
                                            if (userType === 'ALUNO' && (plan.name.toUpperCase().includes('ADVANCE') || plan.name.toUpperCase().includes('ELITE'))) {
                                                toast({ title: "Ação bloqueada", description: "Planos padrão do sistema não podem ser excluídos.", variant: "destructive" });
                                                return;
                                            }
                                            setPlanToDelete({ id: plan.id, name: plan.name });
                                        }}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="relative z-10">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Recursos / Módulos</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {plan.modules?.length ? (
                                                plan.modules.map(modKey => {
                                                    const mod = modules.find(m => m.key === modKey);
                                                    return (
                                                        <Badge key={modKey} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-bold uppercase py-0.5 px-2">
                                                            {mod?.label || modKey}
                                                        </Badge>
                                                    );
                                                })
                                            ) : (
                                                <span className="text-[10px] text-zinc-600 font-medium italic">Sem módulos específicos</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingPlan?.id ? "Editar Plano" : "Novo Plano"}</DialogTitle>
                        <DialogDescription className="text-zinc-400 text-xs">
                            Crie ou ajuste as configurações de acesso para {userType.toLowerCase()}s.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Nome do Plano</Label>
                            <Input
                                value={editingPlan?.name || ""}
                                onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                                placeholder="Ex: Premium, Diamond, Basic..."
                                className="bg-black/40 border-white/10 h-11 rounded-xl text-white font-bold"
                                disabled={userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE'))}
                            />
                            {userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE')) && (
                                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">O nome deste plano padrão não pode ser alterado.</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Valor (R$)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">R$</span>
                                    <Input
                                        type="number"
                                        value={editingPlan?.price_cents || 0}
                                        onChange={(e) => setEditingPlan({ ...editingPlan, price_cents: Number(e.target.value) })}
                                        className="bg-black/40 border-white/10 pl-9 h-11 rounded-xl text-white font-black italic"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Vigência (Dias)</Label>
                                <Input
                                    type="number"
                                    value={editingPlan?.validity_days || 30}
                                    onChange={(e) => setEditingPlan({ ...editingPlan, validity_days: Number(e.target.value) })}
                                    className="bg-black/40 border-white/10 h-11 rounded-xl text-white font-bold"
                                    disabled={userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE'))}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Módulos do Sistema</Label>
                            <div className={`grid grid-cols-2 gap-3 p-4 rounded-2xl bg-black/40 border border-white/5 ${userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE')) ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                {modules.map((mod) => (
                                    <div key={mod.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`mod-${mod.id}`}
                                            checked={selectedModules.includes(mod.key)}
                                            onCheckedChange={(checked) => {
                                                if (userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE'))) return;
                                                if (checked) {
                                                    setSelectedModules([...selectedModules, mod.key]);
                                                } else {
                                                    setSelectedModules(selectedModules.filter(k => k !== mod.key));
                                                }
                                            }}
                                            disabled={userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE'))}
                                        />
                                        <label
                                            htmlFor={`mod-${mod.id}`}
                                            className="text-[11px] font-bold uppercase tracking-tight text-zinc-400 peer-disabled:opacity-70"
                                        >
                                            {mod.label}
                                        </label>
                                    </div>
                                ))}
                            </div>
                            {userType === 'ALUNO' && !!editingPlan?.id && (editingPlan?.name?.toUpperCase().includes('ADVANCE') || editingPlan?.name?.toUpperCase().includes('ELITE')) && (
                                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">Os módulos deste plano padrão não podem ser alterados.</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            onClick={handleSavePlan}
                            disabled={isSaving || !editingPlan?.name}
                            className="w-full bg-primary text-black hover:bg-primary/90"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar Plano</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Plano</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir o plano <strong>{planToDelete?.name}</strong>? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => planToDelete && handleDeletePlan(planToDelete.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
