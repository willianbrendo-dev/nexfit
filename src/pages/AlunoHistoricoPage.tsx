import { useEffect, useMemo, useState } from "react";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import { Activity, Calendar as CalendarIcon, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVITY_TYPES, getActivityTypeById } from "@/lib/activityTypes";
import { formatDistanceKm } from "@/lib/formatters";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { withSchemaCacheRetry } from "@/lib/supabaseResilience";

type HistoricoItem = {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  distance_km: number | null;
  calories: number | null;
  extras?: any | null;
  legacy_source?: "workout_history" | "atividade_sessao" | "workout_sessions";
};

const formatDuration = (durationSeconds: number | null, startedAt?: string, endedAt?: string | null) => {
  let seconds = durationSeconds ?? null;

  if (seconds == null && startedAt && endedAt) {
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      seconds = Math.round((end - start) / 1000);
    }
  }

  if (!seconds || seconds <= 0) return "—";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h${m ? ` ${m} min` : ""}`;
};

const PAGE_SIZE = 20;

const AlunoHistoricoPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const defaultStart = useMemo(() => startOfDay(subDays(new Date(), 7)), []);
  const defaultEnd = useMemo(() => endOfDay(new Date()), []);

  const [atividades, setAtividades] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  // Filtros
  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(defaultEnd);
  const [activityType, setActivityType] = useState<string>("all");
  const [privacy, setPrivacy] = useState<string>("all");

  const dateLabel = useMemo(() => {
    const start = format(startDate, "dd/MM/yyyy", { locale: ptBR });
    const end = format(endDate, "dd/MM/yyyy", { locale: ptBR });
    return `${start} → ${end}`;
  }, [startDate, endDate]);

  const buildWorkoutHistoryQuery = () => {
    if (!user) return null;

    // Nota: por performance, NÃO buscamos gps_points na lista.
    let q = (supabase as any)
      .from("workout_history")
      .select("id, activity_type, started_at, ended_at, duration_seconds, distance_km, calories, extras")
      .eq("user_id", user.id)
      .gte("started_at", startOfDay(startDate).toISOString())
      .lte("started_at", endOfDay(endDate).toISOString());

    if (activityType !== "all") q = q.eq("activity_type", activityType);
    if (privacy !== "all") q = q.eq("privacy", privacy);

    return q.order("started_at", { ascending: false });
  };

  const fetchPage = async (nextPage: number) => {
    const q = buildWorkoutHistoryQuery();
    if (!q) return { items: [] as HistoricoItem[], hasMore: false };

    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const resp = await withSchemaCacheRetry<{ data: any[] | null }>(
        () => (q as any).range(from, to).throwOnError(),
        { label: `historico:workout_history:p${nextPage}` },
      );

      const data = (resp as any)?.data as any[] | null | undefined;

      const rows = ((data as any[] | null) ?? []).map((row) => ({
        id: row.id,
        activity_type: row.activity_type,
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_seconds: row.duration_seconds ?? null,
        distance_km: row.distance_km ?? null,
        calories: row.calories ?? null,
        extras: row.extras ?? null,
        legacy_source: "workout_history" as const,
      })) as HistoricoItem[];

      // Heurística simples: se veio página cheia, provavelmente ainda tem mais
      return { items: rows, hasMore: rows.length === PAGE_SIZE };
    } catch (error) {
      console.error("Erro ao carregar histórico (workout_history)", {
        error,
        filters: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), activityType, privacy },
        page: nextPage,
        range: { from, to },
      });
      return { items: [] as HistoricoItem[], hasMore: false };
    }

  };

  const resetAndFetch = async () => {
    if (!user) return;
    setLoading(true);
    setPage(0);

    // Primário: workout_history com filtros + paginação
    const first = await fetchPage(0);

    // Fallback legado (apenas se NÃO houver dados no período e filtros estiverem no padrão)
    // Mantemos simples para não reintroduzir lentidão.
    if (!first.items.length && activityType === "all" && privacy === "all") {
      const startIso = startOfDay(startDate).toISOString();
      const endIso = endOfDay(endDate).toISOString();

      const [cardioResp, muscuResp] = await Promise.all([
        (supabase as any)
          .from("atividade_sessao")
          .select("id, tipo_atividade, status, iniciado_em, finalizado_em, distance_km, calorias_estimadas")
          .eq("user_id", user.id)
          .eq("status", "finalizada")
          .gte("iniciado_em", startIso)
          .lte("iniciado_em", endIso)
          .order("finalizado_em", { ascending: false }),
        (supabase as any)
          .from("workout_sessions")
          .select("id, status, iniciado_em, finalizado_em, exercise_name, calorias_estimadas")
          .eq("user_id", user.id)
          .eq("status", "finalizada")
          .gte("iniciado_em", startIso)
          .lte("iniciado_em", endIso)
          .order("finalizado_em", { ascending: false }),
      ]);

      if (cardioResp.error) console.error("Erro ao carregar histórico legado (atividade_sessao)", cardioResp.error);
      if (muscuResp.error) console.error("Erro ao carregar histórico legado (workout_sessions)", muscuResp.error);

      const cardioData = (cardioResp.data as any[] | null) ?? [];
      const muscuData = (muscuResp.data as any[] | null) ?? [];

      const fallbackItems: HistoricoItem[] = [
        ...cardioData.map((row) => ({
          id: row.id,
          activity_type: row.tipo_atividade,
          started_at: row.iniciado_em,
          ended_at: row.finalizado_em,
          duration_seconds: null,
          distance_km: row.distance_km,
          calories: row.calorias_estimadas ?? null,
          extras: null,
          legacy_source: "atividade_sessao" as const,
        })),
        ...muscuData.map((row) => ({
          id: row.id,
          activity_type: "musculacao",
          started_at: row.iniciado_em,
          ended_at: row.finalizado_em,
          duration_seconds: null,
          distance_km: null,
          calories: row.calorias_estimadas ?? null,
          extras: null,
          legacy_source: "workout_sessions" as const,
        })),
      ].sort((a, b) => {
        const aDate = new Date(a.ended_at || a.started_at || 0).getTime();
        const bDate = new Date(b.ended_at || b.started_at || 0).getTime();
        return bDate - aDate;
      });

      setAtividades(fallbackItems);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setAtividades(first.items);
    setHasMore(first.hasMore);
    setLoading(false);
  };

  useEffect(() => {
    void resetAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, startDate, endDate, activityType, privacy]);

  const handleLoadMore = async () => {
    if (loadingMore || loading || !hasMore) return;
    const nextPage = page + 1;

    setLoadingMore(true);
    const next = await fetchPage(nextPage);
    setAtividades((prev) => [...prev, ...next.items]);
    setPage(nextPage);
    setHasMore(next.hasMore);
    setLoadingMore(false);
  };

  const clearFilters = () => {
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
    setActivityType("all");
    setPrivacy("all");
  };

  return (
    <main className="safe-bottom-main flex min-h-screen flex-col bg-background px-4 pt-6 pb-32">
      <header className="mb-6 flex items-center gap-3">
        <BackIconButton to="/aluno/perfil" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black text-primary/80">Área do Aluno</p>
          <h1 className="mt-1 page-title-gradient text-2xl font-black uppercase italic tracking-tighter">Seu Histórico</h1>
        </div>
      </header>

      <section className="space-y-4">
        {/* Filtros Container */}
        <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-primary">
                <Filter className="h-4 w-4" />
              </div>
              <p className="text-xs font-black uppercase tracking-wider text-white">Filtros</p>
            </div>
            {(activityType !== "all" || privacy !== "all" || startDate.getTime() !== defaultStart.getTime()) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 px-3 text-[10px] font-bold uppercase text-muted-foreground hover:bg-white/10 hover:text-white rounded-lg"
              >
                Limpar
              </Button>
            )}
          </div>

          <Separator className="bg-white/5 mb-4" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="justify-start gap-2 text-left h-11 rounded-xl border-white/10 bg-black/20 hover:bg-white/5 hover:text-white border-transparent">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="truncate text-xs font-medium text-zinc-300">{dateLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 border-white/10 bg-zinc-950 text-white" align="start">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-zinc-500">Data início</p>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(startOfDay(d))}
                    initialFocus
                    className="rounded-md border border-white/5 bg-black/50"
                  />
                  <Separator className="bg-white/10" />
                  <p className="text-xs font-bold uppercase text-zinc-500">Data fim</p>
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => d && setEndDate(endOfDay(d))}
                    className="rounded-md border border-white/5 bg-black/50"
                  />
                </div>
              </PopoverContent>
            </Popover>

            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="h-11 rounded-xl border-white/10 bg-black/20 text-xs font-medium text-zinc-300 focus:ring-primary/20">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-white">
                <SelectItem value="all">Todos os tipos</SelectItem>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={privacy} onValueChange={setPrivacy}>
              <SelectTrigger className="h-11 rounded-xl border-white/10 bg-black/20 text-xs font-medium text-zinc-300 focus:ring-primary/20">
                <SelectValue placeholder="Privacidade" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-white">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="public">Públicas</SelectItem>
                <SelectItem value="private">Privadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="flex-1 space-y-3 mt-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Atividades registradas</h2>
          <span className="text-[10px] font-bold text-zinc-600">{atividades.length} resultados</span>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-[24px] bg-white/5 border border-white/5" />
              ))}
            </div>
          ) : atividades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4 rounded-[32px] border border-dashed border-white/10 bg-white/[0.02]">
              <Activity className="h-8 w-8 text-zinc-700" />
              <p className="text-xs font-medium text-zinc-500">Nenhuma atividade encontrada.</p>
            </div>
          ) : (
            atividades.map((sessao) => {
              const tipo = getActivityTypeById(sessao.activity_type);
              const nomeAtividade = tipo?.name ?? sessao.activity_type;

              const dataBase = sessao.ended_at ?? sessao.started_at;
              const data = dataBase ? new Date(dataBase) : null;
              const dataFormatada = data
                ? format(data, "dd 'de' MMMM", { locale: ptBR })
                : "Data desconhecida";

              const horaFormatada = data ? format(data, "HH:mm", { locale: ptBR }) : "";

              const duracaoTexto = formatDuration(sessao.duration_seconds, sessao.started_at, sessao.ended_at);

              return (
                <div
                  key={sessao.id}
                  onClick={() => navigate(`/aluno/historico/${sessao.id}`)}
                  className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] active:scale-[0.98] cursor-pointer backdrop-blur-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Icon Box */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 text-primary shadow-inner">
                        <Activity className="h-5 w-5" />
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="truncate text-sm font-black text-white uppercase italic tracking-tight">
                          {nomeAtividade}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
                          <span className="text-zinc-500">{dataFormatada}</span>
                          <span className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
                          <span>{horaFormatada}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                      <span className="text-xs font-black text-white">{duracaoTexto}</span>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                        {sessao.distance_km != null && sessao.distance_km > 0 && (
                          <span>{formatDistanceKm(sessao.distance_km)}</span>
                        )}
                        {sessao.calories != null && sessao.calories > 0 && (
                          <span className="font-bold text-primary">{Math.round(sessao.calories)} kcal</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {!loading && atividades.length > 0 && (
            <div className="pt-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white h-12 rounded-2xl border border-dashed border-white/10 hover:border-white/20 hover:bg-white/5"
                disabled={!hasMore || loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? (
                  <span className="animate-pulse">Carregando...</span>
                ) : hasMore ? (
                  "Carregar mais antigas"
                ) : (
                  "Fim do histórico"
                )}
              </Button>
            </div>
          )}
        </div>
      </section>
      <FloatingNavIsland />
    </main>
  );
};

export default AlunoHistoricoPage;

