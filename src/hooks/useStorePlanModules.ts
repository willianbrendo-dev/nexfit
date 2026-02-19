import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface StorePlanInfo {
    storeId: string | null;
    subscriptionPlan: string | null;
    modules: Set<string>;
    isLoading: boolean;
    hasModule: (moduleKey: string) => boolean;
}

/**
 * Hook that checks the active plan modules for the logged-in store owner.
 * Queries marketplace_stores → subscription_plan → app_access_plans (LOJISTA) → plan_modules → access_modules
 */
export function useStorePlanModules(): StorePlanInfo {
    const { user } = useAuth();
    const [storeId, setStoreId] = useState<string | null>(null);
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
                // 1. Get the store and its subscription plan
                const { data: store } = await (supabase as any)
                    .from("marketplace_stores")
                    .select("id, subscription_plan, nome")
                    .eq("owner_user_id", user.id)
                    .maybeSingle();

                if (!store) {
                    setIsLoading(false);
                    return;
                }

                setStoreId(store.id);
                setSubscriptionPlan(store.subscription_plan);

                const planName = store.subscription_plan as string | null;

                if (!planName) {
                    // No plan assigned at all
                    setModules(new Set());
                    setIsLoading(false);
                    return;
                }

                // 2. Find the matching plan in app_access_plans for LOJISTA
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
                    .eq("user_type", "LOJISTA")
                    .eq("is_active", true)
                    .ilike("name", planName)
                    .maybeSingle();

                if (plan) {
                    const moduleKeys = (plan as any).plan_modules
                        ?.map((pm: any) => pm.access_modules?.key)
                        .filter(Boolean) as string[];
                    setModules(new Set(moduleKeys || []));
                } else {
                    // Check if ANY plans exist for LOJISTA. If zero, grant all as fallback (Setup Mode)
                    const { count } = await supabase
                        .from("app_access_plans")
                        .select("id", { count: 'exact', head: true })
                        .eq("user_type", "LOJISTA")
                        .eq("is_active", true);

                    if (count === 0) {
                        // Grant all common modules
                        setModules(new Set(['treinos', 'nutricao', 'telemedicina', 'marketplace', 'agenda', 'chat', 'financeiro', 'loja', 'estoque', 'relatorios']));
                    } else {
                        // If plans exist but none match, try fallback to highest plan
                        const { data: anyPlan } = await supabase
                            .from("app_access_plans")
                            .select(`
                                id,
                                plan_modules (
                                    module_id,
                                    access_modules (key)
                                )
                            `)
                            .eq("user_type", "LOJISTA")
                            .eq("is_active", true)
                            .order("price_cents", { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (anyPlan) {
                            const moduleKeys = (anyPlan as any).plan_modules
                                ?.map((pm: any) => pm.access_modules?.key)
                                .filter(Boolean) as string[];
                            setModules(new Set(moduleKeys || []));
                        }
                    }
                }
            } catch (error) {
                console.error("[useStorePlanModules] Error loading plan modules:", error);
            } finally {
                setIsLoading(false);
            }
        };

        void load();
    }, [user]);

    const hasModule = (moduleKey: string): boolean => {
        return modules.has(moduleKey);
    };

    return { storeId, subscriptionPlan, modules, isLoading, hasModule };
}
