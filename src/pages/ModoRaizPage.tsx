import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Skull,
  Pencil,
  Trash2,
  Eye,
  Dumbbell,
  Lock,
  Zap,
  Calendar,
  ChevronRight,
  Flame,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackIconButton } from "@/components/navigation/BackIconButton";
import { FloatingNavIsland } from "@/components/navigation/FloatingNavIsland";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ManualRoutine = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  days: any[];
  created_at: string;
  updated_at: string;
};

const MUSCLE_COLORS: Record<string, string> = {
  Peito: "bg-red-500/20 text-red-400 border-red-500/30",
  Costas: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Ombros: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Bíceps: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Tríceps: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Pernas: "bg-green-500/20 text-green-400 border-green-500/30",
  Glúteos: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  Abdômen: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Cardio: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  Outro: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function getMuscleGroupsFromDays(days: any[]): string[] {
  const groups = new Set<string>();
  for (const day of days ?? []) {
    for (const ex of day.exercises ?? []) {
      if (ex.muscle_group) groups.add(ex.muscle_group);
    }
  }
  return Array.from(groups).slice(0, 4);
}

function getTotalExercises(days: any[]): number {
  return (days ?? []).reduce((acc, d) => acc + (d.exercises?.length ?? 0), 0);
}

export default function ModoRaizPage() {
  const { user } = useAuth();
  const { plan } = useUserPlan();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isFree = plan === "FREE";

  const { data: routines = [], isLoading } = useQuery({
    queryKey: ["manual_routines", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_routines" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ManualRoutine[];
    },
    enabled: !!user && !isFree,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("manual_routines" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual_routines"] });
      toast({ title: "Rotina excluída com sucesso." });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir rotina.", variant: "destructive" });
    },
  });

  if (isFree) {
    return (
      <div className="min-h-screen bg-black pb-28">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-black/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <BackIconButton to="/aluno/dashboard" />
            <Skull className="h-5 w-5 text-primary" />
            <h1 className="text-base font-black uppercase tracking-tight text-white italic">Modo Raiz</h1>
          </div>
        </header>

        <main className="mx-auto max-w-lg px-4 pt-20 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
              <div className="relative rounded-full border border-primary/20 bg-primary/10 p-8">
                <Lock className="h-12 w-12 text-primary" />
              </div>
            </div>
          </div>
          <h2 className="mb-2 text-2xl font-black uppercase italic text-white">Recurso Premium</h2>
          <p className="mb-8 text-sm text-zinc-400 leading-relaxed">
            O Modo Raiz é exclusivo para membros <span className="font-bold text-white">Advance</span> e{" "}
            <span className="font-bold text-white">Elite</span>. Monte treinos do zero com total liberdade.
          </p>
          <Button
            className="w-full bg-primary text-black font-black uppercase italic h-12 rounded-2xl hover:bg-primary/90"
            onClick={() => navigate("/aluno/planos")}
          >
            Ver Planos de Assinatura
          </Button>
        </main>

        <FloatingNavIsland />
      </div>
    );
  }

  const totalExercises = routines.reduce((acc, r) => acc + getTotalExercises(r.days), 0);

  return (
    <div className="min-h-screen bg-black pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <BackIconButton to="/aluno/dashboard" />
          <Skull className="h-5 w-5 text-primary" />
          <h1 className="flex-1 text-base font-black uppercase tracking-tight text-white italic">Modo Raiz</h1>
          <Button
            size="sm"
            className="gap-1.5 bg-primary text-black font-black uppercase text-[11px] h-8 px-3 rounded-xl hover:bg-primary/90"
            onClick={() => navigate("/aluno/modo-raiz/nova")}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-5 space-y-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-zinc-900 to-black p-5">
          <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">Treino Livre</p>
            <h2 className="text-2xl font-black uppercase italic text-white leading-tight">
              Monte seu<br />treino do zero
            </h2>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-[260px]">
              Controle total da sua rotina. Defina exercícios, séries, cargas e técnicas do seu jeito.
            </p>
          </div>
        </div>

        {/* Stats */}
        {routines.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Dumbbell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-black text-white">{routines.length}</p>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Rotinas</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Flame className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <p className="text-xl font-black text-white">{totalExercises}</p>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Exercícios</p>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/5" />
            ))}
          </div>
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative rounded-full border border-dashed border-white/10 p-8">
                <Skull className="h-10 w-10 text-zinc-600" />
              </div>
            </div>
            <div>
              <p className="font-bold text-white">Nenhuma rotina criada</p>
              <p className="text-xs text-zinc-500 mt-1">Crie sua primeira rotina manual e treine do seu jeito.</p>
            </div>
            <Button
              className="mt-2 gap-2 bg-primary text-black font-black uppercase italic h-12 px-6 rounded-2xl hover:bg-primary/90"
              onClick={() => navigate("/aluno/modo-raiz/nova")}
            >
              <Plus className="h-4 w-4" />
              Criar primeira rotina
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Suas rotinas
            </h2>
            {routines.map((r) => {
              const muscleGroups = getMuscleGroupsFromDays(r.days);
              const totalEx = getTotalExercises(r.days);
              return (
                <div
                  key={r.id}
                  className="group relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.03] backdrop-blur-md hover:border-white/10 hover:bg-white/[0.05] transition-all"
                >
                  {/* Active indicator */}
                  {r.is_active && (
                    <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-primary" />
                  )}

                  <div className="p-4 pl-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-black text-white uppercase italic tracking-tight truncate">
                            {r.name}
                          </h3>
                          {!r.is_active && (
                            <Badge className="shrink-0 text-[9px] h-4 bg-zinc-800 text-zinc-500 border-zinc-700">
                              Inativa
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {(r.days as any[])?.length ?? 0} dia{(r.days as any[])?.length !== 1 ? "s" : ""}
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {totalEx} exercício{totalEx !== 1 ? "s" : ""}
                          </span>
                          <span>
                            {format(new Date(r.updated_at), "dd/MM", { locale: ptBR })}
                          </span>
                        </div>

                        {/* Muscle group tags */}
                        {muscleGroups.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {muscleGroups.map((mg) => (
                              <span
                                key={mg}
                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${MUSCLE_COLORS[mg] ?? MUSCLE_COLORS["Outro"]}`}
                              >
                                {mg}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          className="h-8 w-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                          onClick={() => navigate(`/aluno/modo-raiz/${r.id}/editar`)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="h-8 w-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          onClick={() => setDeleteId(r.id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="h-8 w-8 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all"
                          onClick={() => navigate(`/aluno/modo-raiz/${r.id}`)}
                          aria-label="Visualizar"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-white/10 text-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase italic">Excluir rotina?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Essa ação não pode ser desfeita. A rotina será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 text-white hover:bg-red-600 font-bold"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingNavIsland />
    </div>
  );
}
