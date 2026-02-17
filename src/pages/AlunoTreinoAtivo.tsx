import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Timer, Activity, Flame, Zap, Play, Pause, ChevronRight, Dumbbell, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { ActivityType } from "@/lib/activityTypes";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { SecureVideo } from "@/components/ui/SecureVideo";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { cn } from "@/lib/utils";
import { SpotifyButton } from "@/components/ui/SpotifyButton";
import { useBluetoothHeartRate } from "@/hooks/useBluetoothHeartRate";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Watch, BluetoothSearching, BluetoothConnected } from "lucide-react";

const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY || "7abffdb721mshe6edf9169775d83p1212ffjsn4c407842489b";

interface TreinoAtivoState {
  sessaoId?: string;
  exercicio?: {
    exercicio_id: string;
    nome: string | null;
    body_part: string | null;
    target_muscle: string | null;
    equipment: string | null;
    video_url: string | null;
    series: number;
    repeticoes: number;
  };
}

type StrengthCache = {
  userId: string;
  sessaoId: string;
  exercicio: TreinoAtivoState["exercicio"];
  currentSet: number;
  repsInCurrentSet: number;
  totalReps: number;
  elapsedSeconds: number;
  isRunning: boolean;
  bpm: number;
  calories: number;
  intensity: string;
  lastTickAt: number;
  updatedAt: string;
};

const musculacaoActivityType: ActivityType = {
  id: "musculacao",
  name: "Musculação",
  category: "estacionario",
  usesGps: false,
  usesDistance: false,
  metValue: 5.0,
};

const AlunoTreinoAtivoPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const state = (location.state as TreinoAtivoState | null) || null;
  const sessaoIdFromState = state?.sessaoId;
  const exercicioFromState = state?.exercicio;

  const [sessaoId, setSessaoId] = useState<string | undefined>(sessaoIdFromState);
  const [exercicio, setExercicio] = useState<TreinoAtivoState["exercicio"] | undefined>(exercicioFromState);

  const [currentSet, setCurrentSet] = useState(1);
  const [repsInCurrentSet, setRepsInCurrentSet] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const finalizeOnceRef = useRef(false);
  const [intensity, setIntensity] = useState("Moderada");
  const [bpm, setBpm] = useState(90);
  const [calories, setCalories] = useState(0);

  // WEARABLE & PROFILE
  const { heartRate: bleHeartRate, isConnected: isBleConnected, isConnecting: isBleConnecting, connect: connectBle, disconnect: disconnectBle } = useBluetoothHeartRate();
  const { profile } = useUserProfile();

  const getStrengthStorageKey = (userId: string, sessionId: string) => `biotreiner_strength_${userId}_${sessionId}`;

  // Restore após refresh (inclusive quando location.state some)
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    if (sessaoId && exercicio) return;

    try {
      const prefix = `biotreiner_strength_${user.id}_`;
      const candidates: StrengthCache[] = [];

      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as StrengthCache;
          if (parsed?.userId === user.id) candidates.push(parsed);
        } catch {
          // ignore
        }
      }

      if (!candidates.length) return;

      candidates.sort((a, b) => (b.lastTickAt ?? 0) - (a.lastTickAt ?? 0));
      const cached = candidates[0];
      if (!cached) return;

      setSessaoId(cached.sessaoId);
      setExercicio(cached.exercicio ?? undefined);

      const now = Date.now();
      const deltaSeconds = Math.max(0, Math.floor((now - cached.lastTickAt) / 1000));
      const catchUp = cached.isRunning;

      setCurrentSet(cached.currentSet ?? 1);
      setRepsInCurrentSet(cached.repsInCurrentSet ?? 0);
      setTotalReps(cached.totalReps ?? 0);
      setElapsedSeconds((cached.elapsedSeconds ?? 0) + (catchUp ? deltaSeconds : 0));
      setIsRunning(!!cached.isRunning);
      setBpm(cached.bpm ?? 90);
      setCalories((cached.calories ?? 0) + (catchUp ? deltaSeconds * 0.4 : 0));
      setIntensity(cached.intensity ?? "Moderada");
    } catch (e) {
      console.error("Falha ao restaurar treino ativo (musculação)", e);
    }
  }, [user, sessaoId, exercicio]);

  useEffect(() => {
    if (!sessaoId || !exercicio) {
      toast({
        title: "Sessão não encontrada",
        description: "Volte aos treinos do dia e selecione um exercício.",
        variant: "destructive",
      });
      navigate("/aluno/treinos", { replace: true });
    }
  }, [sessaoId, exercicio, navigate, toast]);

  // Timer + métricas
  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);

      // HEART RATE: Prioriza Wearable (BLE), se não usa simulação
      if (isBleConnected && bleHeartRate) {
        setBpm(bleHeartRate);
      } else {
        setBpm((prev) => {
          const variation = Math.round((Math.random() - 0.5) * 8);
          return Math.min(185, Math.max(65, prev + variation));
        });
      }

      // CALORIES: MET * Weight * Time (Scientific Formula)
      const weight = profile?.peso_kg || 75; // Default 75kg
      const met = musculacaoActivityType.metValue;
      const caloriesPerSecond = (met * weight * 3.5) / 12000;

      setCalories((prev) => prev + caloriesPerSecond);

      setIntensity((prev) => {
        if (bpm > 155) return "Alta";
        if (bpm > 120) return "Moderada";
        return "Leve";
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, bpm, profile, isBleConnected, bleHeartRate]);

  // Persistência forte (para recover após refresh)
  useEffect(() => {
    if (!user || !sessaoId) return;
    if (typeof window === "undefined") return;

    const payload: StrengthCache = {
      userId: user.id,
      sessaoId,
      exercicio: exercicio ?? null,
      currentSet,
      repsInCurrentSet,
      totalReps,
      elapsedSeconds,
      isRunning,
      bpm,
      calories,
      intensity,
      lastTickAt: Date.now(),
      updatedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(getStrengthStorageKey(user.id, sessaoId), JSON.stringify(payload));
    } catch (e) {
      console.error("Falha ao persistir treino de musculação", e);
    }
  }, [user, sessaoId, exercicio, currentSet, repsInCurrentSet, totalReps, elapsedSeconds, isRunning, bpm, calories, intensity]);

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsedSeconds]);

  const handleAddRep = () => {
    if (!exercicio) return;

    setRepsInCurrentSet((prev) => {
      const next = prev + 1;
      setTotalReps((total) => total + 1);

      if (next >= exercicio.repeticoes) {
        if (currentSet < exercicio.series) {
          setCurrentSet((set) => set + 1);
          setRepsInCurrentSet(0);
          toast({
            title: "Série concluída",
            description: "Respire fundo e prepare-se para a próxima série.",
          });
        } else {
          toast({
            title: "Exercício concluído",
            description: "Você completou todas as séries planejadas.",
          });
        }
      }

      return next;
    });
  };

  const handleToggleTimer = () => {
    setIsRunning((prev) => !prev);
  };

  const handleFinalizar = async () => {
    if (!user || !sessaoId || !exercicio) return;

    // Bloqueia clique duplo (state + ref síncrona)
    if (finalizeOnceRef.current || isFinalizing) return;
    finalizeOnceRef.current = true;
    setIsFinalizing(true);

    try {
      const { error } = await supabase
        .from("workout_sessions")
        .update({
          status: "finalizada",
          finalizado_em: new Date().toISOString(),
          series: exercicio.series,
          repetitions: exercicio.repeticoes,
          total_reps: totalReps || exercicio.series * exercicio.repeticoes,
          bpm_medio: bpm,
          calorias_estimadas: Math.round(calories),
          confirmado: true, // Confirmação explícita de treino concluído
        })
        .eq("id", sessaoId)
        .eq("user_id", user.id);

      if (error) {
        toast({
          title: "Erro ao finalizar treino",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Limpa cache de persistência forte do treino de musculação para evitar restore indevido
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(`biotreiner_strength_${user.id}_${sessaoId}`);
        } catch (e) {
          console.warn("[AlunoTreinoAtivo] Falha ao limpar cache do treino ativo (musculação)", e);
        }
      }

      toast({
        title: "Treino confirmado",
        description: "Seu treino foi registrado e confirmado para a frequência semanal.",
      });

      navigate("/aluno/atividade-personalizar", {
        replace: false,
        state: {
          sessaoId,
          atividadeNome: exercicio.nome || "Treino de Força",
          elapsedSeconds,
          bpmMedio: bpm,
          caloriasEstimadas: calories,
          activityType: musculacaoActivityType,
          intensidade: intensity,
        },
      });
    } catch (error: any) {
      console.error("Erro ao finalizar workout_session", error);
      toast({
        title: "Erro inesperado",
        description: error.message ?? "Não foi possível salvar seu treino.",
        variant: "destructive",
      });
    } finally {
      setIsFinalizing(false);
      finalizeOnceRef.current = false;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackIconButton to="/aluno/treinos" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Treino Ativo</p>
            <h1 className="page-title-gradient text-2xl font-black tracking-tight uppercase leading-none">{exercicio?.nome || "Série Ativa"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SpotifyButton className={cn(isRunning && "animate-pulse border-[#1DB954]/40 shadow-[0_0_15px_rgba(29,185,84,0.2)]")} />

          <Button
            variant="ghost"
            size="icon"
            onClick={isBleConnected ? disconnectBle : connectBle}
            className={cn(
              "h-10 w-10 rounded-2xl transition-all active:scale-90",
              isBleConnected ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]" : "bg-white/5 text-muted-foreground border border-white/5",
              isBleConnecting && "animate-pulse"
            )}
          >
            {isBleConnecting ? <BluetoothSearching className="h-5 w-5" /> : isBleConnected ? <BluetoothConnected className="h-5 w-5" /> : <Watch className="h-5 w-5" />}
          </Button>

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-primary">
            <Activity className="h-5 w-5 animate-pulse" />
          </div>
        </div>
      </header>

      {exercicio && (
        <section className="flex flex-1 flex-col gap-6">
          {/* Main Media & Focus Card */}
          <div className="relative overflow-hidden rounded-[32px] border border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent p-2 backdrop-blur-xl">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] bg-black/40">
              {exercicio?.video_url && exercicio.video_url.endsWith(".mp4") ? (
                <SecureVideo
                  src={exercicio.video_url}
                  apiKey={RAPIDAPI_KEY}
                  className="h-full w-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={
                    exercicio?.video_url ||
                    (exercicio?.body_part ? `/images/muscles/${exercicio.body_part}.png` : "/default-exercise.png")
                  }
                  alt={exercicio?.nome || "Exercício"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}

              {/* Overlay Goal */}
              <div className="absolute top-4 left-4">
                <div className="flex items-center gap-2 rounded-2xl bg-black/60 px-4 py-2 backdrop-blur-md border border-white/10">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-xs font-black text-white">{exercicio.series} SÉRIES x {exercicio.repeticoes} REPS</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 px-2">
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Foco Principal</p>
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  <span className="text-[13px] font-black text-foreground uppercase tracking-tight">
                    {exercicio?.target_muscle || exercicio?.body_part || "Força Geral"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Equipamento</p>
                <p className="text-[11px] font-bold text-muted-foreground capitalize">{exercicio.equipment || "Nenhum"}</p>
              </div>
            </div>
          </div>

          {/* High Performance Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 text-center">
              <Timer className="absolute -right-2 -top-2 h-12 w-12 text-blue-500/10" />
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-500/60 mb-1">Duração</p>
              <p className="text-xl font-black text-foreground tabular-nums">{formattedTime}</p>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 text-center">
              <Activity className="absolute -right-2 -top-2 h-12 w-12 text-primary/10" />
              <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1">Batimento</p>
              <div className="flex items-baseline justify-center gap-1">
                <p className="text-xl font-black text-foreground tabular-nums">{bpm}</p>
                <span className="text-[9px] font-bold text-muted-foreground">bpm</span>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 text-center">
              <Flame className="absolute -right-2 -top-2 h-12 w-12 text-orange-500/10" />
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-500/60 mb-1">Energia</p>
              <div className="flex items-baseline justify-center gap-1">
                <p className="text-xl font-black text-foreground tabular-nums">{Math.round(calories)}</p>
                <span className="text-[9px] font-bold text-muted-foreground">kcal</span>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 text-center">
              <Target className="absolute -right-2 -top-2 h-12 w-12 text-emerald-500/10" />
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 mb-1">Intensidade</p>
              <p className="text-xl font-black text-emerald-400 tracking-tight">{intensity}</p>
            </div>
          </div>

          {/* Progress & Controls Card */}
          <div className="mt-2 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Série em andamento</p>
                  <p className="text-lg font-black text-foreground tracking-tight">
                    Série <span className="text-primary">{currentSet}</span> de {exercicio.series}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {[...Array(exercicio.series)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 w-6 rounded-full transition-all duration-500",
                        i + 1 < currentSet ? "bg-primary" :
                          i + 1 === currentSet ? "bg-primary animate-pulse w-10" :
                            "bg-white/10"
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="relative flex min-h-[140px] items-center justify-between rounded-[32px] border border-white/5 bg-white/[0.02] p-6 backdrop-blur-3xl">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Reps na série</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter text-foreground">{repsInCurrentSet}</span>
                    <span className="text-xl font-bold text-muted-foreground/20 italic">/ {exercicio.repeticoes}</span>
                  </div>
                </div>

                <Button
                  className="h-24 w-24 rounded-[32px] bg-primary text-black shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)] hover:scale-105 active:scale-95 transition-all"
                  onClick={handleAddRep}
                >
                  <span className="text-4xl font-black">+1</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button
                variant="outline-premium"
                className="py-10 rounded-3xl"
                onClick={handleToggleTimer}
              >
                {isRunning ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
                {isRunning ? "Pausar" : "Retomar"}
              </Button>

              <Button
                className="variant-premium py-10 rounded-3xl"
                onClick={handleFinalizar}
                loading={isFinalizing}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Finalizar
              </Button>
            </div>
          </div>
        </section>

      )}
      <FloatingNavIsland />
    </div>
  );
};

export default AlunoTreinoAtivoPage;
