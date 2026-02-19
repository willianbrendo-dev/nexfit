import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProfessionalPlanInfo {
    subscriptionPlan: string | null;
    modules: Set<string>;
    isLoading: boolean;
    hasModule: (moduleKey: string) => boolean;
}

/**
 * Hook that checks the active plan modules for the logged-in professional.
 * Queries profiles → subscription_plan → app_access_plans (PROFISSIONAL) → plan_modules → access_modules
 */
export function useProfessionalPlanModules(): ProfessionalPlanInfo {
    const { user } = useAuth();
    const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
    const [modules, setModules] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const load = async () => {
            setIsLoading(true);
            try {
                // 1. Get the professional's subscription plan from profile
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("subscription_plan")
                    .eq("id", user.id)
                    .maybeSingle();

                if (!profile) {
                    setIsLoading(false);
                    return;
                }

                setSubscriptionPlan(profile.subscription_plan);

                const planName = profile.subscription_plan as string | null;

                // 2. Find the matching plan in app_access_plans for PROFISSIONAL
                const { data: plan } = await supabase
                    .from("app_access_plans")
                    .select(`
                        id,
                        name,
                        plan_modules (
                            module_id,
                            access_modules (key)
                        )
                    `)
                    .eq("user_type", "PROFISSIONAL")
                    .eq("is_active", true)
                    .ilike("name", planName || 'FREE')
                    .maybeSingle();

                if (plan) {
                    const moduleKeys = (plan as any).plan_modules
                        ?.map((pm: any) => pm.access_modules?.key)
                        .filter(Boolean) as string[];
                    setModules(new Set(moduleKeys || []));
                } else {
                    // Check if ANY plans exist for PROFISSIONAL. If zero, grant all as fallback (Setup Mode)
                    const { count } = await supabase
                        .from("app_access_plans")
                        .select("id", { count: 'exact', head: true })
                        .eq("user_type", "PROFISSIONAL")
                        .eq("is_active", true);

                    if (count === 0) {
                        // Grant all common modules
                        setModules(new Set(['treinos', 'nutricao', 'telemedicina', 'marketplace', 'agenda', 'chat', 'financeiro', 'loja', 'estoque', 'relatorios']));
                    } else {
                        // If plans exist but none match (e.g. user on FREE but no FREE plan in DB), 
                        // we follow the plan config if it exists or default to empty.
                        setModules(new Set());
                    }
                }
            } catch (error) {
                console.error("[useProfessionalPlanModules] Error loading plan modules:", error);
            } finally {
                setIsLoading(false);
            }
        };

        void load();
    }, [user]);

    const hasModule = (moduleKey: string): boolean => {
        // Master override
        if (user?.email === "contatomaydsonsv@gmail.com") return true;
        return modules.has(moduleKey);
    };

    return { subscriptionPlan, modules, isLoading, hasModule };
}
