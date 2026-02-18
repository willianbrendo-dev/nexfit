
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    Users,
    CreditCard,
    Store,
    Stethoscope,
    Brain,
    Bell,
    Settings,
    LogOut,
    Dumbbell,
    Menu,
} from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

export const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/auth");
    };

    const navItems = [
        { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
        { label: "Usuários", icon: Users, path: "/admin/users" },
        { label: "Faturamento", icon: CreditCard, path: "/admin/financial" },
        { label: "Marketplace", icon: Store, path: "/admin/stores" },
        { label: "Telemedicina", icon: Stethoscope, path: "/admin/telemedicina" },
        { label: "Precificação", icon: CreditCard, path: "/admin/pricing" },
        { label: "Conteúdo & IA", icon: Brain, path: "/admin/content" },
        { label: "Exercícios", icon: Dumbbell, path: "/admin/exercises" },
        { label: "Notificações", icon: Bell, path: "/admin/notifications" },
        { label: "Configurações", icon: Settings, path: "/admin/settings" },
    ];

    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full bg-[#09090b]">
                <Sidebar collapsible="icon" className="border-r border-white/5 bg-[#09090b]/50 backdrop-blur-xl">
                    <SidebarHeader className="border-b border-white/5 pb-4 pt-4">
                        <div className="flex items-center gap-2 px-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                                <span className="text-lg font-bold">NX</span>
                            </div>
                            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    Admin
                                </span>
                                <span className="text-sm font-bold text-white">Nexfit Console</span>
                            </div>
                        </div>
                    </SidebarHeader>

                    <SidebarContent className="px-2 pt-4">
                        <SidebarMenu className="gap-1">
                            {navItems.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <SidebarMenuItem key={item.path}>
                                        <SidebarMenuButton
                                            onClick={() => navigate(item.path)}
                                            isActive={isActive}
                                            className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300
                      ${isActive
                                                    ? "bg-green-500/10 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                                                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                                                }`}
                                        >
                                            <item.icon className={`h-5 w-5 ${isActive ? "text-green-400" : "text-muted-foreground group-hover:text-white"}`} />
                                            <span className="font-medium group-data-[collapsible=icon]:hidden">
                                                {item.label}
                                            </span>
                                            {isActive && (
                                                <div className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-green-500 shadow-[0_0_8px_rgb(34,197,94)]" />
                                            )}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarContent>

                    <SidebarFooter className="border-t border-white/5 p-4">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                                >
                                    <LogOut className="h-5 w-5" />
                                    <span className="font-medium group-data-[collapsible=icon]:hidden">
                                        Sair
                                    </span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarFooter>
                </Sidebar>

                <main className="flex-1 overflow-y-auto bg-gradient-to-br from-black via-[#09090b] to-[#1a1a1a]">
                    {/* Premium Header with Hamburger Menu */}
                    <div className="sticky top-0 z-10 border-b border-white/5 bg-black/40 backdrop-blur-xl">
                        <div className="container mx-auto flex items-center gap-4 px-4 py-3 md:px-8">
                            <SidebarTrigger className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-green-400 transition-all duration-300 hover:border-green-500/50 hover:shadow-[0_0_10px_rgba(34,197,94,0.2)] flex items-center justify-center" />

                            <div className="flex-1">
                                <h2 className="text-sm font-semibold text-white/80">
                                    {navItems.find(item => item.path === location.pathname)?.label || "Admin Console"}
                                </h2>
                            </div>
                        </div>
                    </div>

                    <div className="container mx-auto p-4 md:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </SidebarProvider>
    );
};
