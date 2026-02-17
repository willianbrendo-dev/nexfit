import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface UserProfileData {
    peso_kg: number | null;
    altura_cm: number | null;
    display_name: string | null;
}

export const useUserProfile = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) {
                setProfile(null);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("peso_kg, altura_cm, display_name")
                .eq("id", user.id)
                .maybeSingle();

            if (!error && data) {
                setProfile(data as UserProfileData);
            }

            setLoading(false);
        };

        void fetchProfile();
    }, [user]);

    return { profile, loading };
};
