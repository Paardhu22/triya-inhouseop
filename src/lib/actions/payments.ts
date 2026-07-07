"use server";

import { auth } from "@/auth";
import { actionError, type ActionResult } from "@/lib/action-result";
import { createPaymentOrder } from "@/lib/payments/razorpay";
import { prisma } from "@/lib/prisma";

/** Tenant-initiated "Pay Now". Stubbed until Razorpay is wired up. */
export async function initiateTenantPayment(): Promise<ActionResult<{ orderId: string }>> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    select: { tenancies: { where: { status: "ACTIVE" }, take: 1, select: { id: true, monthlyRent: true, maintenanceCharge: true } } },
  });
  const tenancy = tenant?.tenancies[0];
  if (!tenancy) return actionError("No active tenancy found");

  return createPaymentOrder(tenancy.id, tenancy.monthlyRent + tenancy.maintenanceCharge);
}
