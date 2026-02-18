import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Crown, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_LABEL, type SubscriptionPlan } from "@/lib/subscriptionPlans";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProfileBillingInfo = {
  subscription_plan: SubscriptionPlan | null;
  plan_expires_at: string | null;
};

type PagamentoRow = {
  id: string;
  status: string;
  desired_plan: SubscriptionPlan;
  requested_at: string;
  rejection_reason?: string | null;
};

const PLAN_BADGE_VARIANT: Record<SubscriptionPlan, "default" | "secondary" | "outline"> = {
  FREE: "secondary",
  ADVANCE: "default",
  ELITE: "outline",
};

function formatExpiry(iso: string | null, fallbackLabel = "—") {
  if (!iso) return fallbackLabel;
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return fallbackLabel;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function MyPlanCard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<ProfileBillingInfo | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PagamentoRow[]>([]);

  const loadPlanAndPayments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: profile, error: profileError }, { data: payments, error: payError }] = await Promise.all([
        supabase.from("profiles").select("subscription_plan, plan_expires_at").eq("id", user.id).maybeSingle(),
        (supabase as any).from("pagamentos").select("id, status, desired_plan, requested_at, rejection_reason").eq("user_id", user.id).order("requested_at", { ascending: false }),
      ]);

      if (profileError) throw profileError;
      if (payError) throw payError;

      setBilling((profile as ProfileBillingInfo) ?? null);
      setPaymentHistory((payments as PagamentoRow[] | null) ?? []);
    } catch (error: any) {
      console.error("[MyPlanCard] Erro ao carregar dados", error);
      toast({ title: "Erro ao carregar plano", description: "Tente novamente em alguns instantes.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => { void loadPlanAndPayments(); }, [loadPlanAndPayments]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-plan-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => { void loadPlanAndPayments(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos", filter: `user_id=eq.${user.id}` }, () => { void loadPlanAndPayments(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadPlanAndPayments, user]);

  const plan: SubscriptionPlan = billing?.subscription_plan ?? "FREE";

  const expiryLabel = useMemo(() => {
    if (billing?.plan_expires_at) return formatExpiry(billing.plan_expires_at);
    if (plan !== "FREE") return "Não definida";
    return "—";
  }, [billing?.plan_expires_at, plan]);

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-black/40 p-8 backdrop-blur-2xl transition-all duration-300 hover:border-primary/30">
      <div className="absolute -inset-0.5 bg-gradient-to-b from-primary/10 to-transparent opacity-50" />

      <div className="relative z-10 flex items-center gap-4 mb-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 ring-1 ring-primary/20 shadow-lg">
          <Crown className="h-7 w-7 text-primary shadow-[0_0_15px_rgba(234,255,0,0.4)]" />
        </div>
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic">Assinatura Nexfit</h2>
          <p className="text-xl font-black text-white uppercase tracking-tighter">Status de Acesso</p>
        </div>
      </div>

      <div className="relative z-10 space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[1.5rem] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2 italic">Plano Atual</p>
            <Badge variant={PLAN_BADGE_VARIANT[plan]} className="uppercase text-[11px] font-black tracking-tight py-1 px-3 bg-primary text-black border-none rounded-xl">
              {PLAN_LABEL[plan]}
            </Badge>
          </div>
          <div className="rounded-[1.5rem] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2 italic">Validade</p>
            <p className="text-sm font-black text-white tracking-tight">{expiryLabel.toUpperCase()}</p>
          </div>
        </div>

        <section aria-label="Histórico de pagamentos" className="space-y-4">
          <div className="flex items-center gap-2 pl-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 italic">Transações Recentes</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/5 overflow-hidden bg-black/20 backdrop-blur-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-white/[0.02] hover:bg-white/[0.02] border-white/5">
                  <TableHead className="h-12 text-[9px] uppercase font-black text-zinc-500 tracking-widest">Data</TableHead>
                  <TableHead className="h-12 text-[9px] uppercase font-black text-zinc-500 tracking-widest">Plano</TableHead>
                  <TableHead className="h-12 text-[9px] uppercase font-black text-zinc-500 tracking-widest text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentHistory.length === 0 ? (
                  <TableRow className="hover:bg-white/[0.02] border-white/5">
                    <TableCell colSpan={3} className="py-12 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  paymentHistory.map((row) => (
                    <TableRow key={row.id} className="hover:bg-white/[0.01] border-white/5">
                      <TableCell className="text-[10px] font-bold text-zinc-400">
                        {new Date(row.requested_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-[10px] font-black uppercase text-white tracking-tight">
                        {PLAN_LABEL[row.desired_plan]}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase font-black tracking-tighter border-none px-2 py-0.5 rounded-lg ${row.status === "approved"
                            ? "bg-primary/20 text-primary"
                            : row.status === "pending"
                              ? "bg-yellow-500/20 text-yellow-500"
                              : "bg-red-500/20 text-red-500"
                            }`}
                        >
                          {row.status === "approved" ? "OK" : row.status === "pending" ? "Aguardando" : "Erro"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
