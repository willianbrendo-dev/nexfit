import { supabase } from "@/integrations/supabase/client";

export interface MercadoPagoPaymentParams {
    transaction_amount: number;
    description: string;
    payment_method_id: "pix" | "card"; // Simple abstraction
    payer: {
        email: string;
        first_name: string;
        last_name: string;
    };
    metadata: {
        payment_type: string;
        reference_id: string;
        user_id: string;
    };
}

export interface MercadoPagoPaymentResult {
    success: boolean;
    payment_id?: string;
    status?: string;
    qr_code?: string;
    qr_code_base64?: string;
    ticket_url?: string;
    checkout_url?: string;
    error?: string;
}

/**
 * Creates a payment using Mercado Pago via Edge Function
 */
export async function createMercadoPagoPayment(params: MercadoPagoPaymentParams): Promise<MercadoPagoPaymentResult> {
    console.log("[MercadoPago Service] Creating payment:", params);

    try {
        const response = await fetch(`https://afffyfsmcvphrhbtxrgt.supabase.co/functions/v1/create-mercadopago-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("[MercadoPago Service] API error:", data);
            throw new Error(data.error || "Erro na função de pagamento");
        }

        return data;
    } catch (err: any) {
        console.error("[MercadoPago Service] Exception:", err);
        return {
            success: false,
            error: err.message || "Unknown error during payment creation",
        };
    }
}

/**
 * Subscribes to payment updates via Supabase Realtime
 */
export function subscribeToPaymentStatus(paymentId: string, onUpdate: (status: string) => void) {
    const channel = supabase
        .channel(`payment_status_${paymentId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'pix_payments',
                filter: `id=eq.${paymentId}`
            },
            (payload) => {
                console.log("[MercadoPago Service] Status update received:", payload);
                const newStatus = (payload.new as any).status;
                onUpdate(newStatus);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
