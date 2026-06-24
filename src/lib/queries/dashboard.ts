import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Summary counts, collections, recent activity, and breakdown stats for the dashboard.
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
    roomsWithBeds,
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
    prisma.room.findMany({
      where: { propertyId },
      select: {
        sharingType: true,
        floor: {
          select: {
            block: {
              select: { id: true, name: true },
            },
          },
        },
        beds: {
          select: { status: true },
        },
      },
    }),
  ]);

  // Group rooms in memory to calculate sharing and block breakdowns
  const sharingMap: Record<number, { rooms: number; beds: number; occupied: number; available: number }> = {};
  const blockMap: Record<string, { name: string; rooms: number; beds: number; occupied: number; available: number }> = {};

  for (const room of roomsWithBeds) {
    const type = room.sharingType;
    if (!sharingMap[type]) {
      sharingMap[type] = { rooms: 0, beds: 0, occupied: 0, available: 0 };
    }
    sharingMap[type].rooms += 1;
    sharingMap[type].beds += room.beds.length;
    sharingMap[type].occupied += room.beds.filter((b) => b.status === "OCCUPIED").length;
    sharingMap[type].available += room.beds.filter((b) => b.status === "AVAILABLE").length;

    const block = room.floor.block;
    if (block) {
      if (!blockMap[block.id]) {
        blockMap[block.id] = { name: block.name, rooms: 0, beds: 0, occupied: 0, available: 0 };
      }
      blockMap[block.id].rooms += 1;
      blockMap[block.id].beds += room.beds.length;
      blockMap[block.id].occupied += room.beds.filter((b) => b.status === "OCCUPIED").length;
      blockMap[block.id].available += room.beds.filter((b) => b.status === "AVAILABLE").length;
    }
  }

  const sharingBreakdown = Object.entries(sharingMap)
    .map(([sharingType, stats]) => ({
      sharingType: Number(sharingType),
      ...stats,
    }))
    .sort((a, b) => a.sharingType - b.sharingType);

  const blockBreakdown = Object.values(blockMap)
    .sort((a, b) => a.name.localeCompare(b.name));

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
    sharingBreakdown,
    blockBreakdown,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
