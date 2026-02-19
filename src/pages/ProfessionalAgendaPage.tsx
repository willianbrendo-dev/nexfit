import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfessionalPlanModules } from "@/hooks/useProfessionalPlanModules";
import { useToast } from "@/hooks/use-toast";
import { ProfessionalFloatingNavIsland } from "@/components/navigation/ProfessionalFloatingNavIsland";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Calendar as CalendarIcon,
    Clock,
    User,
    MessageSquare,
    Lock,
    Rocket,
    Loader2,
    CheckCircle2,
    XCircle
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

interface HireRequest {
    id: string;
    status: string;
    message: string;
    created_at: string;
    student_id: string;
    profiles: {
        display_name: string;
        nome: string;
    };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: "Pendente", color: "text-yellow-400", icon: Clock },
    accepted: { label: "Aceito", color: "text-green-400", icon: CheckCircle2 },
    rejected: { label: "Rejeitado", color: "text-red-400", icon: XCircle },
    completed: { label: "Concluído", color: "text-blue-400", icon: CheckCircle2 },
};

export default function ProfessionalAgendaPage() {
    const { user } = useAuth();
    const { hasModule, isLoading: loadingPlan } = useProfessionalPlanModules();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [hires, setHires] = useState<HireRequest[]>([]);
    const [date, setDate] = useState<Date | undefined>(new Date());

    const canAccessAgenda = hasModule("agenda");

    useEffect(() => {
        if (canAccessAgenda && user) {
            loadAgendaData();
        }
    }, [user, canAccessAgenda]);

    const loadAgendaData = async () => {
        try {
            // Get professional id first
            const { data: profData } = await supabase
                .from("professionals")
                .select("id")
                .eq("user_id", user?.id)
                .single();

            if (!profData) return;

            const { data: hiresData, error } = await supabase
                .from("professional_hires")
                .select(`
                    id,
                    status,
                    message,
                    created_at,
                    student_id,
                    profiles!professional_hires_student_id_fkey(display_name, nome)
                `)
                .eq("professional_id", profData.id)
                .order("created_at", { ascending: false });

            if (error) throw error;
            setHires((hiresData || []) as any);
        } catch (error: any) {
            console.error("Load agenda error:", error);
            toast({
                title: "Erro ao carregar agenda",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (loadingPlan || (canAccessAgenda && loading)) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-950">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!canAccessAgenda) {
        return (
            <main className="flex h-screen bg-black overflow-hidden flex-col items-center justify-center p-8 text-center">
                <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <Lock className="h-12 w-12 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-4">Agenda Elite</h1>
                <p className="text-zinc-500 max-w-md mb-8">
                    A funcionalidade de Agenda e Gestão de Alunos é exclusiva para profissionais do plano Elite. Gerencie seus horários com eficiência!
                </p>
                <div className="flex gap-4">
                    <Button onClick={() => navigate("/professional/dashboard")} variant="outline" className="border-white/10 text-white">
                        Voltar ao Início
                    </Button>
                    <Button onClick={() => navigate("/professional/pricing")} className="bg-primary text-black hover:bg-primary/90">
                        <Rocket className="mr-2 h-4 w-4" /> Ser Elite agora
                    </Button>
                </div>
                <ProfessionalFloatingNavIsland />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-black pb-32">
            <header className="p-6 pt-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">
                    Gestão
                </p>
                <h1 className="text-3xl font-black text-white uppercase tracking-tight">
                    Sua Agenda
                </h1>
            </header>

            <div className="px-4 space-y-6">
                {/* Calendar View */}
                <Card className="border-white/10 bg-white/5 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white text-sm flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-primary" />
                            Calendário de Sessões
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            className="rounded-md border border-white/5 bg-transparent text-white"
                        />
                    </CardContent>
                </Card>

                {/* Hires / Appointments List */}
                <section className="space-y-4">
                    <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Próximas sessões / Contratações
                    </h2>

                    {hires.length === 0 ? (
                        <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 text-center">
                            <p className="text-sm text-zinc-500">Nenhuma contratação encontrada.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {hires.map((hire) => {
                                const status = STATUS_CONFIG[hire.status] || STATUS_CONFIG.pending;
                                const StatusIcon = status.icon;

                                return (
                                    <div
                                        key={hire.id}
                                        className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.03] p-5 backdrop-blur-md transition-all hover:bg-white/[0.06]"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-sm font-bold text-white">
                                                        {hire.profiles?.display_name || hire.profiles?.nome || "Aluno"}
                                                    </h3>
                                                    <Badge variant="outline" className={`${status.color} border-current text-[9px] h-5`}>
                                                        <StatusIcon className="mr-1 h-3 w-3" />
                                                        {status.label}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-zinc-400 line-clamp-1 mb-3">
                                                    {hire.message || "Sem mensagem inicial"}
                                                </p>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(hire.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>

                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-10 w-10 rounded-full text-primary hover:bg-primary/10"
                                                onClick={() => navigate("/professional/chat")}
                                            >
                                                <MessageSquare className="h-5 w-5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            <ProfessionalFloatingNavIsland />
        </main>
    );
}
