import { CreditCard } from "lucide-react";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { MyPlanCard } from "@/components/subscription/MyPlanCard";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Button } from "@/components/ui/button";

const AlunoPlanoPage = () => {
  return (
    <main className="safe-bottom-main flex min-h-screen flex-col bg-background px-4 pb-24 pt-6 relative overflow-hidden">
      {/* Premium Background Decorations */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-[10%] -right-[10%] h-96 w-96 rounded-full bg-primary/10 blur-[120px] filter animate-pulse" />
        <div className="absolute -bottom-[10%] -left-[10%] h-96 w-96 rounded-full bg-accent/5 blur-[120px] filter" />
      </div>

      <header className="mb-8 flex items-center gap-4 relative z-10">
        <BackIconButton to="/aluno/perfil" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic">Assinatura Nexfit</p>
          <h1 className="relative text-3xl font-black italic uppercase tracking-tighter text-foreground flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/20">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            Meu Plano
          </h1>
          <p className="mt-2 text-[10px] font-medium text-muted-foreground uppercase tracking-widest leading-relaxed">
            Consulte sua validade e <span className="text-white">eleve seu nível</span> via Pix.
          </p>
        </div>
      </header>

      <section className="space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <MyPlanCard />

        {/* Support Section */}
        <div className="p-6 rounded-[2rem] border border-white/5 bg-white/[0.03] backdrop-blur-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 italic">Suporte Prioritário</h3>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-500 font-medium">
            Dúvidas sobre sua assinatura ou pagamentos? <br />
            Nosso time está pronto para ajudar você 24/7.
          </p>
          <Button variant="ghost" className="w-full border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/5">
            Falar com Atendimento
          </Button>
        </div>
      </section>
      <FloatingNavIsland />
    </main>
  );
};

export default AlunoPlanoPage;
