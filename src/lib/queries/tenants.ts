import "server-only";

import { startOfMonth } from "date-fns";

import { prisma } from "@/lib/prisma";
import { monthlyDuePaise, resolveCollectionState, resolvePaymentStatus } from "@/lib/rent";

/** This month's position for an active tenancy, derived from the ledger. */
function currentMonthPosition(
  t: { monthlyRent: number; maintenanceCharge: number; paymentDueDay: number | null },
  payments: { amount: number }[],
  month: Date,
) {
  const duePaise = monthlyDuePaise(t);
  const collectedPaise = payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    duePaise,
    collectedPaise,
    state: resolveCollectionState(duePaise, collectedPaise),
    // Derived rather than the stored snapshot, which only refreshes when money is
    // recorded or the cron job runs and can be a cycle stale.
    paymentStatus: resolvePaymentStatus({
      duePaise,
      collectedPaise,
      paymentDueDay: t.paymentDueDay,
      month,
    }),
  };
}

export async function getTenants(propertyId: string) {
  const month = startOfMonth(new Date());
  const tenants = await prisma.tenant.findMany({
    where: { propertyId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      occupation: true,
      college: true,
      company: true,
      createdAt: true,
      tenancies: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          monthlyRent: true,
          maintenanceCharge: true,
          paymentDueDay: true,
          checkInDate: true,
          bed: { select: { label: true, room: { select: { number: true } } } },
          payments: {
            where: { forMonth: month, status: "PAID" },
            select: { amount: true },
          },
        },
      },
    },
  });

  return tenants.map(({ tenancies, ...tenant }) => ({
    ...tenant,
    tenancies: tenancies.map(({ payments, ...t }) => ({
      ...t,
      ...currentMonthPosition(t, payments, month),
    })),
  }));
}

export async function getTenantProfile(tenantId: string, propertyId: string) {
  const month = startOfMonth(new Date());
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, propertyId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      emergencyContact: true,
      fatherName: true,
      motherName: true,
      address: true,
      aadhaarNumber: true,
      panNumber: true,
      college: true,
      company: true,
      occupation: true,
      notes: true,
      photoUrl: true,
      createdAt: true,
      tenancies: {
        orderBy: { checkInDate: "desc" },
        select: {
          id: true,
          status: true,
          monthlyRent: true,
          maintenanceCharge: true,
          securityDeposit: true,
          paymentDueDay: true,
          checkInDate: true,
          expectedLeavingDate: true,
          checkOutDate: true,
          bed: { select: { label: true, room: { select: { number: true } } } },
          payments: {
            where: { forMonth: month, status: "PAID" },
            select: { amount: true },
          },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          filename: true,
          storageKey: true,
          mimeType: true,
          createdAt: true,
        },
      },
      payments: {
        orderBy: [{ forMonth: "desc" }, { paidAt: "desc" }],
        take: 24,
        select: {
          id: true,
          amount: true,
          forMonth: true,
          status: true,
          method: true,
          cashAmount: true,
          onlineAmount: true,
          recordedBy: { select: { name: true } },
          paidAt: true,
          notes: true,
        },
      },
      complaints: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
      },
    },
  });
  if (!tenant) return null;

  return {
    ...tenant,
    tenancies: tenant.tenancies.map(({ payments, ...t }) => ({
      ...t,
      ...currentMonthPosition(t, payments, month),
    })),
  };
}

export type TenantListItem = Awaited<ReturnType<typeof getTenants>>[number];
export type TenantProfile = NonNullable<Awaited<ReturnType<typeof getTenantProfile>>>;
