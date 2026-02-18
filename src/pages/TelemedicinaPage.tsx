import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Apple,
  ArrowLeft,
  Brain,
  Dumbbell,
  HeartPulse,
  Stethoscope,
  User,
  QrCode,
  Copy,
  CheckCircle2,
  DollarSign,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useToast } from "@/hooks/use-toast";
import { createPixPayment, checkPixPaymentStatus, PixPaymentResult } from "@/lib/pixPaymentTracking";
import { HubServiceButton } from "@/components/dashboard/HubServiceButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const HORARIOS_DISPONIVEIS = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00"] as const;
type HorarioDisponivel = (typeof HORARIOS_DISPONIVEIS)[number];

const getServicoIcon = (slug: string) => {
  const key = (slug || "").toLowerCase();

  // Mapeamento simples por slug/palavras-chave (pode ajustar conforme seus slugs reais)
  if (key.includes("cardio") || key.includes("coracao") || key.includes("coração")) return HeartPulse;
  if (key.includes("neuro") || key.includes("mente") || key.includes("psico")) return Brain;
  if (key.includes("nutri") || key.includes("aliment") || key.includes("dieta")) return Apple;
  if (key.includes("fisio") || key.includes("treino") || key.includes("ortop")) return Dumbbell;

  return Stethoscope;
};

interface TelemedServico {
  id: string;
  nome: string;
  slug: string;
  icone: string | null;
  icon_url: string | null;
}

interface TelemedProfissional {
  id: string;
  name: string;
  bio: string | null;
  base_price: number | null;
  is_available: boolean | null;
  telemedicina_servico_id: string | null;
  profile_image_url: string | null;
}

const TelemedicinaPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasTelemedAccess, isMaster, plan } = useUserPlan();
  const { toast } = useToast();

  const [servicos, setServicos] = useState<TelemedServico[]>([]);
  const [profissionais, setProfissionais] = useState<TelemedProfissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroServico, setFiltroServico] = useState<string | null>(null);

  const [agendaOpen, setAgendaOpen] = useState(false);
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<TelemedProfissional | null>(null);
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);

  // PIX Payment States
  const [showPixDialog, setShowPixDialog] = useState(false);
  const [pixData, setPixData] = useState<PixPaymentResult | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "expired">("pending");
  const [submitting, setSubmitting] = useState(false);

  const podeAcessar = isMaster || hasTelemedAccess;

  useEffect(() => {
    const carregarDados = async () => {
      if (!user) return;
      setLoading(true);

      const [{ data: servicosData }, { data: profData }] = await Promise.all([
        (supabase as any)
          .from("telemedicina_servicos")
          .select("id, nome, slug, icone, icon_url, ativo")
          .eq("ativo", true)
          .order("nome"),
        (supabase as any)
          .from("professionals")
          .select("id, name, bio, base_price, is_available, telemedicina_servico_id, profile_image_url")
          .not("telemedicina_servico_id", "is", null)
          .eq("is_available", true)
          .order("name"),
      ]);

      setServicos((servicosData as any) ?? []);
      setProfissionais((profData as any) ?? []);
      setLoading(false);
    };

    carregarDados();
  }, [user]);

  const resetAgendaState = () => {
    setProfissionalSelecionado(null);
  };

  const handleContratar = async (profissional: TelemedProfissional) => {
    if (!user) {
      toast({ title: "Erro", description: "Você precisa estar logado para contratar.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: hire, error }: any = await (supabase as any).from("professional_hires").insert({
        professional_id: profissional.id,
        student_id: user.id,
        message: "Contratação via Telemedicina",
        status: "pending",
        paid_amount: profissional.base_price || 0,
        payment_status: "pending"
      }).select("id").single();

      if (error) throw error;

      if (profissional.base_price && profissional.base_price > 0) {
        const result = await createPixPayment({
          userId: user.id,
          amount: profissional.base_price,
          paymentType: "professional_service",
          referenceId: hire.id,
          description: `Telemedicina: ${profissional.name}`
        });

        setPixData(result);
        setShowPixDialog(true);
        setAgendaOpen(false);
      } else {
        toast({
          title: "Solicitação enviada!",
          description: "O profissional foi notificado e a conexão foi criada.",
        });
        setAgendaOpen(false);
      }
    } catch (error: any) {
      console.error("Hire error:", error);
      toast({
        title: "Erro ao iniciar contratação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckPayment = async () => {
    if (!pixData) return;
    setCheckingPayment(true);
    try {
      const status = await checkPixPaymentStatus(pixData.paymentId);
      if (status === "paid") {
        setPaymentStatus("paid");
        toast({
          title: "Pagamento confirmado!",
          description: "Sua conexão com o profissional foi liberada.",
        });
        setShowPixDialog(false);
      } else if (status === "expired") {
        setPaymentStatus("expired");
      } else {
        toast({ title: "Aguardando pagamento..." });
      }
    } catch (error) {
      console.error("Check error:", error);
    } finally {
      setCheckingPayment(false);
    }
  };

  const professionalsFiltered = filtroServico
    ? profissionais.filter(p => p.telemedicina_servico_id === filtroServico)
    : profissionais;

  if (!podeAcessar && plan === "FREE") {
    return (
      <>
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md border border-accent/40 bg-card/90 p-6 text-xs">
            <h1 className="mb-1 text-base font-semibold text-foreground">Telemedicina bloqueada</h1>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Telemedicina está disponível apenas no plano <span className="font-semibold text-primary">+SAÚDE PRO</span>.
            </p>
            <p className="mb-4 text-[11px] text-muted-foreground">
              Faça o upgrade para desbloquear consultas remotas com especialistas.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="premium" className="w-full py-6" onClick={() => navigate("/aluno/planos")}>
                Ver planos disponíveis
              </Button>
              <Button
                variant="outline-premium"
                className="w-full py-6"
                onClick={() => navigate("/aluno/dashboard")}
              >
                Voltar ao dashboard
              </Button>
            </div>
          </Card>
        </main>
        <FloatingNavIsland />
      </>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-background pb-24">
      {/* Premium Header */}
      <div className="sticky top-0 z-50 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full bg-white/5 text-foreground"
            onClick={() => {
              if (filtroServico) {
                setFiltroServico(null);
              } else {
                navigate("/aluno/dashboard");
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              {filtroServico
                ? servicos.find(s => s.id === filtroServico)?.nome
                : "Telemedicina"}
            </h1>
            <div className="flex items-center gap-2 font-black uppercase text-[8px] tracking-[0.2em] text-accent-foreground/60">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {filtroServico ? "Especialistas Disponíveis" : "Serviços em Destaque"}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6">
        {/* Step 1: Services View (ONLY show if no service filter is active) */}
        {!filtroServico ? (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-6">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                Selecione um Serviço
              </h2>
              <p className="text-xs text-muted-foreground/60">Explore nossas especialidades e encontre o profissional ideal.</p>
            </div>

            {loading && servicos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {servicos.map((s, idx) => {
                  const Icon = getServicoIcon(s.slug);
                  const count = profissionais.filter(p => p.telemedicina_servico_id === s.id).length;

                  const colors = [
                    { color: "from-blue-500/10 to-blue-600/5", border: "border-blue-500/20", icon: "text-blue-400" },
                    { color: "from-emerald-500/10 to-emerald-600/5", border: "border-emerald-500/20", icon: "text-emerald-400" },
                    { color: "from-orange-500/10 to-orange-600/5", border: "border-orange-500/20", icon: "text-orange-400" },
                    { color: "from-purple-500/10 to-purple-600/5", border: "border-purple-500/20", icon: "text-purple-400" },
                    { color: "from-red-500/10 to-red-600/5", border: "border-red-500/20", icon: "text-red-400" },
                    { color: "from-cyan-500/10 to-cyan-600/5", border: "border-cyan-500/20", icon: "text-cyan-400" },
                  ];
                  const c = colors[idx % colors.length];

                  return (
                    <button
                      key={s.id}
                      onClick={() => setFiltroServico(s.id)}
                      className={cn(
                        "relative flex flex-col items-start gap-4 overflow-hidden rounded-[24px] border bg-gradient-to-br p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98] backdrop-blur-md group h-40",
                        c.border,
                        c.color
                      )}
                    >
                      <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-black/20 shadow-inner", c.icon)}>
                        {s.icon_url ? (
                          <img src={s.icon_url} alt={s.nome} className="h-6 w-6 object-contain" />
                        ) : (
                          <Icon className="h-6 w-6" />
                        )}
                      </div>
                      <div className="mt-auto space-y-1">
                        <h3 className="text-sm font-bold text-white leading-none">{s.nome}</h3>
                        <p className="text-[10px] text-muted-foreground font-medium opacity-70">
                          {count} Profissional{count !== 1 ? 'is' : ''}
                        </p>
                      </div>
                      <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Icon className="h-16 w-16" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          /* Step 2: Professionals View (ONLY show if a service filter is active) */
          <section className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Profissionais Encontrados
                </h2>
                <p className="text-[10px] text-muted-foreground/60">{servicos.find(s => s.id === filtroServico)?.nome}</p>
              </div>
              <Badge variant="outline" className="text-[9px] border-white/10 uppercase tracking-widest px-3 py-1 bg-white/5">
                {professionalsFiltered.length} Especialistas
              </Badge>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-xs font-bold uppercase tracking-widest">Sincronizando Rede...</p>
              </div>
            ) : professionalsFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="mb-4 text-5xl grayscale opacity-30">👨‍⚕️</div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white/40">
                  Sem Profissionais
                </h3>
                <p className="mt-1 text-[10px] text-muted-foreground/50 max-w-[200px]">Não encontramos especialistas disponíveis no momento nesta categoria.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-6 text-[10px] uppercase font-bold tracking-widest text-primary hover:bg-primary/10"
                  onClick={() => setFiltroServico(null)}
                >
                  Voltar para Categorias
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {professionalsFiltered.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setProfissionalSelecionado(p);
                      setAgendaOpen(true);
                    }}
                    className="group relative cursor-pointer overflow-hidden rounded-[28px] border border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
                  >
                    {/* Card Banner */}
                    <div className="relative aspect-[16/8] overflow-hidden">
                      {p.profile_image_url ? (
                        <img
                          src={p.profile_image_url}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-900/50">
                          <User className="h-10 w-10 text-white/10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                    </div>

                    {/* Content */}
                    <div className="relative -mt-10 p-5 pt-0">
                      <div className="flex items-end justify-between">
                        <div className="h-16 w-16 rounded-2xl border-4 border-background bg-zinc-900 shadow-2xl flex items-center justify-center font-black text-primary text-xl uppercase overflow-hidden">
                          {p.profile_image_url ? <img src={p.profile_image_url} className="h-full w-full object-cover" /> : p.name.charAt(0)}
                        </div>
                        <Badge className="bg-primary text-black font-black uppercase text-[10px] mb-2 px-3 py-1 shadow-lg shadow-primary/20">
                          R$ {p.base_price?.toFixed(2) || "0.00"}
                        </Badge>
                      </div>

                      <div className="mt-3">
                        <h3 className="text-lg font-black text-white group-hover:text-primary transition-colors flex items-center gap-2 leading-none">
                          {p.name}
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                        </h3>
                        <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-relaxed text-muted-foreground opacity-80">
                          {p.bio || "Especialista pronto para te atender de forma remota com toda excelência Nexfit."}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Disponível Agora</span>
                        </div>
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Agendar <span className="text-lg">→</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Booking Dialog */}
      <Dialog
        open={agendaOpen}
        onOpenChange={(open) => {
          setAgendaOpen(open);
          if (!open) {
            resetAgendaState();
          }
        }}
      >
        <DialogContent className="max-w-sm border-white/10 bg-black/90 p-0 backdrop-blur-3xl overflow-hidden rounded-[32px]">
          {profissionalSelecionado && (
            <div className="flex flex-col">
              <div className="relative h-40 overflow-hidden">
                <img
                  src={profissionalSelecionado.profile_image_url || "https://images.unsplash.com/photo-1576091160550-217359f51f8c?q=80&w=2070"}
                  className="h-full w-full object-cover opacity-60"
                  alt="Banner"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                <div className="absolute bottom-4 left-6 flex items-end gap-4">
                  <div className="h-16 w-16 rounded-2xl border-2 border-primary bg-zinc-900 flex items-center justify-center font-black text-primary text-2xl overflow-hidden shadow-2xl">
                    {profissionalSelecionado.profile_image_url ? <img src={profissionalSelecionado.profile_image_url} className="h-full w-full object-cover" alt="Profile" /> : profissionalSelecionado.name.charAt(0)}
                  </div>
                  <div className="mb-1">
                    <h3 className="text-xl font-black text-white leading-none mb-1">{profissionalSelecionado.name}</h3>
                    <Badge className="bg-primary/20 text-primary border-primary/20 text-[8px] font-black uppercase tracking-widest">
                      Profissional Verificado
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Bio Profissional</p>
                  <p className="text-sm leading-relaxed text-white/80 italic font-medium">
                    "{profissionalSelecionado.bio || "Especialista dedicado a proporcionar o melhor atendimento focado em seu desempenho e saúde."}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Investimento</p>
                    <p className="text-lg font-black text-primary">R$ {profissionalSelecionado.base_price?.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 flex flex-col justify-center">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Duração</p>
                    <p className="text-xs font-bold text-white uppercase tracking-tighter">50 Minutos</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={() => handleContratar(profissionalSelecionado)}
                    disabled={submitting}
                    className="h-14 w-full rounded-2xl bg-primary text-black font-black uppercase tracking-widest hover:bg-primary/90 hover:scale-[1.02] transition-all shadow-xl shadow-primary/10"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Contratar Sessão"}
                  </Button>
                  <p className="text-center text-[9px] font-bold uppercase tracking-widest text-white/20">
                    Clique para gerar o código PIX de pagamento
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PIX Payment Dialog */}
      <Dialog open={showPixDialog} onOpenChange={setShowPixDialog}>
        <DialogContent className="max-w-md border-white/10 bg-black/95 text-white backdrop-blur-3xl rounded-[32px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl font-black">
              <QrCode className="h-6 w-6 text-primary" />
              Pagamento via PIX
            </DialogTitle>
            <DialogDescription className="text-white/60 text-xs">
              Escaneie o QR Code ou copie a chave para confirmar sua contratação.
            </DialogDescription>
          </DialogHeader>

          {pixData && (
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="relative overflow-hidden rounded-3xl border-8 border-white bg-white p-2 shadow-2xl animate-in zoom-in-90 duration-500">
                <img src={pixData.pixQrCode} alt="QR Code PIX" className="h-64 w-64" />
                {paymentStatus === "paid" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                    <CheckCircle2 className="h-16 w-16 text-primary animate-bounce" />
                    <p className="mt-2 font-bold text-primary">PAGAMENTO CONFIRMADO!</p>
                  </div>
                )}
              </div>

              <div className="w-full space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Valor a pagar</p>
                    <p className="text-2xl font-black text-primary">
                      R$ {profissionalSelecionado?.base_price?.toFixed(2)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="h-14 w-full gap-2 rounded-2xl border-white/10 bg-white/5 font-bold hover:bg-white/10"
                  onClick={() => {
                    navigator.clipboard.writeText(pixData.pixPayload);
                    toast({ title: "Copiado!", description: "Código PIX copiado." });
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copiar Código PIX
                </Button>

                <Button
                  className="h-14 w-full gap-2 rounded-2xl bg-primary font-black uppercase tracking-widest text-black shadow-lg shadow-primary/20 hover:bg-primary/90"
                  onClick={handleCheckPayment}
                  disabled={checkingPayment || paymentStatus === "paid"}
                >
                  {checkingPayment ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Já realizei o pagamento"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <FloatingNavIsland />
    </main>
  );
};

export default TelemedicinaPage;
