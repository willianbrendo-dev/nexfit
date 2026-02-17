import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Rocket, Zap, User } from "lucide-react";

type BadgeVariant = "ELITE" | "ADVANCE" | "FREE";

type GreetingCardProps = {
  name: string | null;
  avatarUrl: string | null;
  onAvatarError: () => void;
  badgeVariant?: BadgeVariant | null;
  subtitle?: string | null;
};

const badgeStyles: Record<BadgeVariant, { label: string; icon: any; color: string; bg: string; border: string; glow: string }> = {
  ELITE: {
    label: "Elite Black",
    icon: Crown,
    color: "text-amber-400",
    bg: "bg-black/60",
    border: "border-amber-500/30",
    glow: "shadow-[0_0_15px_-3px_rgba(251,191,36,0.2)]",
  },
  ADVANCE: {
    label: "Advance Pro",
    icon: Rocket,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    glow: "shadow-[0_0_15px_-3px_rgba(var(--primary),0.2)]",
  },
  FREE: {
    label: "Gratuito",
    icon: User,
    color: "text-muted-foreground",
    bg: "bg-white/5",
    border: "border-white/10",
    glow: "",
  },
};

export const GreetingCard = ({
  name,
  avatarUrl,
  onAvatarError,
  badgeVariant,
  subtitle,
}: GreetingCardProps) => {
  const badge = badgeVariant ? badgeStyles[badgeVariant] : null;

  const subtitleMaxChars = 54;
  const safeSubtitle = subtitle?.trim();
  const subtitleShort = safeSubtitle
    ? safeSubtitle.length > subtitleMaxChars
      ? `${safeSubtitle.slice(0, subtitleMaxChars - 1)}…`
      : safeSubtitle
    : null;

  return (
    <div className="relative flex h-32 items-center gap-5 overflow-hidden rounded-[32px] border border-white/5 bg-white/[0.02] p-6 backdrop-blur-3xl transition-all duration-500 hover:bg-white/[0.04] group">
      {/* Decorative background gradients */}
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-[60px] opacity-50 transition-opacity group-hover:opacity-80" />
      <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-accent/5 blur-[50px] opacity-30" />

      <div className="relative">
        <div className="relative inline-block">
          <Avatar className="h-20 w-20 border-2 border-white/10 p-1.5 bg-gradient-to-br from-white/10 to-transparent transition-transform duration-500 group-hover:scale-105">
            {avatarUrl && (
              <AvatarImage
                src={avatarUrl}
                alt={name ? `Foto de ${name}` : "Foto do usuário"}
                onError={onAvatarError}
                className="rounded-full object-cover"
              />
            )}
            <AvatarFallback className="bg-white/5 text-foreground/80 text-2xl font-black rounded-full uppercase">
              {(name?.charAt(0) ?? "?")}
            </AvatarFallback>
          </Avatar>

          {/* Floating Plan Icon (Bottom) */}
          {badgeVariant && badgeVariant !== "FREE" && badge && (
            <div className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0A0A0A] ${badge.bg} ${badge.color} shadow-lg backdrop-blur-md animate-in zoom-in duration-500`}>
              <badge.icon className="h-3.5 w-3.5 fill-current opacity-80" />
            </div>
          )}

          {/* Premium Chip (Top) */}
          {badge && badgeVariant !== "FREE" && (
            <div className={`absolute -top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full border ${badge.border} ${badge.bg} px-2 py-0.5 backdrop-blur-xl ${badge.glow} animate-in fade-in slide-in-from-bottom-2 duration-700 shadow-xl`}>
              <div className={`h-1 w-1 rounded-full ${badgeVariant === "ELITE" ? "bg-amber-400" : "bg-primary"} animate-pulse`} />
              <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${badge.color}`}>
                {badgeVariant}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden gap-1 z-10">
        {name ? (
          <span className="truncate text-xl font-black uppercase tracking-tight text-foreground drop-shadow-sm">
            {name}
          </span>
        ) : (
          <Skeleton className="h-7 w-48 bg-white/5 rounded-lg" />
        )}

        {subtitleShort && (
          <span
            className="truncate text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] transition-colors group-hover:text-muted-foreground/80"
            title={safeSubtitle ?? undefined}
          >
            {subtitleShort}
          </span>
        )}
      </div>
    </div>
  );
};
