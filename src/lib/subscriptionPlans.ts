export type SubscriptionPlan = "FREE" | "ADVANCE" | "ELITE";

export const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  FREE: "Gratuito",
  ADVANCE: "Advance Pro",
  ELITE: "Elite Black",
};

export const isPaidPlan = (plan: SubscriptionPlan) => plan !== "FREE";
