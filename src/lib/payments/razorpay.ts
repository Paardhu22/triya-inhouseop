import "server-only";

import crypto from "crypto";
import Razorpay from "razorpay";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";

const MIN_AMOUNT_PAISE = 100;

export type PaymentPurpose = "rent" | "deposit";

// Payment.notes marker for advance/deposit payments — there's no dedicated schema
// field for "has the tenant paid their security deposit", so this prefix is how the
// portal tells a deposit payment apart from a rent payment in history/lookups.
export const DEPOSIT_PAYMENT_NOTE_PREFIX = "Advance (security deposit) payment";

function getClient(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Create a Razorpay order for a tenant's "Pay Now". The tenancy id is embedded in
 * the order's `notes` (Razorpay's own record, fetched back — not client-supplied)
 * so verifyPayment can confirm the paid order actually belongs to the tenancy it's
 * being credited to, without needing a separate "pending order" table.
 */
export async function createPaymentOrder(
  tenancyId: string,
  amountPaise: number,
  purpose: PaymentPurpose = "rent",
): Promise<ActionResult<{ orderId: string; amount: number; currency: string }>> {
  const client = getClient();
  if (!client) {
    return actionError("Online payments are coming soon. Please pay by cash for now.");
  }

  if (!Number.isInteger(amountPaise) || amountPaise < MIN_AMOUNT_PAISE) {
    return actionError("Amount must be at least ₹1.");
  }

  try {
    const order = await client.orders.create({
      amount: amountPaise,
      currency: "INR",
      // Razorpay caps `receipt` at 40 chars; it's just a reference, so keep it short
      // — verification relies on `notes.tenancyId`/`notes.purpose` below, not this string.
      receipt: `pay_${Date.now().toString(36)}`,
      notes: { tenancyId, purpose },
    });
    return actionOk({ orderId: order.id, amount: amountPaise, currency: order.currency });
  } catch (error) {
    const message =
      error && typeof error === "object" && "error" in error
        ? String((error as { error?: { description?: string } }).error?.description ?? "")
        : error instanceof Error
          ? error.message
          : "";
    return actionError(message ? `Could not start payment: ${message}` : "Could not start payment. Please try again.");
  }
}

/**
 * Verify a completed Razorpay Standard Checkout payment: check the HMAC-SHA256
 * signature, then fetch the order back from Razorpay (authoritative, not
 * client-supplied) to confirm its amount and that it was created for this exact
 * tenancy before the caller credits anything.
 */
export async function verifyPayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  tenancyId: string;
  purpose: PaymentPurpose;
}): Promise<ActionResult<{ amount: number }>> {
  const client = getClient();
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!client || !keySecret) {
    return actionError("Online payments are coming soon. Please pay by cash for now.");
  }

  if (!input.razorpayOrderId || !input.razorpayPaymentId || !input.razorpaySignature) {
    return actionError("Missing payment details.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  const signaturesMatch =
    expectedSignature.length === input.razorpaySignature.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(input.razorpaySignature));
  if (!signaturesMatch) {
    return actionError("Payment verification failed.");
  }

  try {
    const order = await client.orders.fetch(input.razorpayOrderId);
    if (
      order.status !== "paid" ||
      order.notes?.tenancyId !== input.tenancyId ||
      order.notes?.purpose !== input.purpose
    ) {
      return actionError("Payment verification failed.");
    }
    return actionOk({ amount: Number(order.amount) });
  } catch {
    return actionError("Could not confirm payment with Razorpay. Please try again.");
  }
}
