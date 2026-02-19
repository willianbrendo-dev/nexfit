import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfessionalPlanModules } from "@/hooks/useProfessionalPlanModules";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Save, Image as ImageIcon, Plus, Trash2, Lock, Crown } from "lucide-react";

export default function ProfessionalLPEditor() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const { hasModule, isLoading: loadingPlan } = useProfessionalPlanModules();
    const canAccessLP = hasModule("marketplace");
    const [saving, setSaving] = useState(false);
    const [professional, setProfessional] = useState<any>(null);
    const [formData, setFormData] = useState({
        headline: "",
        about_text: "",
        services_text: "",
        contact_info: {
            whatsapp: "",
            instagram: "",
            email: ""
        },
        images: {
            hero: null,
            profile: null
        }
    });

    useEffect(() => {
        if (!user) return;
        loadProfessionalData();
    }, [user]);

    const loadProfessionalData = async () => {
        try {
            // Get professional profile
            const { data: prof, error: profError } = await supabase
                .from("professionals")
                .select("*")
                .eq("user_id", user?.id)
                .single();

            if (profError) throw profError;
            setProfessional(prof);

            // Get existing LP data
            const { data: lp, error: lpError } = await supabase
                .from("professional_landing_pages")
                .select("*")
                .eq("professional_id", prof.id)
                .single();

            if (lpError && lpError.code !== "PGRST116") throw lpError;

            if (lp) {
                setFormData({
                    headline: lp.headline || "",
                    about_text: lp.about_text || "",
                    services_text: lp.services_text || "",
                    contact_info: lp.contact_info || { whatsapp: "", instagram: "", email: "" },
                    images: lp.images || { hero: null, profile: null }
                });
            }
        } catch (error: any) {
            console.error("Load error:", error);
            toast({
                title: "Erro ao carregar dados",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!professional) return;
        setSaving(true);

        try {
            const { error } = await supabase
                .from("professional_landing_pages")
                .upsert({
                    professional_id: professional.id,
                    headline: formData.headline,
                    about_text: formData.about_text,
                    services_text: formData.services_text,
                    contact_info: formData.contact_info,
                    images: formData.images,
                    is_active: true,
                    template_type: 'simple'
                }, { onConflict: 'professional_id' });

            if (error) throw error;

            toast({
                title: "Sucesso!",
                description: "Sua Landing Page foi salva e está ativa.",
            });

            navigate("/professional/dashboard");
        } catch (error: any) {
            console.error("Save error:", error);
            toast({
                title: "Erro ao salvar",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading || loadingPlan) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!canAccessLP) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                    <Lock className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-white">Módulo Bloqueado</h1>
                    <p className="text-sm text-zinc-400 max-w-xs">
                        A edição de <strong>Landing Page</strong> não está incluída no seu plano atual.
                    </p>
                </div>
                <button
                    onClick={() => navigate("/professional/pricing")}
                    className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-bold uppercase tracking-widest text-black hover:bg-primary/90 transition-colors"
                >
                    <Crown className="h-4 w-4" /> Ver Planos
                </button>
            </main>
        );
    }

    return (
        <div className="min-h-screen bg-black pb-20">
            <header className="sticky top-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
                <div className="container mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate("/professional/dashboard")}>
                            <ArrowLeft className="h-5 w-5 text-white" />
                        </Button>
                        <h1 className="text-xl font-bold text-white">Editar Landing Page</h1>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-primary text-black hover:bg-primary/90"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Salvar
                    </Button>
                </div>
            </header>

            <main className="container mx-auto max-w-4xl p-4 space-y-6 mt-6">
                <Card className="border-white/10 bg-white/5">
                    <CardHeader>
                        <CardTitle className="text-white">Conteúdo Principal</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-white">Título de Impacto (Headline)</Label>
                            <Input
                                placeholder="Ex: Transforme seu corpo com consultoria personalizada"
                                value={formData.headline}
                                onChange={e => setFormData({ ...formData, headline: e.target.value })}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-white">Sobre Você</Label>
                            <Textarea
                                placeholder="Conte sua história, experiência e metodologia..."
                                value={formData.about_text}
                                onChange={e => setFormData({ ...formData, about_text: e.target.value })}
                                rows={6}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-white">Serviços Oferecidos</Label>
                            <Textarea
                                placeholder="Liste seus serviços (um por linha)..."
                                value={formData.services_text}
                                onChange={e => setFormData({ ...formData, services_text: e.target.value })}
                                rows={5}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5">
                    <CardHeader>
                        <CardTitle className="text-white">Imagens (URLs)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-white">URL da Imagem de Capa (Banner)</Label>
                            <Input
                                placeholder="https://exemplo.com/imagem-capa.jpg"
                                value={formData.images.hero || ""}
                                onChange={e => setFormData({
                                    ...formData,
                                    images: { ...formData.images, hero: e.target.value }
                                })}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-white">URL da Imagem de Perfil</Label>
                            <Input
                                placeholder="https://exemplo.com/foto-perfil.jpg"
                                value={formData.images.profile || ""}
                                onChange={e => setFormData({
                                    ...formData,
                                    images: { ...formData.images, profile: e.target.value }
                                })}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>
                        <p className="text-[10px] text-white/40 italic">
                            Dica: Você pode fazer upload de suas imagens no gerenciador de mídia e colar o link aqui.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5">
                    <CardHeader>
                        <CardTitle className="text-white">Informações de Contato</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label className="text-white">WhatsApp</Label>
                            <Input
                                placeholder="(00) 00000-0000"
                                value={formData.contact_info.whatsapp}
                                onChange={e => setFormData({
                                    ...formData,
                                    contact_info: { ...formData.contact_info, whatsapp: e.target.value }
                                })}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-white">Instagram</Label>
                            <Input
                                placeholder="@seuusuario"
                                value={formData.contact_info.instagram}
                                onChange={e => setFormData({
                                    ...formData,
                                    contact_info: { ...formData.contact_info, instagram: e.target.value }
                                })}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-white">E-mail de Contato</Label>
                            <Input
                                placeholder="seu@email.com"
                                value={formData.contact_info.email}
                                onChange={e => setFormData({
                                    ...formData,
                                    contact_info: { ...formData.contact_info, email: e.target.value }
                                })}
                                className="bg-black/20 border-white/10 text-white"
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-center pt-6">
                    <Button
                        size="lg"
                        onClick={() => navigate(`/professional/lp/${professional.id}`)}
                        variant="outline"
                        className="border-primary text-primary hover:bg-primary/10"
                    >
                        Visualizar Landing Page
                    </Button>
                </div>
            </main>
        </div>
    );
}
