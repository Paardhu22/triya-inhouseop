import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Summary counts, collections, and recent activity for the dashboard.
 */
export async function getDashboardData(propertyId: string) {
  const scope = { propertyId };
  const activeScope = { propertyId, status: "ACTIVE" as const };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const endOfMonth = new Date();
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  endOfMonth.setDate(0);
  endOfMonth.setHours(23, 59, 59, 999);

  const [
    totalRooms,
    totalBeds,
    occupiedBeds,
    paidCount,
    pendingCount,
    paymentsSum,
    expensesSum,
    recentPayments,
    recentComplaints,
  ] = await Promise.all([
    prisma.room.count({ where: scope }),
    prisma.bed.count({ where: scope }),
    prisma.bed.count({ where: { ...scope, status: "OCCUPIED" } }),
    prisma.tenancy.count({ where: { ...activeScope, paymentStatus: "PAID" } }),
    prisma.tenancy.count({
      where: { ...activeScope, paymentStatus: { in: ["PENDING", "OVERDUE"] } },
    }),
    prisma.payment.aggregate({
      where: {
        propertyId,
        status: "PAID",
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: {
        propertyId,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        tenant: { select: { fullName: true } },
      },
    }),
    prisma.complaint.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        tenant: { select: { fullName: true } },
      },
    }),
  ]);

  return {
    totalRooms,
    totalBeds,
    occupiedBeds,
    availableBeds: totalBeds - occupiedBeds,
    paidCount,
    pendingCount,
    monthlyCollections: paymentsSum._sum.amount ?? 0,
    monthlyExpenses: expensesSum._sum.amount ?? 0,
    recentPayments,
    recentComplaints,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
