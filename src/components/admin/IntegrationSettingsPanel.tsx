
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Key, Eye, EyeOff } from "lucide-react";

export function IntegrationSettingsPanel() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showToken, setShowToken] = useState(false);

    const [publicKey, setPublicKey] = useState("");
    const [accessToken, setAccessToken] = useState("");

    useEffect(() => {
        fetchConfigs();
    }, []);

    async function fetchConfigs() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("integration_configs")
                .select("key, value")
                .in("key", ["mercadopago_public_key", "mercadopago_access_token"]);

            if (error) throw error;

            data?.forEach((cfg) => {
                if (cfg.key === "mercadopago_public_key") setPublicKey(cfg.value || "");
                if (cfg.key === "mercadopago_access_token") setAccessToken(cfg.value || "");
            });
        } catch (err: any) {
            console.error("Error fetching configs:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        try {
            setSaving(true);
            const updates = [
                { key: "mercadopago_public_key", value: publicKey, is_secret: false, description: "Mercado Pago Production Public Key" },
                { key: "mercadopago_access_token", value: accessToken, is_secret: true, description: "Mercado Pago Production Access Token" }
            ];

            const { error } = await supabase
                .from("integration_configs")
                .upsert(updates);

            if (error) throw error;

            toast({
                title: "Configurações salvas",
                description: "As chaves de integração foram atualizadas com sucesso.",
            });
        } catch (err: any) {
            toast({
                title: "Erro ao salvar",
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-green-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 py-2">
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                <p className="text-xs text-yellow-200/80">
                    <strong>Atenção:</strong> Alterar estas chaves afetará imediatamente o processamento de pagamentos em todo o sistema. Certifique-se de que as novas chaves são de **Produção**.
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="public_key" className="text-sm font-medium text-white flex items-center gap-2">
                        <Key className="h-4 w-4 text-green-500" />
                        Mercado Pago Public Key
                    </Label>
                    <Input
                        id="public_key"
                        placeholder="APP_USR-..."
                        value={publicKey}
                        onChange={(e) => setPublicKey(e.target.value)}
                        className="bg-black/20 border-white/10 text-white"
                    />
                    <p className="text-[10px] text-muted-foreground">Usada pelo checkout no navegador para coletar dados de pagamento.</p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="access_token" className="text-sm font-medium text-white flex items-center gap-2">
                        <Key className="h-4 w-4 text-green-500" />
                        Mercado Pago Access Token
                    </Label>
                    <div className="relative">
                        <Input
                            id="access_token"
                            type={showToken ? "text" : "password"}
                            placeholder="APP_USR-..."
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            className="bg-black/20 border-white/10 text-white pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                        >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Usado pelo servidor para criar ordens e processar webhooks. **Nunca compartilhe.**</p>
                </div>
            </div>

            <div className="pt-4">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Integrações
                </Button>
            </div>
        </div>
    );
}
