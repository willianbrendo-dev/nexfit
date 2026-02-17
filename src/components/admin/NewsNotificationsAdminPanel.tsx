import { useState } from "react";
import { Send, Users, Loader2, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type TargetSegment = "ALL" | "FREE" | "ADVANCE" | "ELITE";

export function NewsNotificationsAdminPanel() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [segment, setSegment] = useState<TargetSegment>("ALL");
  const [isSending, setIsSending] = useState(false);

  // Calculate potential reach (approximate)
  const { data: userCounts } = useQuery({
    queryKey: ["admin-user-counts"],
    queryFn: async () => {
      // Fetch counts for each plan
      // This is a rough estimation query
      const { count: total } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      const { count: free } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_plan", "FREE");
      const { count: advance } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_plan", "ADVANCE");
      const { count: elite } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_plan", "ELITE");

      return { total: total || 0, FREE: free || 0, ADVANCE: advance || 0, ELITE: elite || 0 };
    }
  });

  const getTargetCount = () => {
    if (!userCounts) return 0;
    if (segment === "ALL") return userCounts.total;
    return userCounts[segment];
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Campos obrigatórios", description: "Preencha o título e a mensagem.", variant: "destructive" });
      return;
    }

    setIsSending(true);

    try {
      // 1. Fetch Target Users
      let query = supabase.from("profiles").select("id");

      if (segment !== "ALL") {
        query = query.eq("subscription_plan", segment);
      }

      const { data: users, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      if (!users || users.length === 0) {
        toast({ title: "Nenhum usuário encontrado", description: "Não há usuários no segmento selecionado." });
        setIsSending(false);
        return;
      }

      const userIds = users.map(u => u.id);
      const BATCH_SIZE = 100;
      const notifications = [];

      // 2. Prepare Batches
      for (const userId of userIds) {
        notifications.push({
          user_id: userId,
          title: title.trim(),
          body: message.trim(),
          type: "admin_announcement",
          data: link ? { url: link } : {},
          created_at: new Date().toISOString()
        });
      }

      // 3. Insert in Batches
      for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
        const batch = notifications.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase.from("user_notifications").insert(batch);
        if (insertError) throw insertError;
      }

      // 4. Log Action
      await supabase.from("admin_actions").insert({
        action: "send_notification_campaign",
        actor_id: (await supabase.auth.getUser()).data.user?.id || "",
        entity_id: "campaign-" + Date.now(),
        entity_table: "user_notifications",
        details: {
          title,
          segment,
          count: userIds.length,
          has_link: !!link
        }
      });

      toast({
        title: "Sucesso!",
        description: `Notificação enviada para ${userIds.length} usuários.`,
      });

      // 5. Trigger Real Push (Fire & Forget)
      try {
        await supabase.functions.invoke("push-service", {
          body: {
            segment, // Pass segment so push-service fetches everyone in that segment
            title: title.trim(),
            body: message.trim(),
            url: link || '/'
          }
        });
      } catch (pushErr) {
        console.warn("[Admin] Push trigger failed:", pushErr);
      }

      // Reset form
      setTitle("");
      setMessage("");
      setLink("");

    } catch (error: any) {
      console.error("Erro ao enviar:", error);
      toast({ title: "Erro no envio", description: error.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Create Notification Card */}
      <Card className="border border-white/10 bg-black/40 backdrop-blur-xl md:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Send className="h-5 w-5 text-primary" />
            Nova Notificação
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Envie avisos, atualizações ou mensagens de marketing para a base de alunos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Título</Label>
            <Input
              placeholder="Ex: Novidade no App!"
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary/50"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Mensagem</Label>
            <Textarea
              placeholder="Digite o conteúdo da notificação..."
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary/50 min-h-[120px]"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Link (Opcional)</Label>
            <Input
              placeholder="https://..."
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary/50"
              value={link}
              onChange={e => setLink(e.target.value)}
            />
            <p className="text-[10px] text-zinc-500">Links externos ou deep links internos (ex: /shop).</p>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Segmentação</Label>
            <Select value={segment} onValueChange={(v: any) => setSegment(v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Usuários</SelectItem>
                <SelectItem value="FREE">Apenas Gratuito (Free)</SelectItem>
                <SelectItem value="ADVANCE">Apenas Advance</SelectItem>
                <SelectItem value="ELITE">Apenas Elite</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1.5 py-1.5 px-3">
              <Users className="h-3.5 w-3.5" />
              Alcance estimado: {userCounts ? getTargetCount() : "..."} usuários
            </Badge>

            <Button
              onClick={handleSend}
              disabled={isSending || !title || !message}
              className="bg-primary text-black hover:bg-primary/90 font-bold"
            >
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar Agora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview / History Placeholder */}
      <Card className="border border-white/10 bg-black/40 backdrop-blur-xl md:col-span-1 opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Últimos Envios
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Histórico recente de campanhas. (Em breve)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 space-y-3">
            <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
            </div>
            <p className="text-sm">O histórico de campanhas estará disponível em breve.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
