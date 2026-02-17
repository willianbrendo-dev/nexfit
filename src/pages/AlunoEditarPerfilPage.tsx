import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, User, FileText, Calendar, Heart, Smartphone, Ruler, Weight, Sparkles, ChevronLeft, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { cn } from "@/lib/utils";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome"),
  sobrenome: z.string().trim().optional(),
  displayName: z.string().trim().min(2, "Informe um nome de exibição"),
  dataNascimento: z.string().optional(),
  genero: z.string().optional(),
  whatsapp: z.string().trim().min(10, "Informe um WhatsApp válido (com DDD)").optional().or(z.literal("")),
  alturaCm: z.coerce.number().min(50).max(250).optional(),
  pesoKg: z.coerce.number().min(20).max(300).optional(),
  // Usado como "frase curta" no card de saudação.
  bio: z.string().trim().max(54, "Use no máximo 54 caracteres").optional(),
});

type FormValues = z.infer<typeof schema>;

function withTimeout<T>(promise: PromiseLike<T>, ms = 15000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

const AlunoEditarPerfilPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "",
      sobrenome: "",
      displayName: "",
      dataNascimento: "",
      genero: "",
      alturaCm: undefined,
      pesoKg: undefined,
      bio: "",
      whatsapp: "",
    },
  });

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("nome, display_name, data_nascimento, genero, altura_cm, peso_kg, bio, avatar_url, whatsapp")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error(error);
        toast({
          title: "Erro ao carregar perfil",
          description: "Tente novamente em alguns instantes.",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        const [firstName, ...rest] = (data.nome ?? "").split(" ");
        const lastName = rest.join(" ");

        form.reset({
          nome: firstName,
          sobrenome: lastName,
          displayName: data.display_name ?? "",
          dataNascimento: data.data_nascimento ?? "",
          genero: data.genero ?? "",
          alturaCm: data.altura_cm ?? undefined,
          pesoKg: data.peso_kg ?? undefined,
          bio: data.bio ?? "",
          whatsapp: data.whatsapp ?? "",
        });
        setAvatarUrl(data.avatar_url ?? null);
      }
    };

    void loadProfile();
  }, [user, form, toast]);

  const convertToJpeg = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error("Falha ao converter imagem"));
          },
          "image/jpeg",
          0.85,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
      img.src = url;
    });
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!user) return;
      const file = event.target.files?.[0];
      if (!file) return;

      if (!navigator.onLine) {
        toast({
          title: "Sem conexão",
          description: "Conecte-se à internet para enviar sua foto.",
          variant: "destructive",
        });
        return;
      }

      setUploading(true);

      // Convert to JPEG to ensure browser compatibility (e.g. HEIF from iPhones)
      let uploadFile: Blob | File = file;
      const needsConversion = !file.type.startsWith("image/jpeg") && !file.type.startsWith("image/png") && !file.type.startsWith("image/webp");
      if (needsConversion || file.type === "" || file.name.toLowerCase().endsWith(".heif") || file.name.toLowerCase().endsWith(".heic")) {
        try {
          uploadFile = await convertToJpeg(file);
        } catch {
          // fallback: try uploading as-is
          uploadFile = file;
        }
      }

      const filePath = `${user.id}/${Date.now()}.jpeg`;

      const { error: uploadError } = await withTimeout(
        supabase.storage.from("avatars").upload(filePath, uploadFile, { upsert: true, contentType: "image/jpeg" }),
        20000
      );

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      if (!publicUrl) {
        throw new Error("Não foi possível gerar a URL pública do avatar.");
      }

      setAvatarUrl(publicUrl);

      const { error: updateError } = await withTimeout(
        supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id),
        15000
      );

      if (updateError) throw updateError;

      toast({ title: "Foto atualizada" });
    } catch (error) {
      console.error(error);
      toast({
        title: "Erro ao enviar foto",
        description: "Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!user) return;

    try {
      if (!navigator.onLine) {
        toast({
          title: "Sem conexão",
          description: "Conecte-se à internet para salvar suas alterações.",
          variant: "destructive",
        });
        return;
      }

      const fullName = values.sobrenome ? `${values.nome} ${values.sobrenome}`.trim() : values.nome.trim();

      const { error } = await withTimeout(
        supabase
          .from("profiles")
          .update({
            nome: fullName,
            display_name: values.displayName,
            data_nascimento: values.dataNascimento || null,
            genero: values.genero || null,
            altura_cm: values.alturaCm ?? null,
            peso_kg: values.pesoKg ?? null,
            bio: values.bio || null,
            whatsapp: values.whatsapp || null,
          })
          .eq("id", user.id),
        15000
      );

      if (error) throw error;

      // Sync Auth metadata for session consistency
      await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          display_name: values.displayName,
        }
      });

      toast({ title: "Perfil atualizado" });
      navigate(-1);
    } catch (error) {
      console.error(error);
      toast({
        title: "Falha de conexão",
        description: "Não foi possível salvar agora. Tente novamente em instantes.",
        variant: "destructive",
      });
    }
  };

  const displayName =
    (form.getValues("displayName") || user?.user_metadata?.full_name || user?.email?.split("@")[0]) ?? "Aluno";

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <main className="safe-bottom-main flex min-h-screen flex-col bg-background px-4 pb-24 pt-6 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-[-10%] right-[-10%] h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[-10%] h-64 w-64 rounded-full bg-accent/5 blur-[100px]" />

      <header className="mb-6 flex items-center gap-3 relative z-10">
        <BackIconButton to="/aluno/perfil" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">Configurações</p>
          <h1 className="mt-1 page-title-gradient text-2xl font-black uppercase tracking-tighter leading-none">Editar Perfil</h1>
        </div>
      </header>

      <section className="mb-6 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="relative overflow-hidden rounded-[32px] border border-white/5 bg-white/[0.03] p-6 backdrop-blur-xl">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar className="h-20 w-20 border-2 border-primary/20 p-1 bg-white/5 transition-transform group-hover:scale-105">
                {avatarUrl && <AvatarImage key={avatarUrl} src={avatarUrl} className="rounded-full" alt="Foto de perfil" />}
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">{initial}</AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-black shadow-lg border-2 border-background transition-all hover:scale-110 active:scale-95"
              >
                <Camera className="h-4 w-4" />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                />
              </label>
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xl font-black text-foreground tracking-tight uppercase truncate max-w-[180px]">
                {displayName}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Avatar do Atleta</span>
            </div>
          </div>
        </div>
      </section>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="h-1 w-4 rounded-full bg-primary" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Identificação Base</h2>
            </div>

            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome</FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary transition-colors group-focus-within:text-white" />
                          <Input
                            placeholder="Ex: João"
                            className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-primary/50 transition-all font-medium"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sobrenome"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Sobrenome</FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Input
                            placeholder="Opcional"
                            className="h-14 px-4 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-primary/50 transition-all font-medium"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome de Exibição</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary transition-colors group-focus-within:text-white" />
                        <Input
                          placeholder="Como você quer ser chamado(a)"
                          className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-primary/50 transition-all font-medium"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dataNascimento"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nascimento</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary transition-colors group-focus-within:text-white" />
                        <Input
                          type="date"
                          className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-primary/50 transition-all font-medium"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="genero"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Gênero</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="h-14 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:ring-0 focus:ring-offset-0 transition-all font-medium px-4">
                          <div className="flex items-center gap-3">
                            <Heart className="h-4 w-4 text-primary shrink-0" />
                            <SelectValue placeholder="Selecione" />
                          </div>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                        <SelectItem value="feminino" className="rounded-xl focus:bg-primary/20">Feminino</SelectItem>
                        <SelectItem value="masculino" className="rounded-xl focus:bg-primary/20">Masculino</SelectItem>
                        <SelectItem value="nao_binario" className="rounded-xl focus:bg-primary/20">Não-binário</SelectItem>
                        <SelectItem value="trans_feminino" className="rounded-xl focus:bg-primary/20">Mulher trans</SelectItem>
                        <SelectItem value="trans_masculino" className="rounded-xl focus:bg-primary/20">Homem trans</SelectItem>
                        <SelectItem value="outro" className="rounded-xl focus:bg-primary/20">Outro</SelectItem>
                        <SelectItem value="prefiro_nao_informar" className="rounded-xl focus:bg-primary/20">Omitir</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="whatsapp"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">WhatsApp (Compras)</FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary transition-colors group-focus-within:text-white" />
                      <Input
                        placeholder="Ex: 11999999999"
                        className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-primary/50 transition-all font-medium"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <p className="text-[9px] font-medium text-muted-foreground ml-1 uppercase tracking-tight opacity-60 italic">Utilizado para logística do Marketplace.</p>
                  <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                </FormItem>
              )}
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="h-1 w-4 rounded-full bg-accent" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/60">Biometria & Metas</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="alturaCm"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Altura (cm)</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Ruler className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-accent transition-colors group-focus-within:text-white" />
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="175"
                          className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-accent/50 transition-all font-medium"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pesoKg"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Peso (kg)</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Weight className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-accent transition-colors group-focus-within:text-white" />
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="70"
                          className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-accent/50 transition-all font-medium"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Mantra / Bio Atleta</FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-accent transition-colors group-focus-within:text-white" />
                      <Input
                        maxLength={54}
                        placeholder="Ex: Foco em constância e evolução"
                        className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 focus:border-accent/50 transition-all font-medium italic"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <p className="text-[9px] font-medium text-muted-foreground ml-1 uppercase tracking-tight opacity-60 italic">Frase curta que aparece no seu card de perfil.</p>
                  <FormMessage className="text-[10px] font-bold uppercase tracking-tight ml-1" />
                </FormItem>
              )}
            />
          </section>

          <footer className="sticky bottom-6 left-0 right-0 z-20 px-2 mt-4">
            <Button
              type="submit"
              variant="premium"
              className="h-16 w-full rounded-[28px] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary/20"
              loading={form.formState.isSubmitting}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar Alterações Base
            </Button>
          </footer>
        </form>
      </Form>
      <FloatingNavIsland />
    </main>
  );
};

export default AlunoEditarPerfilPage;

