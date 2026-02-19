import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OnboardingLoadingScreen from "@/components/onboarding/OnboardingLoadingScreen";
import {
  User,
  Smartphone,
  Ruler,
  Weight,
  Target,
  Flame,
  Zap,
  Brain,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Dumbbell
} from "lucide-react";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { cn } from "@/lib/utils";

const onboardingSchema = z.object({
  nome: z.string().min(2, "Informe seu nome"),
  sobrenome: z.string().optional(),
  genero: z.enum(["masculino", "feminino", "outro"], {
    errorMap: () => ({ message: "Selecione um gênero" }),
  }),
  whatsapp: z.string().min(10, "Informe um WhatsApp válido (com DDD)"),
  altura_cm: z
    .string()
    .refine((val) => !Number.isNaN(parseFloat(val)) && parseFloat(val) > 0, "Informe uma altura válida"),
  peso_kg: z
    .string()
    .refine((val) => !Number.isNaN(parseFloat(val)) && parseFloat(val) > 0, "Informe um peso válido"),
  objetivo: z.string().min(3, "Selecione um objetivo"),
  nivel: z.enum(["iniciante", "intermediario", "avancado"], {
    errorMap: () => ({ message: "Selecione seu nível" }),
  }),
  training_days: z
    .array(
      z.enum([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ]),
    )
    .min(2, "Selecione entre 2 e 6 dias da semana")
    .max(6, "Selecione entre 2 e 6 dias da semana"),
  focus_group: z.enum(["Balanced", "Chest", "Back", "Arms", "Legs", "Glutes", "Abs"], {
    errorMap: () => ({ message: "Selecione um grupo muscular" }),
  }),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const steps = ["Identificação", "Biometria", "Foco", "Nível", "Dias", "Grupo"] as const;

const TRAINING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const TRAINING_DAYS_LABELS: Record<(typeof TRAINING_DAYS)[number], string> = {
  Monday: "Segunda-feira",
  Tuesday: "Terça-feira",
  Wednesday: "Quarta-feira",
  Thursday: "Quinta-feira",
  Friday: "Sexta-feira",
  Saturday: "Sábado",
  Sunday: "Domingo",
};

const FOCUS_GROUPS = [
  { value: "Balanced", label: "Equilibrado", tag: "Recomendado" },
  { value: "Chest", label: "Peito" },
  { value: "Back", label: "Costas" },
  { value: "Arms", label: "Braços" },
  { value: "Legs", label: "Pernas" },
  { value: "Glutes", label: "Glúteos" },
  { value: "Abs", label: "Abdômen" },
] as const;

const TRAINING_LEVEL_LABELS: Record<OnboardingFormValues["nivel"], string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

const AlunoOnboardingPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [processingSummary, setProcessingSummary] = useState<{
    trainingLevelLabel?: string;
    trainingDaysLabel?: string;
    focusGroupLabel?: string;
  } | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      nome: "",
      sobrenome: "",
      genero: undefined,
      whatsapp: "",
      altura_cm: "",
      peso_kg: "",
      objetivo: "",
      nivel: undefined,
      training_days: [],
      focus_group: undefined,
    },
  });

  const selectedGenero = watch("genero");
  const selectedObjetivo = watch("objetivo");
  const selectedNivel = watch("nivel");
  const selectedTrainingDays = watch("training_days");
  const selectedFocusGroup = watch("focus_group");

  // Restaura dados do onboarding do cache local, se existirem
  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const storageKey = `biotreiner_onboarding_${user.id}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const cached = JSON.parse(raw) as Partial<OnboardingFormValues> & { currentStep?: number };
        if (cached) {
          if (typeof cached.currentStep === "number") {
            setCurrentStep(cached.currentStep);
          }
          Object.entries(cached).forEach(([key, value]) => {
            if (key === "currentStep") return;
            if (value !== undefined && value !== null) {
              setValue(key as keyof OnboardingFormValues, value as any);
            }
          });
        }
      }
    } catch (error) {
      console.warn("Falha ao restaurar dados do onboarding do cache", error);
    }
  }, [user, setValue]);

  // Persiste continuamente o estado do formulário de onboarding
  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const storageKey = `biotreiner_onboarding_${user.id}`;
    try {
      const snapshot: Partial<OnboardingFormValues> & { currentStep: number } = {
        currentStep,
        nome: watch("nome"),
        sobrenome: watch("sobrenome"),
        genero: watch("genero"),
        whatsapp: watch("whatsapp"),
        altura_cm: watch("altura_cm"),
        peso_kg: watch("peso_kg"),
        objetivo: watch("objetivo"),
        nivel: watch("nivel"),
        training_days: watch("training_days"),
        focus_group: watch("focus_group"),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Falha ao salvar dados do onboarding no cache", error);
    }
  }, [user, currentStep, watch]);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    return await new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(label)), timeoutMs);
      promise
        .then(resolve)
        .catch(reject)
        .finally(() => window.clearTimeout(t));
    });
  };

  const writeOnboardingCache = (payload: {
    onboarding_completed: boolean;
    altura_cm: number | null;
    peso_kg: number | null;
    training_level?: string | null;
  }) => {
    if (!user || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        `biotreiner_onboarding_cache_${user.id}`,
        JSON.stringify({ ...payload, cached_at: Date.now() }),
      );
    } catch {
      // ignore
    }
  };

  const onSubmit = async (values: OnboardingFormValues) => {
    if (!user) return;

    const altura = parseFloat(values.altura_cm);
    const peso = parseFloat(values.peso_kg);

    try {
      if (isSaving) return;
      setIsSaving(true);

      // Fluxo de primeiro acesso deve ser confiável: sem internet, não prossegue.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        toast({
          title: "Sem conexão",
          description: "Conecte-se à internet para concluir o onboarding e gerar seu plano.",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      const fullName = values.sobrenome ? `${values.nome} ${values.sobrenome}`.trim() : values.nome.trim();

      const payload = {
        display_name: values.nome.trim(),
        nome: fullName,
        genero: values.genero,
        whatsapp: values.whatsapp,
        altura_cm: altura,
        peso_kg: peso,
        objetivo: values.objetivo,
        nivel: values.nivel,
        training_level: values.nivel,
        training_days: values.training_days,
        focus_group: values.focus_group,
        onboarding_completed: true,
      };

      // Preferência do requisito: UPDATE. Se não existir profile ainda, fazemos fallback para UPSERT.
      const updatePromise = supabase.from("profiles").update(payload as any).eq("id", user.id).select("id");
      const updateRes: any = await withTimeout(updatePromise as any, 6000, "onboarding_update_timeout");
      if (updateRes?.error) throw updateRes.error;
      if (Array.isArray(updateRes?.data) && updateRes.data.length === 0) {
        const upsertPromise = supabase.from("profiles").upsert({ id: user.id, ...payload } as any, { onConflict: "id" });
        const upsertRes: any = await withTimeout(upsertPromise as any, 6000, "onboarding_upsert_timeout");
        if (upsertRes?.error) throw upsertRes.error;
      }

      // Atualiza cache que o gate (RequireOnboarding) usa.
      writeOnboardingCache({ onboarding_completed: true, altura_cm: altura, peso_kg: peso, training_level: values.nivel });

      // Limpa o cache do formulário após concluir.
      try {
        window.localStorage.removeItem(`biotreiner_onboarding_${user.id}`);
      } catch {
        // ignore
      }

      console.log("[Onboarding] Submission successful, proceeding to loading screen...");
      // Loading + redirecionamento (apenas depois de persistir com sucesso)
      setIsProcessing(true);
      setProcessingSummary({
        trainingLevelLabel: TRAINING_LEVEL_LABELS[values.nivel],
        trainingDaysLabel: (values.training_days ?? [])
          .map((day) => TRAINING_DAYS_LABELS[day] ?? day)
          .join(", "),
        focusGroupLabel: FOCUS_GROUPS.find((g) => g.value === values.focus_group)?.label ?? String(values.focus_group),
      });
    } catch (err: any) {
      console.error("[Onboarding] Error during submission:", err);
      toast({
        title: "Erro ao salvar onboarding",
        description: err?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getFirstInvalidStep = () => {
    const v = {
      nome: (watch("nome") ?? "").trim(),
      sobrenome: (watch("sobrenome") ?? "").trim(),
      genero: watch("genero"),
      altura_cm: watch("altura_cm"),
      peso_kg: watch("peso_kg"),
      objetivo: (watch("objetivo") ?? "").trim(),
      nivel: watch("nivel"),
      training_days: watch("training_days") ?? [],
      focus_group: watch("focus_group"),
    };

    if (!v.nome || v.nome.length < 2 || !v.genero || !v.whatsapp || v.whatsapp.length < 10) return 0;
    const altura = parseFloat(String(v.altura_cm ?? "0"));
    const peso = parseFloat(String(v.peso_kg ?? "0"));
    if (isNaN(altura) || altura <= 0 || isNaN(peso) || peso <= 0) return 1;
    if (!v.objetivo || v.objetivo.length < 3) return 2;
    if (!v.nivel) return 3;
    if (!Array.isArray(v.training_days) || v.training_days.length < 2 || v.training_days.length > 6) return 4;
    if (!v.focus_group) return 5;
    return null;
  };

  const toggleTrainingDay = (day: (typeof TRAINING_DAYS)[number]) => {
    const current = (watch("training_days") ?? []) as string[];
    const exists = current.includes(day);

    if (exists) {
      setValue(
        "training_days",
        current.filter((d) => d !== day) as any,
        { shouldValidate: true },
      );
      return;
    }

    if (current.length >= 6) {
      toast({
        title: "Seleção inválida",
        description: "Selecione entre 2 e 6 dias da semana",
        variant: "destructive",
      });
      return;
    }

    setValue("training_days", [...current, day] as any, { shouldValidate: true });
  };

  const focusStep = (step: number) => {
    setCurrentStep(step);
    window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleFinalSubmit = handleSubmit(
    (values) => {
      const firstInvalid = getFirstInvalidStep();
      if (firstInvalid !== null) {
        if (firstInvalid === 4) {
          toast({
            title: "Seleção inválida",
            description: "Selecione entre 2 e 6 dias da semana",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Faltam informações",
            description: "Complete as etapas pendentes para concluir seu plano.",
            variant: "destructive",
          });
        }
        focusStep(firstInvalid);
        return;
      }
      onSubmit(values);
    },
    () => {
      const firstInvalid = getFirstInvalidStep();
      toast({
        title: "Revise suas respostas",
        description: "Há campos obrigatórios pendentes. Vamos te levar até eles.",
        variant: "destructive",
      });
      focusStep(firstInvalid ?? 0);
    },
  );
  if (isProcessing) {
    return (
      <OnboardingLoadingScreen
        durationMs={9000}
        trainingLevelLabel={processingSummary?.trainingLevelLabel}
        trainingDaysLabel={processingSummary?.trainingDaysLabel}
        focusGroupLabel={processingSummary?.focusGroupLabel}
        onProceed={() => navigate("/aluno/dashboard", { replace: true })}
      />
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative group">
                  <Label htmlFor="nome" className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2 block ml-1">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                    <Input
                      id="nome"
                      placeholder="Nome"
                      className="h-14 pl-10 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 transition-all font-medium"
                      {...register("nome")}
                    />
                  </div>
                  {errors.nome && <p className="mt-1.5 text-[10px] font-bold text-destructive flex items-center gap-1 uppercase tracking-tight ml-1">{errors.nome.message}</p>}
                </div>

                <div className="relative group">
                  <Label htmlFor="sobrenome" className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2 block ml-1">Sobrenome</Label>
                  <div className="relative">
                    <Input
                      id="sobrenome"
                      placeholder="Opcional"
                      className="h-14 px-4 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 transition-all font-medium"
                      {...register("sobrenome")}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">Gênero</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setValue("genero", "masculino", { shouldValidate: true })}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all duration-300",
                      selectedGenero === "masculino"
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                        : "border-white/5 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <User className={cn("h-6 w-6 transition-transform group-active:scale-90", selectedGenero === "masculino" ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-black uppercase tracking-widest", selectedGenero === "masculino" ? "text-primary" : "text-muted-foreground")}>Masculino</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue("genero", "feminino", { shouldValidate: true })}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all duration-300",
                      selectedGenero === "feminino"
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                        : "border-white/5 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <User className={cn("h-6 w-6 transition-transform group-active:scale-90", selectedGenero === "feminino" ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-black uppercase tracking-widest", selectedGenero === "feminino" ? "text-primary" : "text-muted-foreground")}>Feminino</span>
                  </button>
                </div>
                {errors.genero && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.genero.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp" className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1 block mb-2">Contato</Label>
                <div className="relative">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  <Input
                    id="whatsapp"
                    placeholder="WhatsApp (ex: 11999999999)"
                    className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 transition-all font-medium"
                    {...register("whatsapp")}
                  />
                </div>
                {errors.whatsapp && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.whatsapp.message}</p>}
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid gap-4">
              <div className="relative group">
                <Label htmlFor="altura_cm" className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2 block ml-1">Altura</Label>
                <div className="relative">
                  <Ruler className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  <Input
                    id="altura_cm"
                    type="number"
                    inputMode="decimal"
                    placeholder="Altura em cm (ex: 175)"
                    className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 transition-all font-medium"
                    {...register("altura_cm")}
                  />
                </div>
                {errors.altura_cm && <p className="mt-1.5 text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.altura_cm.message}</p>}
              </div>

              <div className="relative group">
                <Label htmlFor="peso_kg" className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2 block ml-1">Peso Atual</Label>
                <div className="relative">
                  <Weight className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  <Input
                    id="peso_kg"
                    type="number"
                    inputMode="decimal"
                    placeholder="Peso em kg (ex: 72)"
                    className="h-14 pl-12 rounded-2xl border-white/10 bg-white/5 focus:bg-white/10 transition-all font-medium"
                    {...register("peso_kg")}
                  />
                </div>
                {errors.peso_kg && <p className="mt-1.5 text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.peso_kg.message}</p>}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1 block mb-4">Qual seu objetivo principal?</Label>
            <div className="grid gap-3">
              {[
                { label: "Emagrecimento", icon: Flame, color: "text-orange-500" },
                { label: "Ganho de massa muscular", icon: Target, color: "text-red-500" },
                { label: "Resistência e condicionamento", icon: Zap, color: "text-yellow-500" },
                { label: "Saúde geral e bem-estar", icon: Brain, color: "text-indigo-400" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setValue("objetivo", opt.label, { shouldValidate: true })}
                  className={cn(
                    "group relative flex items-center justify-between rounded-3xl border p-5 transition-all duration-300",
                    selectedObjetivo === opt.label
                      ? "border-primary bg-primary/10 shadow-lg"
                      : "border-white/5 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5", opt.color)}>
                      <opt.icon className="h-5 w-5" />
                    </div>
                    <span className={cn("text-sm font-bold", selectedObjetivo === opt.label ? "text-foreground" : "text-muted-foreground")}>{opt.label}</span>
                  </div>
                  {selectedObjetivo === opt.label && <div className="h-2 w-2 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
            {errors.objetivo && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.objetivo.message}</p>}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1 block mb-4">Qual seu nível atual?</Label>
            <div className="grid gap-3 text-xs">
              {[
                { id: "iniciante", label: "Iniciante", desc: "Menos de 6 meses ou irregular.", level: 1 },
                { id: "intermediario", label: "Intermediário", desc: "Consistente há 6-24 meses.", level: 2 },
                { id: "avancado", label: "Avançado", desc: "Treino intenso há mais de 2 anos.", level: 3 },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setValue("nivel", opt.id as any, { shouldValidate: true })}
                  className={cn(
                    "group relative flex flex-col rounded-3xl border p-5 transition-all duration-300",
                    selectedNivel === opt.id
                      ? "border-primary bg-primary/10"
                      : "border-white/5 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-base font-black uppercase tracking-widest", selectedNivel === opt.id ? "text-primary" : "text-foreground")}>{opt.label}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map((s) => (
                        <div key={s} className={cn("h-1.5 w-4 rounded-full", s <= opt.level ? (selectedNivel === opt.id ? "bg-primary" : "bg-muted-foreground") : "bg-white/5")} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
            {errors.nivel && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.nivel.message}</p>}
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">Frequência Semanal</Label>
              <p className="text-xs text-muted-foreground ml-1">Selecione de 2 a 6 dias para seu protocolo.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {TRAINING_DAYS.map((day) => {
                const selected = Array.isArray(selectedTrainingDays) && selectedTrainingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleTrainingDay(day)}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border p-4 transition-all duration-300",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/5 bg-white/5 text-muted-foreground hover:bg-white/10"
                    )}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{TRAINING_DAYS_LABELS[day] ?? day}</span>
                    {selected && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
            {errors.training_days && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{(errors.training_days as any).message}</p>}
          </div>
        );
      case 5:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1 font-black">Prioridade Muscular</Label>
              <p className="text-xs text-muted-foreground ml-1">Escolha o principal foco para IA calibrar o volume.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {FOCUS_GROUPS.map((opt) => {
                const selected = selectedFocusGroup === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValue("focus_group", opt.value as any, { shouldValidate: true })}
                    className={cn(
                      "group relative flex flex-col gap-1 rounded-2xl border p-4 transition-all duration-300",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/5 bg-white/5 text-muted-foreground hover:bg-white/10"
                    )}
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.1em]">{opt.label}</span>
                    {(opt as any).tag && (
                      <span className="text-[8px] font-black uppercase tracking-wider text-primary/60">{(opt as any).tag}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.focus_group && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight ml-1">{errors.focus_group.message}</p>}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main ref={containerRef as any} className="flex min-h-screen items-center justify-center bg-background px-4 py-10 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-[-10%] right-[-10%] h-64 w-64 rounded-full bg-primary/10 blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[-10%] h-64 w-64 rounded-full bg-accent/10 blur-[100px]" />

      <Card className="w-full max-w-sm border-white/10 bg-white/[0.03] backdrop-blur-2xl shadow-2xl rounded-[40px] overflow-hidden relative border">
        <CardContent className="space-y-8 p-8 pt-10">
          <header className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-primary mb-2">
              <Brain className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">AI Onboarding</p>
              <h1 className="page-title-gradient text-3xl font-black tracking-tighter uppercase leading-none mt-1">Configuração</h1>
            </div>
            <p className="text-xs text-muted-foreground font-medium px-4">
              A IA Nexfit montará seu protocolo personalizado em instantes.
            </p>
          </header>

          {/* Premium Stepper */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-shimmer transition-all duration-700"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
            <div className="min-h-[320px]">
              {renderStep()}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-16 rounded-3xl border-white/5 bg-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-white/10"
                disabled={currentStep === 0}
                onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>

              {currentStep < steps.length - 1 ? (
                <Button
                  type="button"
                  variant="premium"
                  className="h-16 rounded-3xl text-[10px] font-black uppercase tracking-widest"
                  onClick={() => {
                    if (currentStep === 4) {
                      const days = (watch("training_days") ?? []) as string[];
                      if (days.length < 2 || days.length > 6) {
                        toast({
                          title: "Seleção inválida",
                          description: "Selecione entre 2 e 6 dias da semana",
                          variant: "destructive",
                        });
                        return;
                      }
                    }
                    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
                  }}
                >
                  Próximo
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="premium"
                  className="h-16 rounded-3xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                  onClick={() => handleFinalSubmit()}
                  disabled={isSaving}
                  loading={isSaving}
                >
                  Gerar Plano
                  <Zap className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

export default AlunoOnboardingPage;
