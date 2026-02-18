import { CreditCard, Rocket } from "lucide-react";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { MyPlanCard } from "@/components/subscription/MyPlanCard";
import { ProfessionalFloatingNavIsland } from "@/components/navigation/ProfessionalFloatingNavIsland";
import { Button } from "@/components/ui/button";

const ProfessionalPlanoPage = () => {
    return (
        <main className="safe-bottom-main flex min-h-screen flex-col bg-black px-4 pb-28 pt-8 relative overflow-hidden">
            {/* Premium Background Decorations */}
            <div className="absolute inset-0 z-0 text-primary/10">
                <div className="absolute -top-[10%] -right-[10%] h-[500px] w-[500px] rounded-full bg-current blur-[120px] filter animate-pulse" />
                <div className="absolute -bottom-[10%] -left-[10%] h-[500px] w-[500px] rounded-full bg-current blur-[120px] filter" />
            </div>

            <header className="mb-10 flex items-center gap-5 relative z-10">
                <BackIconButton to="/professional/profile" />
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic">Área Profissional</p>
                    <h1 className="relative text-3xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 ring-1 ring-primary/20 shadow-xl">
                            <CreditCard className="h-6 w-6 text-primary" />
                        </div>
                        Assinatura
                    </h1>
                </div>
            </header>

            <section className="space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <MyPlanCard />

                {/* Upgrade Hook */}
                <div className="relative group overflow-hidden p-8 rounded-[2.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-2xl transition-all duration-500 hover:border-primary/30">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="flex items-start gap-4 mb-6">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Rocket className="h-7 w-7" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Precisa de mais recursos?</h3>
                            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 font-medium uppercase tracking-widest">
                                Desbloqueie ferramentas avançadas e <span className="text-white">venda mais</span> no marketplace.
                            </p>
                        </div>
                    </div>

                    <Button
                        disabled
                        className="w-full h-14 rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90 opacity-80 cursor-not-allowed"
                    >
                        Planos Disponíveis em breve (Fale com Admin)
                    </Button>
                    <p className="mt-4 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                        Upgrade direto disponível em breve via Pix
                    </p>
                </div>
            </section>

            <ProfessionalFloatingNavIsland />
        </main>
    );
};

export default ProfessionalPlanoPage;
