// InfinitePay Payment Service
// Handles all InfinitePay payment operations

import { supabase } from "@/integrations/supabase/client";

export type PaymentType =
    | "subscription"
    | "marketplace_order"
    | "store_plan"
    | "professional_service"
    | "lp_unlock";

export interface CreatePaymentParams {
    amount: number;
    paymentType: PaymentType;
    referenceId?: string;
    userId: string;
    description: string;
    paymentMethods?: ("pix" | "credit_card")[];
    desiredPlan?: string; // For subscriptions
}

export interface PaymentResult {
    paymentId: string;
    paymentUrl: string;
    qrCode?: string; // QR Code image URL for PIX
    pixCode?: string; // PIX code string to copy
    expiresAt: string;
}

/**
 * Creates a payment intent via InfinitePay
 */
export async function createInfinitePayPayment(
    params: CreatePaymentParams
): Promise<PaymentResult> {
    console.log("[InfinitePay Service] Creating payment:", params);

    try {
        // Call Edge Function to create payment intent
        const { data, error } = await supabase.functions.invoke("create-payment-intent", {
            body: params,
        });

        if (error) {
            console.error("[InfinitePay Service] Error creating payment:", error);
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error || "Failed to create payment");
        }

        console.log("[InfinitePay Service] Payment created:", data);

        return {
            paymentId: data.paymentId,
            paymentUrl: data.paymentUrl,
            qrCode: data.qrCode,
            pixCode: data.pixCode,
            expiresAt: data.expiresAt,
        };
    } catch (error: any) {
        console.error("[InfinitePay Service] Exception:", error);
        throw new Error(error.message || "Failed to create payment");
    }
}

/**
 * Checks the status of a payment
 */
export async function checkPaymentStatus(
    paymentId: string
): Promise<"pending" | "paid" | "failed" | "refunded" | "expired"> {
    const { data, error } = await supabase
        .from("pix_payments")
        .select("status, expires_at")
        .eq("id", paymentId)
        .single();

    if (error) throw error;

    // Check if expired
    if (data.status === "pending" && new Date(data.expires_at) < new Date()) {
        return "expired";
    }

    return data.status as any;
}

/**
 * Gets payment details
 */
export async function getPaymentDetails(paymentId: string) {
    const { data, error } = await supabase
        .from("pix_payments")
        .select("*")
        .eq("id", paymentId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Opens payment URL in new window (for credit card payments)
 */
export function openPaymentWindow(paymentUrl: string): Window | null {
    const width = 600;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    return window.open(
        paymentUrl,
        "InfinitePay Payment",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
    );
}

/**
 * Listens for payment status changes via Realtime
 */
export function subscribeToPaymentUpdates(
    paymentId: string,
    onUpdate: (status: string) => void
) {
    const channel = supabase
        .channel(`payment_${paymentId}`)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "pix_payments",
                filter: `id=eq.${paymentId}`,
            },
            (payload) => {
                console.log("[InfinitePay Service] Realtime update:", payload);
                const newStatus = (payload.new as any).status;
                onUpdate(newStatus);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
