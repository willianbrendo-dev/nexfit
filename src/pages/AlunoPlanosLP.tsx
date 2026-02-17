import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Crown, Rocket, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_LABEL, type SubscriptionPlan } from "@/lib/subscriptionPlans";
import mercadoPagoLogo from "@/assets/mercado-pago.png";

const AlunoPlanosLP = () => {
    const navigate = useNavigate();

    // Fetch prices from database - synced with Admin config keys
    const { data: planConfigs = [] } = useQuery({
        queryKey: ["admin", "plan-configs-basic"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("plan_configs")
                .select("plan, price_cents");
            if (error) throw error;
            return data || [];
        },
        staleTime: 0,
    });

    const formatPrice = (cents: number) => {
        return (cents / 100).toFixed(2).replace(".", ",");
    };

    const getPriceForPlan = (plan: string) => {
        const config = planConfigs.find(c => c.plan === plan);
        return config ? formatPrice(config.price_cents) : (plan === "ADVANCE" ? "19,90" : "39,90");
    };

    const plans = [
        {
            type: "ADVANCE",
            title: "Advance Pro",
            subtitle: "RESULTADOS ACELERADOS",
            price: getPriceForPlan("ADVANCE"),
            originalPrice: "49,90",
            description: "A tecnologia de ponta que você precisa para transformar seu corpo em tempo recorde. Pare de treinar no escuro.",
            features: [
                "🔥 Treinos Personalizados por IA",
                "🥗 Nutricionista Inteligente 24/7",
                "📊 Análise de Evolução Semanal",
                "⚡ Acesso VIP ao Marketplace",
                "🚀 Suporte Premium Prioritário",
            ],
            icon: Rocket,
            accent: "primary",
            buttonText: "QUERO EVOLUIR AGORA",
        },
        {
            type: "ELITE",
            title: "Elite Black",
            subtitle: "EXPERIÊNCIA COMPLETA 360º",
            price: getPriceForPlan("ELITE"),
            originalPrice: "99,90",
            description: "O arsenal completo para sua saúde. Médicos, Nutricionistas e IA trabalhando juntos por você. O valor de uma consulta, pelo preço de um cafezinho.",
            features: [
                "💎 Tudo do Advance Pro",
                "👨‍⚕️ Telemedicina Ilimitada (Obrigatório)",
                "🍎 Plano Alimentar Sob Medida",
                "🧬 Bio-Analytics Avançado",
                "👑 Atendimento Presidencial",
            ],
            icon: Crown,
            accent: "accent",
            buttonText: "QUERO SER ELITE",
            popular: true,
        },
    ];

    return (
        <main className="relative min-h-screen overflow-hidden bg-background px-4 pb-24 pt-6">
            {/* Premium Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
                <div className="absolute -top-[40%] -left-[20%] h-[800px] w-[800px] rounded-full bg-primary/10 blur-3xl filter" />
                <div className="absolute top-[20%] -right-[20%] h-[600px] w-[600px] rounded-full bg-accent/10 blur-3xl filter" />
                <div className="absolute bottom-0 left-0 right-0 h-[400px] bg-gradient-to-t from-background via-background/80 to-transparent" />
            </div>

            <div className="relative z-10">
                <header className="mb-12 flex flex-col items-center text-center">
                    <div className="mb-6 flex w-full items-center justify-between">
                        <BackIconButton to="/aluno/dashboard" />
                        <Badge variant="outline" className="border-primary/40 bg-primary/5 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary backdrop-blur-md">
                            Nexfit Premium
                        </Badge>
                        <div className="w-10 opacity-0"><BackIconButton to="/" /></div>
                    </div>
                    <div className="relative mb-2 inline-block">
                        <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary via-accent to-primary opacity-20 blur" />
                        <h1 className="relative text-4xl font-black italic tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
                            DESBLOQUEIE SEU <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">POTENCIAL MÁXIMO</span>
                        </h1>
                    </div>
                    <p className="mt-4 max-w-md text-base text-muted-foreground font-medium leading-relaxed">
                        Não é apenas um plano, é o investimento no seu futuro. <br className="hidden sm:block" /> Escolha a evolução que você merece.
                    </p>
                </header>

                <section className="grid gap-8 md:grid-cols-2 lg:max-w-5xl lg:mx-auto">
                    {plans.map((plan) => (
                        <Card
                            key={plan.type}
                            className={`group relative overflow-hidden border-white/5 bg-black/40 backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02] hover:border-${plan.accent}/50 hover:shadow-2xl hover:shadow-${plan.accent}/10 ${plan.popular ? `ring-1 ring-${plan.accent}/50 scale-[1.01]` : ""}`}
                        >
                            {plan.popular && (
                                <div className="absolute right-0 top-0 z-20">
                                    <div className="absolute inset-0 bg-accent blur-md opacity-50" />
                                    <div className="relative rounded-bl-xl bg-accent px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-black shadow-lg">
                                        MAIS VENDIDO
                                    </div>
                                </div>
                            )}

                            {/* Card Glow Effect */}
                            <div className={`absolute -inset-0.5 bg-gradient-to-b from-${plan.accent}/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

                            <CardHeader className="relative z-10 pb-6 pt-8">
                                <div className="flex items-start justify-between">
                                    <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-${plan.accent}/20 to-transparent ring-1 ring-inset ring-${plan.accent}/20 shadow-lg`}>
                                        <plan.icon className={`h-8 w-8 text-${plan.accent} drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]`} />
                                    </div>
                                    {plan.popular && <Crown className="h-6 w-6 text-accent animate-pulse" />}
                                </div>

                                <CardTitle className="text-4xl font-black italic uppercase tracking-tighter text-foreground">
                                    {plan.title}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-primary uppercase">
                                    <span className="h-px w-8 bg-primary/50" />
                                    {plan.subtitle}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="relative z-10 space-y-8">
                                <div className="space-y-2 rounded-xl bg-white/5 p-4 ring-1 ring-white/5 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/60 line-through">
                                        <span>De R$ {plan.originalPrice}</span>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[9px] bg-red-500/10 text-red-500 hover:bg-red-500/20">
                                            ECONOMIA REAL
                                        </Badge>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-sm font-bold text-muted-foreground mb-1">POR R$</span>
                                        <span className="text-6xl font-black tracking-tighter text-foreground drop-shadow-lg">{plan.price}</span>
                                        <span className="text-sm font-bold text-muted-foreground mb-1">/mês</span>
                                    </div>
                                    <p className="text-xs leading-relaxed text-muted-foreground border-t border-white/5 pt-3 mt-1">
                                        {plan.description}
                                    </p>
                                </div>

                                <ul className="space-y-4">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-center gap-3 text-sm font-semibold text-foreground/90 group/item">
                                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-${plan.accent}/10 text-${plan.accent} ring-1 ring-${plan.accent}/20 transition-colors group-hover/item:bg-${plan.accent} group-hover/item:text-black`}>
                                                <Check className="h-3.5 w-3.5" />
                                            </div>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    className={`w-full py-7 text-lg uppercase tracking-wider font-black shadow-lg shadow-${plan.accent}/20 hover:shadow-${plan.accent}/40 bg-gradient-to-r from-${plan.accent} to-${plan.accent}/80 hover:brightness-110 transition-all duration-300 transform hover:-translate-y-1`}
                                    onClick={() => navigate(`/aluno/planos/checkout/${plan.type}`)}
                                >
                                    {plan.buttonText}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </section>

                <section className="mt-16 space-y-8 text-center lg:max-w-2xl lg:mx-auto pb-10">
                    <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/5 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-500">
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        <div className="relative z-10 flex flex-col items-center">
                            <img
                                src={mercadoPagoLogo}
                                alt="Mercado Pago"
                                className="h-12 mb-4 opacity-90 grayscale group-hover:grayscale-0 transition-all duration-500"
                            />

                            <h3 className="text-xl font-black italic text-foreground mb-2 flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-blue-500" />
                                PAGAMENTO BLINDADO
                            </h3>

                            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto mb-4">
                                Sua segurança é nossa prioridade. Processamento criptografado de ponta a ponta pelo <strong>Mercado Pago</strong>.
                            </p>

                            <div className="flex items-center gap-2 text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                                <Zap className="h-3 w-3 fill-current" />
                                PIX COM APROVAÇÃO INSTANTÂNEA
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-white/5 bg-card/20 p-4 hover:bg-card/30 transition-colors">
                            <Zap className="mx-auto mb-2 h-6 w-6 text-primary" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Acesso Imediato</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-card/20 p-4 hover:bg-card/30 transition-colors">
                            <Check className="mx-auto mb-2 h-6 w-6 text-accent" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sem Fidelidade</p>
                        </div>
                    </div>
                </section>
            </div>

            <FloatingNavIsland />
        </main>
    );
};

export default AlunoPlanosLP;
