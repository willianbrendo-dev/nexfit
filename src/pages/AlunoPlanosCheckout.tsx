import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { PLAN_LABEL, type SubscriptionPlan } from "@/lib/subscriptionPlans";
import { createPixPayment } from "@/lib/pixPaymentTracking";
import { subscribeToPaymentStatus } from "@/lib/mercadoPagoService";
import { CheckCircle2, Copy, CreditCard, ExternalLink, Loader2, QrCode, Zap } from "lucide-react";
import * as QRCodeLib from "qrcode";
import mercadoPagoLogo from "@/assets/mercado-pago.png";

const AlunoPlanosCheckout = () => {
    const { planType } = useParams<{ planType: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();

    const desiredPlan = (planType?.toUpperCase() as SubscriptionPlan) || "ADVANCE";
    const [submitting, setSubmitting] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
    const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | null>(null);
    const [pixPayload, setPixPayload] = useState<string | null>(null);
    const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
    const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [verifyingPayment, setVerifyingPayment] = useState(false);
    const [pixPaymentId, setPixPaymentId] = useState<string | null>(null);

    const { data: planConfig, refetch: refetchPlan } = useQuery({
        queryKey: ["admin", "plan-configs-basic", desiredPlan],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("plan_configs")
                .select("price_cents")
                .eq("plan", desiredPlan)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        staleTime: 0,
        gcTime: 0,
    });

    // Load admin PIX config - aligned with GeneralSettingsPixPanel.tsx
    const { data: pixConfig } = useQuery({
        queryKey: ["admin", "pix-config"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("pix_configs")
                .select("pix_key, receiver_name")
                .is("store_id", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        staleTime: 0,
        gcTime: 0,
    });

    // Subscription to payment status
    useEffect(() => {
        if (!pixPaymentId) return;
        return subscribeToPaymentStatus(pixPaymentId, (status) => {
            if (status === 'paid' || status === 'approved') {
                setPaymentStatus('paid');
                toast({ title: "Pagamento Confirmado!", description: "Seu plano foi atualizado com sucesso!" });
                setTimeout(() => navigate("/aluno/dashboard"), 2000);
            }
        });
    }, [pixPaymentId, navigate, toast]);

    const handleCopyPix = async () => {
        if (!pixPayload) return;
        await navigator.clipboard.writeText(pixPayload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "Código Pix copiado!" });
    };

    const handleConfirmOrder = async () => {
        if (!user || !planConfig) return;
        setSubmitting(true);

        try {
            const amount = planConfig.price_cents / 100;
            const result = await createPixPayment({
                userId: user.id,
                userEmail: user.email,
                userName: user.user_metadata?.full_name || user.user_metadata?.nome || "Aluno Nexfit",
                amount,
                paymentType: "subscription",
                description: `Assinatura ${PLAN_LABEL[desiredPlan]}`,
                desiredPlan,
                paymentMethod,
            });

            setPixPaymentId(result.paymentId);
            setPixPayload(result.pixPayload);

            // Handle QR Code: Use API returned image OR generate locally from payload
            let qrCodeUrl = result.pixQrCode;
            if (qrCodeUrl && !qrCodeUrl.startsWith('data:image')) {
                qrCodeUrl = `data:image/png;base64,${qrCodeUrl}`;
            }

            if (!qrCodeUrl && result.pixPayload) {
                try {
                    qrCodeUrl = await QRCodeLib.toDataURL(result.pixPayload, { width: 256 });
                } catch (e) {
                    console.error("Failed to generate QR Code locally:", e);
                }
            }

            setPixQrDataUrl(qrCodeUrl);
            setPaymentUrl(result.paymentUrl || null);
            setPaymentStatus("pending");

            toast({
                title: paymentMethod === 'pix' ? "Pagamento Pix Gerado!" : "Link de Pagamento Gerado!",
                description: paymentMethod === 'pix' ? "Escaneie o QR Code para ativar seu plano." : "Siga as instruções para pagar com cartão."
            });
        } catch (error: any) {
            toast({ title: "Erro ao processar", description: error.message, variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    const handleVerifyStatus = async () => {
        if (!pixPaymentId) return;
        setVerifyingPayment(true);
        try {
            const { data, error } = await supabase
                .from('pix_payments')
                .select('status')
                .eq('id', pixPaymentId)
                .single();

            if (error) throw error;
            if (data.status === 'paid') {
                setPaymentStatus('paid');
                toast({ title: "Confirmado!", description: "Seu plano já está ativo." });
                setTimeout(() => navigate("/aluno/dashboard"), 1500);
            } else {
                toast({ title: "Pendente", description: "O pagamento ainda não foi processado pelo banco." });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setVerifyingPayment(false);
        }
    };

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
                <header className="mb-8 flex items-center gap-3">
                    <BackIconButton to="/aluno/planos" />
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground font-bold">Checkout</p>
                        <h1 className="text-2xl font-black italic text-foreground tracking-tighter uppercase">
                            CONFIRMAR <span className="text-primary">UPGRADE</span>
                        </h1>
                    </div>
                </header>

                <div className="grid gap-6 lg:grid-cols-2 lg:max-w-5xl lg:mx-auto">
                    <Card className="border-white/5 bg-black/40 backdrop-blur-2xl shadow-xl">
                        <CardHeader className="border-b border-white/5 pb-6">
                            <CardTitle className="text-sm font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                <Zap className="h-4 w-4" /> Resumo do Plano
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="flex items-center justify-between rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                                <div>
                                    <p className="text-2xl font-black italic text-foreground uppercase tracking-tight">{PLAN_LABEL[desiredPlan]}</p>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cobrança Mensal</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-black text-primary tracking-tighter drop-shadow-lg">
                                        R$ {((planConfig?.price_cents ?? 0) / 100).toFixed(2).replace('.', ',')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">VOCÊ VAI RECEBER:</p>
                                <ul className="space-y-3">
                                    {desiredPlan === 'ELITE' ? (
                                        <>
                                            <li className="flex items-center gap-3 text-sm font-bold italic text-foreground bg-accent/5 p-2 rounded-lg border border-accent/10">
                                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                </div>
                                                Acesso Total + Telemedicina VIP
                                            </li>
                                            <li className="flex items-center gap-3 text-xs font-medium text-muted-foreground px-2">
                                                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10">
                                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                                </div>
                                                Nutricionista & Personal Dedicados
                                            </li>
                                            <li className="flex items-center gap-3 text-xs font-medium text-muted-foreground px-2">
                                                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10">
                                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                                </div>
                                                Prioridade Máxima no Suporte
                                            </li>
                                        </>
                                    ) : (
                                        <>
                                            <li className="flex items-center gap-3 text-sm font-bold italic text-foreground bg-primary/5 p-2 rounded-lg border border-primary/10">
                                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                </div>
                                                IA de Treino & Nutrição 24/7
                                            </li>
                                            <li className="flex items-center gap-3 text-xs font-medium text-muted-foreground px-2">
                                                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10">
                                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                                </div>
                                                Evolução Acelerada Garantida
                                            </li>
                                            <li className="flex items-center gap-3 text-xs font-medium text-muted-foreground px-2">
                                                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10">
                                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                                </div>
                                                Acesso VIP ao Marketplace
                                            </li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-card/60 backdrop-blur-3xl ring-1 ring-primary/10 shadow-2xl">
                        <CardHeader className="text-center pb-2 border-b border-white/5">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                                <CreditCard className="h-6 w-6 text-primary" />
                            </div>
                            <CardTitle className="text-lg font-black italic text-foreground uppercase tracking-widest">Pagamento Seguro</CardTitle>
                            <CardDescription className="text-xs font-medium">Escolha como deseja realizar o upgrade</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-6 pt-6">
                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    variant={paymentMethod === "pix" ? "default" : "outline"}
                                    className={`flex-col h-auto py-4 gap-2 transition-all duration-300 ${paymentMethod === 'pix' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:bg-primary/5'}`}
                                    onClick={() => setPaymentMethod("pix")}
                                    disabled={paymentStatus === "pending" || paymentStatus === "paid"}
                                >
                                    <QrCode className="h-6 w-6" />
                                    <span className="text-[10px] uppercase font-black tracking-widest">PIX</span>
                                </Button>
                                <Button
                                    variant={paymentMethod === "card" ? "default" : "outline"}
                                    className={`flex-col h-auto py-4 gap-2 transition-all duration-300 ${paymentMethod === 'card' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:bg-primary/5'}`}
                                    onClick={() => setPaymentMethod("card")}
                                    disabled={paymentStatus === "pending" || paymentStatus === "paid"}
                                >
                                    <CreditCard className="h-6 w-6" />
                                    <span className="text-[10px] uppercase font-black tracking-widest">Cartão</span>
                                </Button>
                            </div>

                            {paymentStatus === "paid" ? (
                                <div className="py-8 text-center space-y-4 animate-in zoom-in duration-500">
                                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 animate-bounce ring-1 ring-green-500/40">
                                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-2xl font-black italic text-white tracking-tight">PAGAMENTO APROVADO!</h3>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Redirecionando para seu painel...</p>
                                    </div>
                                </div>
                            ) : paymentStatus === "pending" ? (
                                <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {paymentMethod === 'pix' ? (
                                        <>
                                            <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl bg-white p-4 shadow-2xl shadow-primary/20 ring-4 ring-white/10">
                                                {pixQrDataUrl ? (
                                                    <img src={pixQrDataUrl} alt="QR Code Pix" className="h-full w-full mix-blend-multiply" />
                                                ) : (
                                                    <div className="flex aspect-square items-center justify-center text-xs text-black font-bold animate-pulse">
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        GERANDO QR CODE...
                                                    </div>
                                                )}
                                            </div>

                                            <Button
                                                variant="outline"
                                                className="w-full border-primary/20 bg-primary/5 font-bold hover:bg-primary/10 py-6 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                onClick={handleCopyPix}
                                            >
                                                {copied ? <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                                                {copied ? <span className="text-green-500">CÓDIGO COPIADO!</span> : "COPIAR CÓDIGO PIX"}
                                            </Button>
                                        </>
                                    ) : (
                                        <div className="py-6 text-center space-y-6">
                                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 animate-pulse">
                                                <CreditCard className="h-8 w-8 text-primary" />
                                            </div>
                                            <div className="space-y-2">
                                                <h4 className="font-bold text-foreground">Ambiente Seguro Mercado Pago</h4>
                                                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                                    Para sua segurança, o pagamento será finalizado diretamente no ambiente criptografado do banco.
                                                </p>
                                            </div>
                                            <Button
                                                className="w-full py-7 gap-2 font-black uppercase tracking-wider text-base shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:translate-y-[-2px]"
                                                onClick={() => paymentUrl && window.open(paymentUrl, '_blank')}
                                            >
                                                <ExternalLink className="h-5 w-5" />
                                                PAGAR AGORA
                                            </Button>
                                        </div>
                                    )}

                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <Button
                                            variant="ghost"
                                            className="w-full text-[10px] font-bold uppercase tracking-widest gap-2 text-muted-foreground hover:text-white hover:bg-white/5"
                                            onClick={handleVerifyStatus}
                                            disabled={verifyingPayment}
                                        >
                                            {verifyingPayment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                            {verifyingPayment ? "VERIFICANDO NO BANCO..." : "JÁ FIZ O PAGAMENTO"}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="pt-2 space-y-4">
                                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 ring-1 ring-primary/10">
                                        <div className="flex gap-3">
                                            <Zap className="h-5 w-5 text-primary shrink-0" />
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                <strong className="text-primary block mb-1 uppercase text-[10px] tracking-widest">Ativação Imediata</strong>
                                                Seu plano será liberado automaticamente após a confirmação do {paymentMethod === 'pix' ? 'Pix' : 'Cartão'}.
                                            </p>
                                        </div>
                                    </div>

                                    <Button
                                        variant="premium"
                                        className="w-full py-7 text-lg font-black uppercase tracking-wider shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        disabled={submitting}
                                        onClick={handleConfirmOrder}
                                    >
                                        {submitting ? (
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        ) : (
                                            <Zap className="mr-2 h-5 w-5 fill-current" />
                                        )}
                                        {submitting ? "PROCESSANDO..." : "GERAR PAGAMENTO"}
                                    </Button>
                                </div>
                            )}

                            {!paymentStatus && (
                                <div className="text-center pt-4">
                                    <div className="flex items-center justify-center gap-2 opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0">
                                        <img src={mercadoPagoLogo} alt="Mercado Pago" className="h-6" />
                                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                                            <ShieldCheck className="h-3 w-3" />
                                            Pagamento 100% Seguro
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <FloatingNavIsland />
            </div>
        </main>
    );
};

export default AlunoPlanosCheckout;
