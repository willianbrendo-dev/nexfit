import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Play, Pause, Timer, Activity, Flame, Zap, Navigation2, Dumbbell, Info, Target, ArrowLeft } from "lucide-react";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { LocationTracker, type LocationIngestResult, type LocationPoint, type LocationTrackerMode } from "@/services/locationTracker";
import { getMovementConfidenceParams } from "@/lib/movementConfidence";
import { haversineMeters } from "@/lib/geoDistance";
import { cn } from "@/lib/utils";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { SpotifyButton } from "@/components/ui/SpotifyButton";
import { useBluetoothHeartRate } from "@/hooks/useBluetoothHeartRate";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Watch, BluetoothSearching, BluetoothConnected } from "lucide-react";

const AlunoAtividadePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isOnline } = useConnectionStatus({ silent: true });

  // Recebe dados da navegação
  const stateData =
    (location.state as {
      sessaoId?: string;
      atividadeNome?: string;
      activityType?: import("@/lib/activityTypes").ActivityType;
      caption?: string;
      generatedUrl?: string;
    } | null) ||
    null;
  const sessaoIdInicial = stateData?.sessaoId;
  const atividadeInicial = stateData?.atividadeNome;
  const activityTypeInicial = stateData?.activityType;

  const [selectedActivityType, setSelectedActivityType] = useState<import("@/lib/activityTypes").ActivityType | null>(
    activityTypeInicial || null,
  );
  const [selectedActivity, setSelectedActivity] = useState<string>(
    selectedActivityType?.name || atividadeInicial || "Atividade",
  );
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bpm, setBpm] = useState(82);
  const [calories, setCalories] = useState(0);
  const [intensity, setIntensity] = useState("Moderada");

  type MovementState = "moving" | "stationary" | "signal_weak";
  const [movementState, setMovementState] = useState<MovementState>("stationary");
  const movementStateRef = useRef<MovementState>("stationary");
  const [sessionId, setSessionId] = useState<string | null>(sessaoIdInicial || null);
  const [showSummary, setShowSummary] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restFinished, setRestFinished] = useState(false);
  const [hasPendingFinalization, setHasPendingFinalization] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveOnceRef = useRef(false);
  // Distância total percorrida em km, calculada a partir dos pontos de GPS válidos
  const [distanceKm, setDistanceKm] = useState(0);
  // Indica se o cálculo de distância/ritmo está pausado por falta de movimento real
  const [isStationaryPaused, setIsStationaryPaused] = useState(false);
  // Acumula o tempo (em segundos) em que o usuário permanece abaixo dos limiares de movimento
  const stationaryTimeRef = useRef(0);

  // WEARABLE & PROFILE
  const { heartRate: bleHeartRate, isConnected: isBleConnected, isConnecting: isBleConnecting, connect: connectBle, disconnect: disconnectBle } = useBluetoothHeartRate();
  const { profile } = useUserProfile();

  // SLIDING WINDOW PACE (last 30 seconds of movement)
  const [paceWindow, setPaceWindow] = useState<{ dist: number; time: number }[]>([]);

  const ACTIVITY_STORAGE_PREFIX = "biotreiner_activity_" as const;

  type ActivityCache = {
    userId: string;
    sessionId: string;
    atividadeNome: string;
    activityTypeId?: string;
    elapsedSeconds: number;
    bpm: number;
    calories: number;
    intensity: string;
    status: "idle" | "running" | "finished_not_saved";
    /** timestamp em ms do último save (usado para recompor o cronômetro após refresh) */
    lastTickAt: number;
    updatedAt: string;
    gpsPoints?: GpsPoint[];
    distanceKm?: number;
    restSeconds?: number | null;
    isStationaryPaused?: boolean;
    stationaryTimeSeconds?: number;
    movementState?: MovementState;
  };

  type GpsPoint = {
    lat: number;
    lng: number;
    timestamp: number;
    accuracy: number;
    speed?: number | null;
  };

  const getActivityStorageKey = (userId: string, sessaoId: string) =>
    `${ACTIVITY_STORAGE_PREFIX}${userId}_${sessaoId}`;

  const gpsWatchIdRef = useRef<number | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const trackerRef = useRef<LocationTracker | null>(null);
  const [gpsDebug, setGpsDebug] = useState<LocationIngestResult | null>(null);

  // Distance accumulation for PWA (physics rule; independent from movementState)
  const lastDistancePointRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const lastDistanceSeenAtRef = useRef<number | null>(null);
  const [gpsPhysicsDebug, setGpsPhysicsDebug] = useState<{
    accuracy: number;
    deltaDistMeters: number;
    deltaTimeSeconds: number;
    accepted: boolean;
  } | null>(null);

  // Movement confirmation (mode-specific) - PWA-safe: do NOT rely on GPS timestamps.
  const acceptedCountRef = useRef(0);
  const rejectedCountRef = useRef(0);

  const gpsDebugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("debugGps") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

  const mode: LocationTrackerMode = useMemo(
    () => (selectedActivityType?.id as LocationTrackerMode) || "default",
    [selectedActivityType?.id],
  );

  const movementParams = useMemo(() => getMovementConfidenceParams(mode), [mode]);

  // Keep a ref in sync to avoid re-creating GPS watchers due to state dependencies.
  useEffect(() => {
    movementStateRef.current = movementState;
  }, [movementState]);

  // Redireciona se não houver dados de sessão (tentando recuperar do cache primeiro)
  useEffect(() => {
    if (!user) return;

    const restoreFromAnyCache = () => {
      try {
        const prefix = `${ACTIVITY_STORAGE_PREFIX}${user.id}_`;
        const candidates: ActivityCache[] = [];

        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (!key || !key.startsWith(prefix)) continue;
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as ActivityCache;
            if (parsed?.userId === user.id) {
              candidates.push(parsed);
            }
          } catch {
            // ignore
          }
        }

        if (!candidates.length) return null;

        candidates.sort((a, b) => {
          const aT = a.lastTickAt ?? new Date(a.updatedAt).getTime();
          const bT = b.lastTickAt ?? new Date(b.updatedAt).getTime();
          return bT - aT;
        });

        // Preferimos uma sessão ainda em execução ou com finalização pendente
        const picked =
          candidates.find((c) => c.status === "running") ??
          candidates.find((c) => c.status === "finished_not_saved") ??
          candidates[0];

        return picked ?? null;
      } catch {
        return null;
      }
    };

    // Se não vier state via navigation (ex: refresh), tentamos recuperar o que estava em andamento.
    if (!sessaoIdInicial || !atividadeInicial) {
      const cached = restoreFromAnyCache();
      if (!cached) {
        toast({
          title: "Sessão não encontrada",
          description: "Por favor, selecione uma atividade primeiro.",
          variant: "destructive",
        });
        navigate("/aluno/monitoramento", { replace: true });
        return;
      }

      setSessionId(cached.sessionId);
      setSelectedActivity(cached.atividadeNome || "Atividade");

      // Se houver um tipo de atividade no cache, tentamos reconstruir o objeto mínimo.
      if (cached.activityTypeId) {
        setSelectedActivityType((prev) => prev ?? {
          id: cached.activityTypeId,
          name: cached.atividadeNome,
          category: "estacionario",
          usesGps: false,
          usesDistance: false,
          metValue: 5.0 // Fallback MET
        });
      }
    }
  }, [user, sessaoIdInicial, atividadeInicial, navigate, toast]);

  // Restaura progresso ou finalização pendente a partir do cache
  useEffect(() => {
    if (!user) return;
    if (!sessionId && !sessaoIdInicial) return;
    if (typeof window === "undefined") return;

    const resolvedSessionId = sessionId ?? sessaoIdInicial ?? null;
    if (!resolvedSessionId) return;

    try {
      const key = getActivityStorageKey(user.id, resolvedSessionId);
      const stored = window.localStorage.getItem(key);
      if (!stored) return;

      const cached = JSON.parse(stored) as ActivityCache;

      const now = Date.now();
      const lastTickAt = cached.lastTickAt ?? new Date(cached.updatedAt).getTime();
      const deltaSeconds = Math.max(0, Math.floor((now - lastTickAt) / 1000));
      const shouldCatchUp = cached.status === "running";

      setElapsedSeconds((cached.elapsedSeconds ?? 0) + (shouldCatchUp ? deltaSeconds : 0));
      setBpm(cached.bpm ?? 82);
      // Evita evoluir calorias no restore se não estávamos em movimento real.
      const recoveryMet = cached.activityTypeId === 'corrida' ? 8.0 : cached.activityTypeId === 'caminhada' ? 3.5 : 5.0;
      const recoveryWeight = 75; // Default fallback for catch-up
      const recoveryCalPerSec = (recoveryMet * recoveryWeight * 3.5) / 12000;
      setCalories((cached.calories ?? 0) + (shouldCatchUp && cached.movementState === "moving" ? deltaSeconds * recoveryCalPerSec : 0));
      setIntensity(cached.intensity ?? "Moderada");
      setSessionId(cached.sessionId);

      if (cached.movementState) {
        setMovementState(cached.movementState);
      }

      if (cached.atividadeNome) {
        setSelectedActivity(cached.atividadeNome);
      }

      if (cached.activityTypeId) {
        setSelectedActivityType((prev) =>
          prev ?? {
            id: cached.activityTypeId,
            name: cached.atividadeNome,
            category: "estacionario",
            usesGps: false,
            usesDistance: false,
            metValue: 5.0 // Fallback MET
          },
        );
      }

      if (Array.isArray(cached.gpsPoints)) {
        setGpsPoints(cached.gpsPoints);
      }
      if (typeof cached.distanceKm === "number") {
        setDistanceKm(cached.distanceKm);
      }
      if (typeof cached.restSeconds !== "undefined") {
        setRestSeconds(cached.restSeconds);
      }
      if (typeof cached.isStationaryPaused === "boolean") {
        setIsStationaryPaused(cached.isStationaryPaused);
      }
      if (typeof cached.stationaryTimeSeconds === "number") {
        stationaryTimeRef.current = cached.stationaryTimeSeconds;
      }

      if (cached.status === "running") {
        setIsRunning(true);
      }

      if (cached.status === "finished_not_saved") {
        setShowSummary(true);
        setHasPendingFinalization(true);

        (async () => {
          // Se estiver offline, mantemos o cache local e não tentamos escrever no Supabase.
          if (!navigator.onLine) {
            console.log("[AlunoAtividade] Offline: mantendo finalização pendente no cache local");
            return;
          }

          try {
            await (supabase as any)
              .from("atividade_sessao")
              .update({
                status: "finalizada",
                finalizado_em: new Date().toISOString(),
                bpm_medio: cached.bpm ?? null,
                calorias_estimadas: Math.round(cached.calories ?? 0),
                confirmado: true,
              })
              .eq("id", cached.sessionId);

            window.localStorage.removeItem(key);
            setHasPendingFinalization(false);
          } catch (error) {
            console.error("Falha ao finalizar sessão a partir do cache", error);
          }
        })();
      }
    } catch (error) {
      console.error("Erro ao restaurar progresso da atividade", error);
    }
  }, [user, sessaoIdInicial, sessionId]);

  useEffect(() => {
    let interval: number | undefined;

    if (isRunning) {
      interval = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);

        // Métricas que dependem de deslocamento real só evoluem quando movementState === 'moving'
        if (movementState === "moving" || selectedActivityType?.category === "estacionario") {
          // HEART RATE: Prioriza Wearable (BLE), se não usa simulação
          if (isBleConnected && bleHeartRate) {
            setBpm(bleHeartRate);
          } else {
            setBpm((prev) => {
              const variation = Math.round((Math.random() - 0.5) * 6);
              const next = Math.min(180, Math.max(60, prev + variation));
              return next;
            });
          }

          // CALORIES: MET * Weight * Time (Scientific Formula)
          // formula: (MET * weight * 3.5) / 200 = calories/minute
          // for simplicity with seconds: (MET * weight * 3.5) / 12000 = calories/second
          const weight = profile?.peso_kg || 75; // Default 75kg
          const met = selectedActivityType?.metValue || 5.0;
          const caloriesPerSecond = (met * weight * 3.5) / 12000;

          setCalories((prev) => prev + caloriesPerSecond);

          setIntensity(() => {
            if (bpm > 150) return "Alta";
            if (bpm > 120) return "Moderada";
            return "Leve";
          });
        }
      }, 1000);
    }

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [isRunning, bpm, movementState, selectedActivityType, profile, isBleConnected, bleHeartRate]);

  // Coleta de GPS em tempo real (somente para atividades com GPS)
  useEffect(() => {
    if (!selectedActivityType?.usesGps) {
      return;
    }

    if (!("geolocation" in navigator)) {
      console.warn("Geolocalização não é suportada neste dispositivo/navegador.");
      return;
    }

    if (!isRunning) {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }

      // Reset tracker when stopping to avoid carrying anchors across sessions.
      trackerRef.current = null;

      // Reset distance anchors when stopping to avoid large jumps on resume.
      lastDistancePointRef.current = null;
      lastDistanceSeenAtRef.current = null;

      // Reset confirmation state when stopping.
      acceptedCountRef.current = 0;
      rejectedCountRef.current = 0;
      return;
    }

    trackerRef.current = new LocationTracker({
      mode,
      ...movementParams.trackerOverrides,
    });

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        const rawPoint: LocationPoint = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? Number.POSITIVE_INFINITY,
          timestamp: position.timestamp,
          // PWA: ignore coords.speed entirely (unreliable on Chrome/webviews)
          speed: null,
        };

        const tracker = trackerRef.current;
        if (!tracker) return;

        const result = tracker.ingest(rawPoint);
        if (gpsDebugEnabled) setGpsDebug(result);

        // =====================
        // Distance accumulation (PHYSICAL RULE)
        // =====================
        // Must not depend on movementState, speed, or confirmation.
        // Rule: accumulate when accuracy<=50m, Δd>=2m, Δt>=1s.
        const nowSeenAt = Date.now();
        const prevSeenAt = lastDistanceSeenAtRef.current;
        const deltaTimeSeconds = prevSeenAt ? (nowSeenAt - prevSeenAt) / 1000 : 0;
        lastDistanceSeenAtRef.current = nowSeenAt;

        const currentAcc = rawPoint.accuracy;
        const prevGood = lastDistancePointRef.current;

        let deltaDistMeters = 0;
        if (prevGood) {
          deltaDistMeters = haversineMeters({ lat: prevGood.lat, lng: prevGood.lng }, { lat: rawPoint.lat, lng: rawPoint.lng });
        }

        const canAccumulate =
          !result.isStationary &&
          currentAcc <= 50 &&
          prevGood !== null &&
          prevGood.accuracy <= 50 &&
          Number.isFinite(deltaDistMeters) &&
          deltaDistMeters >= 2 &&
          Number.isFinite(deltaTimeSeconds) &&
          deltaTimeSeconds >= 1;

        if (gpsDebugEnabled) {
          setGpsPhysicsDebug({
            accuracy: currentAcc,
            deltaDistMeters: Number.isFinite(deltaDistMeters) ? deltaDistMeters : 0,
            deltaTimeSeconds: Number.isFinite(deltaTimeSeconds) ? deltaTimeSeconds : 0,
            accepted: canAccumulate,
          });
        }

        if (canAccumulate) {
          const deltaKm = deltaDistMeters / 1000;
          setDistanceKm((current) => current + deltaKm);

          // Update sliding window (30 seconds approx)
          setPaceWindow((prev) => {
            const next = [...prev, { dist: deltaKm, time: deltaTimeSeconds }];
            // Keep roughly 30s of window
            while (next.length > 0 && next.reduce((acc, p) => acc + p.time, 0) > 30) {
              next.shift();
            }
            return next;
          });

          // Route points used for saving summary; store only when we truly accumulated distance.
          setGpsPoints((prev) => [
            ...prev,
            {
              lat: rawPoint.lat,
              lng: rawPoint.lng,
              accuracy: rawPoint.accuracy,
              timestamp: rawPoint.timestamp,
              speed: null,
            },
          ]);
        }

        // Update the distance anchor only when we have a good accuracy sample.
        if (currentAcc <= 50) {
          lastDistancePointRef.current = { lat: rawPoint.lat, lng: rawPoint.lng, accuracy: currentAcc };
        }

        // Estado único de movimento derivado do LocationTracker, com confirmação por contagem de pontos.
        const currentMovementState = movementStateRef.current;
        let nextMovementState: MovementState = currentMovementState;

        if (result.reason === "weak_signal_accuracy") {
          acceptedCountRef.current = 0;
          rejectedCountRef.current = 0;
          nextMovementState = "signal_weak";
        } else if (result.accepted) {
          acceptedCountRef.current += 1;
          rejectedCountRef.current = 0;

          if (acceptedCountRef.current >= movementParams.minAcceptedPointsToMove) {
            nextMovementState = "moving";
          }
        } else {
          // Any non-accepted point (except weak signal handled above) counts towards "stop" confirmation.
          rejectedCountRef.current += 1;
          acceptedCountRef.current = 0;

          if (rejectedCountRef.current >= movementParams.minRejectedPointsToStop) {
            nextMovementState = "stationary";
          }
        }

        if (nextMovementState !== currentMovementState) {
          movementStateRef.current = nextMovementState;
          setMovementState(nextMovementState);
        }

        // Weak signal / anti-jump should not force pause. We only mark paused once state is confirmed stationary.
        // (Distance accumulation is now independent and handled above.)
        if (nextMovementState === "moving") {
          stationaryTimeRef.current = 0;
          setIsStationaryPaused(false);
        } else if (nextMovementState === "stationary") {
          setIsStationaryPaused(true);
        }
      },
      (error) => {
        console.error("Erro ao obter localização em tempo real", error);
        // Mensagem amigável em caso de erro/permissão negada, sem quebrar o treino
        if (error.code === error.PERMISSION_DENIED) {
          toast({
            title: "Localização desativada",
            description: "Não foi possível acessar o GPS. Sua atividade continuará normalmente sem distância automática.",
            variant: "destructive",
          });
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      },
    );

    gpsWatchIdRef.current = watchId;

    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }

      trackerRef.current = null;
    };
  }, [isRunning, selectedActivityType?.usesGps, mode, movementParams, gpsDebugEnabled, toast]);

  // Persiste o progresso da sessão em tempo real (inclui dados para recuperação perfeita após refresh)
  useEffect(() => {
    if (!user || !sessionId) return;
    if (typeof window === "undefined") return;

    const key = getActivityStorageKey(user.id, sessionId);

    const status: ActivityCache["status"] = isRunning
      ? "running"
      : !isRunning && showSummary && elapsedSeconds > 0
        ? "finished_not_saved"
        : "idle";

    const payload: ActivityCache = {
      userId: user.id,
      sessionId,
      atividadeNome: selectedActivity,
      activityTypeId: selectedActivityType?.id,
      elapsedSeconds,
      bpm,
      calories,
      intensity,
      status,
      lastTickAt: Date.now(),
      updatedAt: new Date().toISOString(),
      gpsPoints,
      distanceKm,
      restSeconds,
      isStationaryPaused,
      stationaryTimeSeconds: stationaryTimeRef.current,
      movementState,
    };

    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.error("Falha ao salvar progresso da atividade no cache", error);
    }
  }, [
    user,
    sessionId,
    selectedActivity,
    selectedActivityType?.id,
    elapsedSeconds,
    bpm,
    calories,
    intensity,
    isRunning,
    showSummary,
    gpsPoints,
    distanceKm,
    restSeconds,
    isStationaryPaused,
    movementState,
  ]);

  // Alerta de confirmação ao tentar sair com dados não salvos
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingFinalization) return;
      event.preventDefault();
      event.returnValue = "Você tem dados não salvos";
      return "Você tem dados não salvos";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasPendingFinalization]);

  useEffect(() => {
    if (restSeconds === null) return;

    if (restSeconds === 0) {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }

      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.4);
        }
      } catch (e) {
        console.warn("Falha ao tocar alerta sonoro de descanso", e);
      }

      setRestFinished(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setRestSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [restSeconds]);

  const handleStartStop = async () => {
    if (!user || !sessionId) return;

    if (isRunning) {
      setIsRunning(false);
      setShowSummary(true);
      setHasPendingFinalization(true);
    } else {
      setIsRunning(true);
      setHasPendingFinalization(false);
      toast({ title: "Monitorando", description: "A IA Nexfit está acompanhando sua sessão em tempo real." });
    }
  };

  const handleSave = async () => {
    if (!user || !sessionId) {
      toast({
        title: "Sessão não encontrada",
        description: "Finalize uma atividade antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    // Bloqueia clique duplo (state + ref síncrona)
    if (saveOnceRef.current || isSaving) return;
    saveOnceRef.current = true;
    setIsSaving(true);

    try {
      // A partir de agora, o registro definitivo da atividade (atividade_sessao)
      // é feito apenas na etapa de personalização/"Finalizar".
      // Aqui apenas encaminhamos o usuário com todos os dados necessários.
      navigate("/aluno/atividade-personalizar", {
        replace: false,
        state: {
          sessaoId: sessionId,
          atividadeNome: selectedActivity,
          elapsedSeconds,
          bpmMedio: bpm,
          caloriasEstimadas: calories,
          activityType: selectedActivityType || undefined,
          intensidade: intensity,
          // Dados de GPS (apenas para atividades com GPS ativo)
          distanceKm: usesGps ? distanceKm : undefined,
          paceAvg: paceMinutesPerKm ?? undefined,
          gpsRoute: usesGps && gpsPoints.length > 0 ? gpsPoints : undefined,
          // Dados de personalização já existentes (se houver)
          caption: stateData?.caption,
          generatedUrl: stateData?.generatedUrl,
        },
      });
    } finally {
      // Em caso de navegação, o componente desmonta. Se não desmontar (falha rara), reabilita.
      setIsSaving(false);
      saveOnceRef.current = false;
    }
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  // Categoria da atividade para definir quais métricas exibir no resumo
  const activityCategory = selectedActivityType?.category;
  const isDeslocamento = activityCategory === "deslocamento";
  const isEstacionario = activityCategory === "estacionario";

  // Indica se a atividade atual utiliza GPS para cálculo automático de distância
  const usesGps = selectedActivityType?.usesGps === true && !isEstacionario;

  // Calcula o ritmo médio (pace) em min/km com base na distância de GPS,
  // mas apenas quando há movimento real (evita pace variando parado/sinal fraco)
  // PWA rule: show pace only after a minimum distance per modality.
  // CALCULA PACE USANDO JANELA DESLIZANTE PARA MAIOR PRECISÃO INSTANTÂNEA
  const paceMinutesPerKm = useMemo(() => {
    if (!usesGps || movementState !== "moving" || isStationaryPaused) return null;

    // We need at least some samples for instability
    if (paceWindow.length < 3) return null;

    const totalDistWindow = paceWindow.reduce((acc, p) => acc + p.dist, 0);
    const totalTimeWindow = paceWindow.reduce((acc, p) => acc + p.time, 0);

    if (totalDistWindow < 0.005) return null; // 5 meters minimum to compute pace

    return (totalTimeWindow / 60) / totalDistWindow;
  }, [paceWindow, usesGps, movementState, isStationaryPaused]);

  const formatPace = (pace: number | null) => {
    if (!pace || !Number.isFinite(pace)) return "--";

    const totalSecondsPerKm = pace * 60;
    const minutes = Math.floor(totalSecondsPerKm / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.round(totalSecondsPerKm % 60)
      .toString()
      .padStart(2, "0");

    return `${minutes}:${seconds} /km`;
  };
  return (
    <main className="safe-bottom-main flex min-h-screen flex-col bg-background px-4 pb-24 pt-6">
      <section className="flex flex-1 flex-col gap-8 animate-fade-in">
        {hasPendingFinalization && (
          <div className="rounded-[24px] border border-accent/20 bg-accent/5 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-1">
              <Info className="h-4 w-4 text-accent" />
              <p className="text-xs font-black text-foreground uppercase tracking-tight">Finalização Pendente</p>
            </div>
            <p className="text-[10px] font-medium text-muted-foreground/80 leading-relaxed uppercase tracking-widest">
              Sua sessão foi pausada. Toque em "Salvar" para registrar seus resultados permanentemente.
            </p>
          </div>
        )}

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackIconButton to="/aluno/dashboard" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Monitoramento Ativo</p>
              <h1 className="page-title-gradient text-2xl font-black tracking-tight uppercase leading-none">{selectedActivity}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-[10px] font-black uppercase tracking-widest">
                Offline
              </Badge>
            )}

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
              <Activity className={cn("h-5 w-5", isRunning && "animate-pulse")} />
            </div>
          </div>
        </header>

        {/* Immersive Timer Circle */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative group">
            {/* Animated Rings */}
            <div className={cn(
              "absolute inset-[-20px] rounded-full border border-primary/5 transition-all duration-1000",
              isRunning ? "scale-110 opacity-100 blur-[2px]" : "scale-100 opacity-0"
            )} />
            <div className={cn(
              "absolute inset-[-40px] rounded-full border border-primary/5 transition-all duration-[2000ms] delay-500",
              isRunning ? "scale-125 opacity-100 blur-[4px]" : "scale-100 opacity-0"
            )} />

            <div className="relative flex h-56 w-56 items-center justify-center rounded-full border border-white/5 bg-gradient-to-b from-white/[0.08] to-transparent shadow-2xl backdrop-blur-2xl">
              <div className="absolute inset-4 rounded-full border border-primary/10" />
              <div className="absolute inset-8 rounded-full border border-white/5 opacity-50" />

              <div className="text-center space-y-1">
                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-primary/40">Duração</p>
                <span className="text-5xl font-black tabular-nums text-foreground tracking-tighter">
                  {formatTime(elapsedSeconds)}
                </span>
                <div className="pt-2">
                  <span className={cn(
                    "inline-block h-1 w-1 rounded-full",
                    isRunning ? "bg-primary animate-ping" : "bg-muted-foreground/20"
                  )} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* High Performance Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="group relative overflow-hidden rounded-[28px] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-xl">
            <Activity className="absolute -right-2 -top-2 h-12 w-12 text-primary/5" />
            <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1">Batimento</p>
            <div className="flex items-baseline gap-1">
              <p className="text-xl font-black text-foreground tabular-nums">{bpm}</p>
              <span className="text-[9px] font-bold text-muted-foreground uppercase">bpm</span>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-[28px] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-xl">
            <Flame className="absolute -right-2 -top-2 h-12 w-12 text-orange-500/5" />
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-500/60 mb-1">Energia</p>
            <div className="flex items-baseline gap-1">
              <p className="text-xl font-black text-foreground tabular-nums">{Math.round(calories)}</p>
              <span className="text-[9px] font-bold text-muted-foreground uppercase">kcal</span>
            </div>
          </div>

          <div className={cn(
            "group relative overflow-hidden rounded-[28px] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-xl transition-opacity",
            !usesGps && "opacity-30"
          )}>
            <Navigation2 className="absolute -right-2 -top-2 h-12 w-12 text-blue-500/5" />
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-500/60 mb-1">Distância</p>
            <div className="flex items-baseline gap-1">
              <p className="text-xl font-black text-foreground tabular-nums">{distanceKm.toFixed(2)}</p>
              <span className="text-[9px] font-bold text-muted-foreground uppercase">km</span>
            </div>
          </div>

          <div className={cn(
            "group relative overflow-hidden rounded-[28px] border border-white/5 bg-white/[0.03] p-5 backdrop-blur-xl transition-opacity",
            !usesGps && "opacity-30"
          )}>
            <Zap className="absolute -right-2 -top-2 h-12 w-12 text-emerald-500/5" />
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 mb-1">Ritmo</p>
            <p className="text-xl font-black text-emerald-400 tabular-nums uppercase tracking-tighter leading-none">
              {formatPace(paceMinutesPerKm)}
            </p>
          </div>
        </div>
        {/* Rest Display if Active */}
        {restSeconds !== null && (
          <div className="relative mt-2 overflow-hidden rounded-[32px] border border-primary/20 bg-primary/5 p-6 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Recuperação</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black tabular-nums text-foreground">{String(restSeconds).padStart(2, "0")}</span>
                  <span className="text-sm font-bold text-muted-foreground">segundos</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-black">
                <Timer className="h-6 w-6" />
              </div>
            </div>
            {restFinished && (
              <div className="mt-4 animate-bounce text-center text-xs font-black text-primary uppercase tracking-widest">
                Próxima série agora! 🚀
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={isRunning ? "outline-premium" : "premium"}
              size="lg"
              className="py-10 rounded-3xl"
              onClick={handleStartStop}
            >
              {isRunning ? <Pause className="mr-2 h-6 w-6" /> : <Play className="mr-2 h-6 w-6" />}
              <span className="text-sm uppercase tracking-widest font-black leading-none">{isRunning ? "Pausar" : "Retomar"}</span>
            </Button>

            <Button
              variant="outline-premium"
              size="lg"
              className="py-10 rounded-3xl"
              onClick={() => {
                setRestFinished(false);
                setRestSeconds(60);
              }}
            >
              <Timer className="mr-2 h-6 w-6" />
              <span className="text-sm uppercase tracking-widest font-black leading-none">Descanso</span>
            </Button>
          </div>

          {!isRunning && elapsedSeconds > 0 && (
            <Button
              variant="premium"
              className="py-10 rounded-3xl shadow-xl shadow-primary/20"
              onClick={handleSave}
              loading={isSaving}
            >
              <Zap className="mr-2 h-6 w-6" />
              <span className="text-sm uppercase tracking-widest font-black leading-none">Salvar e Finalizar</span>
            </Button>
          )}

          <Button
            variant="ghost"
            className="w-full text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground py-6"
            onClick={() => navigate("/aluno/dashboard")}
          >
            Sair do Tracker
          </Button>
        </div>
      </section>

      {gpsDebugEnabled && gpsDebug && (
        <div className="fixed bottom-2 right-2 z-50 max-w-[92vw] rounded-[20px] border border-white/10 bg-black/80 p-4 text-[9px] text-muted-foreground shadow-2xl backdrop-blur-xl">
          <div className="font-black text-primary uppercase tracking-widest mb-1">GPS Diagnostic</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>MODE: {movementParams.mode}</div>
            <div>STATUS: {movementState}</div>
            <div>ACC: {Math.round(gpsPhysicsDebug?.accuracy ?? gpsDebug.point.accuracy)}m</div>
            <div>DIST: {distanceKm.toFixed(3)}km</div>
          </div>
        </div>
      )}
      <FloatingNavIsland />
    </main>
  );
};

export default AlunoAtividadePage;
