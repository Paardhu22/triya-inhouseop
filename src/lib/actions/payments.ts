"use server";

import { revalidatePath } from "next/cache";
import { startOfMonth } from "date-fns";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { DEPOSIT_PAYMENT_NOTE_PREFIX, createPaymentOrder, verifyPayment } from "@/lib/payments/razorpay";
import { prisma } from "@/lib/prisma";

async function requireActiveTenancy(userId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { userId },
    select: {
      id: true,
      propertyId: true,
      tenancies: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { id: true, monthlyRent: true, maintenanceCharge: true, securityDeposit: true },
      },
    },
  });
  return tenant?.tenancies[0] ? { tenant, tenancy: tenant.tenancies[0] } : null;
}

/** Tenant-initiated "Pay Now": creates a Razorpay order for this month's rent. */
export async function initiateTenantPayment(): Promise<
  ActionResult<{ orderId: string; amount: number; currency: string }>
> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const found = await requireActiveTenancy(session.user.id);
  if (!found) return actionError("No active tenancy found");

  const { tenancy } = found;
  return createPaymentOrder(tenancy.id, tenancy.monthlyRent + tenancy.maintenanceCharge, "rent");
}

/**
 * Verify a completed Razorpay checkout and, only once verified, record it as a PAID
 * payment for the current month — mirroring the manager-side record-payment flow
 * (see togglePaymentStatus in tenants.ts) but self-served by the tenant.
 */
export async function verifyTenantPayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const found = await requireActiveTenancy(session.user.id);
  if (!found) return actionError("No active tenancy found");

  const { tenant, tenancy } = found;

  const verified = await verifyPayment({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
    tenancyId: tenancy.id,
    purpose: "rent",
  });
  if (!verified.ok) return verified;

  const monthStart = startOfMonth(new Date());
  await prisma.$transaction(async (tx) => {
    await tx.tenancy.update({ where: { id: tenancy.id }, data: { paymentStatus: "PAID" } });

    const existing = await tx.payment.findFirst({
      where: { tenancyId: tenancy.id, forMonth: monthStart },
      select: { id: true },
    });

    const data = {
      status: "PAID" as const,
      amount: verified.data.amount,
      method: "ONLINE" as const,
      onlineAmount: verified.data.amount,
      cashAmount: null,
      paidAt: new Date(),
      notes: `Razorpay payment ${input.razorpayPaymentId}`,
    };

    if (existing) {
      await tx.payment.update({ where: { id: existing.id }, data });
    } else {
      await tx.payment.create({
        data: {
          ...data,
          propertyId: tenant.propertyId,
          tenancyId: tenancy.id,
          tenantId: tenant.id,
          forMonth: monthStart,
        },
      });
    }
  });

  revalidatePath("/portal");
  revalidatePath("/portal/pay");
  return actionOk();
}

/**
 * Tenant-initiated advance payment: the security deposit set on their tenancy at
 * move-in. Separate from rent — its own Razorpay order `purpose`, its own Payment
 * row (tagged via DEPOSIT_PAYMENT_NOTE_PREFIX), never touches `paymentStatus`.
 */
export async function initiateAdvancePayment(): Promise<
  ActionResult<{ orderId: string; amount: number; currency: string }>
> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const found = await requireActiveTenancy(session.user.id);
  if (!found) return actionError("No active tenancy found");

  const { tenancy } = found;
  if (!tenancy.securityDeposit || tenancy.securityDeposit <= 0) {
    return actionError("No advance amount has been set for your tenancy. Contact your manager.");
  }

  return createPaymentOrder(tenancy.id, tenancy.securityDeposit, "deposit");
}

/** Verify a completed Razorpay checkout for the advance/security deposit payment. */
export async function verifyAdvancePayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const found = await requireActiveTenancy(session.user.id);
  if (!found) return actionError("No active tenancy found");

  const { tenant, tenancy } = found;

  const verified = await verifyPayment({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
    tenancyId: tenancy.id,
    purpose: "deposit",
  });
  if (!verified.ok) return verified;

  await prisma.payment.create({
    data: {
      propertyId: tenant.propertyId,
      tenancyId: tenancy.id,
      tenantId: tenant.id,
      amount: verified.data.amount,
      forMonth: startOfMonth(new Date()),
      status: "PAID",
      method: "ONLINE",
      onlineAmount: verified.data.amount,
      paidAt: new Date(),
      notes: `${DEPOSIT_PAYMENT_NOTE_PREFIX} — Razorpay payment ${input.razorpayPaymentId}`,
    },
  });

  revalidatePath("/portal");
  revalidatePath("/portal/pay");
  return actionOk();
}
