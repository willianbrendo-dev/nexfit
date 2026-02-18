import { useNavigate, useLocation } from "react-router-dom";
import { Home, MessageCircle, DollarSign, User, Lock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPlan } from "@/hooks/useUserPlan";

interface NavItem {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    path: string;
}

const navItems: NavItem[] = [
    { icon: Home, label: "Início", path: "/professional/dashboard" },
    { icon: Calendar, label: "Agenda", path: "/professional/agenda" },
    { icon: MessageCircle, label: "Chat", path: "/professional/chat" },
    { icon: DollarSign, label: "Financeiro", path: "/professional/financeiro" },
    { icon: User, label: "Perfil", path: "/professional/profile" },
];

export const ProfessionalFloatingNavIsland = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isElite, isMaster } = useUserPlan();
    const canAccessEliteFeatures = isElite || isMaster;

    const isActive = (path: string) => {
        return location.pathname === path;
    };

    return (
        <nav
            className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 pt-2"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
            <div
                className="flex w-full max-w-sm items-center justify-around rounded-xl border border-white/10 px-2 py-3"
                style={{
                    backgroundColor: "rgba(10, 13, 12, 0.98)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    boxShadow: "0px 6px 20px rgba(0, 0, 0, 0.5)",
                }}
            >
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    const isLocked = false; // Always unlocked

                    return (
                        <button
                            key={item.path}
                            type="button"
                            onClick={() => {
                                if (isLocked) {
                                    // Maybe show a toast or stay on page
                                    return;
                                }
                                navigate(item.path);
                            }}
                            className={cn(
                                "flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-1 rounded-xl px-3 transition-all duration-200",
                                active
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                isLocked && "opacity-50 grayscale"
                            )}
                            aria-label={item.label}
                            aria-current={active ? "page" : undefined}
                        >
                            <div className="relative">
                                <Icon
                                    className={cn(
                                        "h-6 w-6 transition-all duration-200",
                                        active && "drop-shadow-[0_0_8px_hsl(var(--primary))]"
                                    )}
                                />
                                {isLocked && (
                                    <Lock className="absolute -top-1 -right-1 h-3 w-3 text-zinc-500 bg-black rounded-full p-0.5" />
                                )}
                            </div>
                            <span
                                className={cn(
                                    "text-[10px] font-medium leading-none transition-all duration-200",
                                    active && "text-primary"
                                )}
                            >
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
