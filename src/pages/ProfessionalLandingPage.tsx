import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquare, QrCode, Copy, User, Loader2, CheckCircle2 } from "lucide-react";
import { getSpecialtyLabel } from "@/lib/professionalSpecialties";
import type { GeneratedLandingPage } from "@/lib/geminiAI";
import { createPixPayment, checkPixPaymentStatus } from "@/lib/pixPaymentTracking";
import QRCode from "qrcode";

export default function ProfessionalLandingPage() {
    const { professionalId } = useParams<{ professionalId: string }>();
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [professional, setProfessional] = useState<any>(null);
    const [landingPage, setLandingPage] = useState<GeneratedLandingPage | null>(null);
    const [showHireDialog, setShowHireDialog] = useState(false);
    const [hireMessage, setHireMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // PIX Payment States
    const [showPixDialog, setShowPixDialog] = useState(false);
    const [pixData, setPixData] = useState<any>(null);
    const [checkingPayment, setCheckingPayment] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "expired">("pending");

    useEffect(() => {
        loadProfessionalData();
    }, [professionalId]);

    const loadProfessionalData = async () => {
        if (!professionalId) return;

        try {
            // Load professional profile
            const { data: profData, error: profError } = await supabase
                .from("professionals")
                .select("*")
                .eq("id", professionalId)
                .single();

            if (profError) throw profError;

            setProfessional(profData);

            // Load landing page
            const { data: lpData, error: lpError } = await supabase
                .from("professional_landing_pages")
                .select("*")
                .eq("professional_id", professionalId)
                .eq("is_active", true)
                .single();

            if (lpError && lpError.code !== "PGRST116") throw lpError;

            if (lpData) {
                // Adapt simple template data to expected format if needed, or update UI to use lpData directly
                setLandingPage(lpData);

                // Increment view count
                await supabase.rpc("increment_lp_views", { lp_id: lpData.id });
            }
        } catch (error: any) {
            console.error("Load error:", error);
            toast({
                title: "Erro ao carregar perfil",
                description: "O profissional ainda não configurou sua página.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleHire = async () => {
        if (!user) {
            toast({
                title: "Login necessário",
                description: "Faça login para contratar um profissional.",
                variant: "destructive",
            });
            navigate("/auth");
            return;
        }

        if (!hireMessage.trim()) {
            toast({
                title: "Mensagem obrigatória",
                description: "Por favor, escreva uma mensagem para o profissional.",
                variant: "destructive",
            });
            return;
        }

        setSubmitting(true);
        try {
            const { data: hire, error } = await supabase.from("professional_hires").insert({
                professional_id: professionalId,
                student_id: user.id,
                message: hireMessage,
                status: "pending",
                paid_amount: professional.base_price || 0,
                payment_status: "pending"
            }).select("id").single();

            if (error) throw error;

            if (professional.base_price && professional.base_price > 0) {
                // Initiate PIX Payment
                const result = await createPixPayment({
                    userId: user.id,
                    amount: professional.base_price,
                    paymentType: "professional_service",
                    referenceId: hire.id,
                    pixKey: professional.pix_key || "admin@nexfit.com",
                    receiverName: professional.pix_receiver_name || "NEXFIT TECNOLOGIA",
                    description: `Serviço Profissional: ${professional.name}`
                });

                setPixData(result);
                setShowHireDialog(false);
                setShowPixDialog(true);
            } else {
                toast({
                    title: "Solicitação enviada!",
                    description: "O profissional receberá sua mensagem em breve.",
                });
                setShowHireDialog(false);
            }
            setHireMessage("");
        } catch (error: any) {
            console.error("Hire error:", error);
            toast({
                title: "Erro ao enviar solicitação",
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
                    description: "Seu acesso ao chat e consultas será liberado em breve.",
                });
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

    const copyPixPayload = () => {
        if (!pixData) return;
        navigator.clipboard.writeText(pixData.pixPayload);
        toast({ title: "Copiado!", description: "Código PIX copiado para a área de transferência." });
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!professional || !landingPage) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black">
                <div className="text-center">
                    <p className="text-white/60">Profissional não encontrado ou LP não disponível.</p>
                    <Button onClick={() => navigate("/profissionais")} className="mt-4">
                        Voltar para lista
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            {/* Cover Image */}
            {professional.cover_image_url && (
                <div className="relative h-64 w-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
                    <img
                        src={professional.cover_image_url}
                        alt="Cover"
                        className="h-full w-full object-cover opacity-60"
                    />
                </div>
            )}

            {/* Profile Header */}
            <div className="container mx-auto max-w-4xl px-4">
                <div className={`${professional.cover_image_url ? '-mt-20' : 'pt-8'} relative z-10`}>
                    <div className="flex flex-col items-center gap-4 md:flex-row md:items-end">
                        <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-black bg-white/5">
                            {professional.profile_image_url ? (
                                <img
                                    src={professional.profile_image_url}
                                    alt={professional.name}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <User className="h-16 w-16 text-white/40" />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 text-center md:text-left">
                            <h1 className="text-3xl font-black text-white">{professional.name}</h1>
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                                <Badge variant="outline" className="text-primary">
                                    {getSpecialtyLabel(professional.specialty)}
                                </Badge>
                                {professional.crm_crp && (
                                    <Badge variant="outline">{professional.crm_crp}</Badge>
                                )}
                            </div>
                        </div>

                        <Button
                            onClick={() => setShowHireDialog(true)}
                            size="lg"
                            className="bg-primary text-black hover:bg-primary/90"
                        >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Contratar
                        </Button>
                    </div>
                </div>

                {/* Landing Page Content */}
                <div className="mt-12 space-y-12 pb-20">
                    {/* Headline */}
                    <div className="text-center">
                        <h2 className="text-4xl font-black text-white md:text-5xl">
                            {landingPage.headline || "Bem-vindo ao meu perfil"}
                        </h2>
                    </div>

                    {/* IMAGES */}
                    {landingPage.images?.hero && (
                        <div className="h-64 md:h-96 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                            <img src={landingPage.images.hero} alt="Banner" className="w-full h-full object-cover" />
                        </div>
                    )}

                    {/* About */}
                    <Card className="border-white/10 bg-white/5">
                        <CardContent className="p-8">
                            <h3 className="mb-4 text-2xl font-bold text-white">Sobre</h3>
                            <p className="text-white/70 leading-relaxed whitespace-pre-wrap">{landingPage.about_text}</p>
                        </CardContent>
                    </Card>

                    {/* Services */}
                    {landingPage.services_text && (
                        <Card className="border-white/10 bg-white/5">
                            <CardContent className="p-8">
                                <h3 className="mb-6 text-2xl font-bold text-white">Serviços Oferecidos</h3>
                                <div className="space-y-4">
                                    {landingPage.services_text.split('\n').map((service: string, i: number) => (
                                        service.trim() && (
                                            <div key={i} className="flex items-start gap-3">
                                                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                                </div>
                                                <p className="text-white/70">{service}</p>
                                            </div>
                                        )
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Contact Info (from LP data) */}
                    <Card className="border-white/10 bg-white/5">
                        <CardContent className="p-8">
                            <h3 className="mb-6 text-2xl font-bold text-white">Contato</h3>
                            <div className="space-y-3">
                                {landingPage.contact_info?.whatsapp && (
                                    <div className="flex items-center gap-3 text-white/70">
                                        <div className="h-5 w-5 text-primary">📱</div>
                                        <span>{landingPage.contact_info.whatsapp}</span>
                                    </div>
                                )}
                                {professional.email && (
                                    <div className="flex items-center gap-3 text-white/70">
                                        <div className="h-5 w-5 text-primary">✉️</div>
                                        <span>{professional.email}</span>
                                    </div>
                                )}
                                {professional.base_price && (
                                    <div className="flex items-center gap-3 text-white/70">
                                        <div className="h-5 w-5 text-primary">💰</div>
                                        <span>A partir de R$ {professional.base_price.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* CTA */}
                    <div className="text-center">
                        <Button
                            onClick={() => setShowHireDialog(true)}
                            size="lg"
                            className="bg-primary text-black hover:bg-primary/90 px-12 py-6 text-lg rounded-2xl"
                        >
                            Contratar Agora
                        </Button>
                    </div>
                </div>
            </div>

            {/* Hire Dialog */}
            <Dialog open={showHireDialog} onOpenChange={setShowHireDialog}>
                <DialogContent className="bg-zinc-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Contratar {professional.name}</DialogTitle>
                        <DialogDescription>
                            Envie uma mensagem descrevendo suas necessidades e objetivos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="message" className="text-white">Sua Mensagem</Label>
                            <Textarea
                                id="message"
                                value={hireMessage}
                                onChange={(e) => setHireMessage(e.target.value)}
                                placeholder="Olá! Gostaria de contratar seus serviços para..."
                                rows={6}
                                className="bg-white/10 text-white mt-2"
                            />
                        </div>

                        <Button
                            onClick={handleHire}
                            disabled={submitting || !hireMessage.trim()}
                            className="w-full bg-primary text-black hover:bg-primary/90"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                "Enviar Solicitação"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* PIX Payment Dialog */}
            <Dialog open={showPixDialog} onOpenChange={setShowPixDialog}>
                <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Pagamento via PIX</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Para confirmar a contratação de {professional.name}, realize o pagamento de R$ {professional.base_price?.toFixed(2)}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center space-y-6 py-4">
                        {paymentStatus === "pending" ? (
                            <>
                                <div className="p-4 bg-white rounded-2xl">
                                    {pixData?.pixQrCode && (
                                        <img src={pixData.pixQrCode} alt="PIX QR Code" className="w-48 h-48" />
                                    )}
                                </div>

                                <div className="w-full space-y-2">
                                    <p className="text-[10px] uppercase font-bold text-zinc-500 text-center tracking-widest">
                                        Pix Copia e Cola
                                    </p>
                                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
                                        <p className="text-[10px] text-zinc-400 truncate flex-1">
                                            {pixData?.pixPayload}
                                        </p>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-primary"
                                            onClick={copyPixPayload}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleCheckPayment}
                                    className="w-full bg-primary text-black hover:bg-primary/90"
                                    disabled={checkingPayment}
                                >
                                    {checkingPayment ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <QrCode className="h-4 w-4 mr-2" />}
                                    Já realizei o pagamento
                                </Button>
                            </>
                        ) : paymentStatus === "paid" ? (
                            <div className="text-center space-y-4 py-8">
                                <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                                </div>
                                <h3 className="text-xl font-bold">Pagamento Confirmado!</h3>
                                <p className="text-sm text-zinc-400">
                                    Obrigado! Sua contratação foi confirmada. Você já pode acessar o chat com o profissional.
                                </p>
                                <Button onClick={() => navigate("/aluno/chat")} className="w-full bg-primary text-black hover:bg-primary/90">
                                    Ir para o Chat
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center space-y-4 py-8">
                                <p className="text-red-400">O pagamento expirou. Por favor, tente novamente.</p>
                                <Button onClick={() => setShowPixDialog(false)} className="w-full">Fechar</Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
