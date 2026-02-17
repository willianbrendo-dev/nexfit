import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
    const { user } = useAuth();
    const [permission, setPermission] = useState<NotificationPermission>("default");
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const subscribeUser = async () => {
        if (!user || !VAPID_PUBLIC_KEY) {
            console.warn("[Push] User not logged in or VAPID key missing.");
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;

            // Request permission
            const result = await Notification.requestPermission();
            setPermission(result);

            if (result !== "granted") {
                throw new Error("Permissão de notificação negada.");
            }

            // Subscribe
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            setSubscription(sub);

            // Save to Supabase
            const { error } = await supabase.from("push_subscriptions" as any).upsert({
                user_id: user.id,
                subscription: sub.toJSON(),
                device_info: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform
                }
            }, { onConflict: 'user_id,subscription' });

            if (error) throw error;

            console.log("[Push] Subscribed successfully.");
        } catch (error) {
            console.error("[Push] Error subscribing:", error);
        }
    };

    const unsubscribeUser = async () => {
        try {
            const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
            if (sub) {
                await sub.unsubscribe();
                setSubscription(null);

                if (user) {
                    await supabase.from("push_subscriptions" as any).delete().eq("user_id", user.id).eq("subscription->>endpoint", sub.endpoint);
                }
            }
        } catch (error) {
            console.error("[Push] Error unsubscribing:", error);
        }
    };

    return {
        permission,
        subscription,
        subscribeUser,
        unsubscribeUser
    };
}
