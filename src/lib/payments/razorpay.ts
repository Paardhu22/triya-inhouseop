import "server-only";

import { actionError, type ActionResult } from "@/lib/action-result";

/**
 * Seam for the upcoming Razorpay integration. Wired to a real server action and a
 * real "Pay Now" button today, but returns a coming-soon error until
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are configured and this is implemented.
 */
export async function createPaymentOrder(_tenancyId: string, _amountPaise: number): Promise<ActionResult<{ orderId: string }>> {
  return actionError("Online payments are coming soon. Please pay by cash for now.");
}
