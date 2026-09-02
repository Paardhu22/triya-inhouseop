import "server-only";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { prisma } from "@/lib/prisma";

/** Months of history shown in the dashboard trend chart, including the current one. */
const TREND_MONTHS = 6;

type Fill = { rooms: number; beds: number; occupied: number; available: number };

function emptyFill(): Fill {
  return { rooms: 0, beds: 0, occupied: 0, available: 0 };
}

/**
 * Occupancy, rent, expense and activity figures for the dashboard.
 *
 * Amounts stay integer paise all the way out — callers format at the display
 * boundary with `@/lib/money`. Occupancy is rolled up from a single room/bed read
 * so the sharing, block and floor breakdowns can never disagree with the totals.
 */
export async function getDashboardData(propertyId: string) {
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(monthStart);
  const trendFrom = startOfMonth(subMonths(monthStart, TREND_MONTHS - 1));

  const [
    rooms,
    activeTenancies,
    collectedAgg,
    trendPayments,
    trendExpenses,
    recentPayments,
    recentComplaints,
    openComplaints,
    moveInsThisMonth,
    moveOutsThisMonth,
  ] = await Promise.all([
    prisma.room.findMany({
      where: { propertyId },
      select: {
        id: true,
        sharingType: true,
        floor: {
          select: {
            id: true,
            number: true,
            name: true,
            order: true,
            block: { select: { id: true, name: true, order: true } },
          },
        },
        beds: { select: { status: true } },
      },
    }),
    prisma.tenancy.findMany({
      where: { propertyId, status: "ACTIVE" },
      select: {
        id: true,
        monthlyRent: true,
        maintenanceCharge: true,
        paymentStatus: true,
        noticeGivenDate: true,
        tenant: { select: { fullName: true } },
        bed: {
          select: {
            label: true,
            room: { select: { number: true, sharingType: true } },
          },
        },
      },
    }),
    // Collections are grouped by the month they BILL (forMonth), matching the Reports
    // page — a backdated entry belongs to the month it settles, not the day it was typed.
    prisma.payment.aggregate({
      where: { propertyId, status: "PAID", forMonth: monthStart },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ["forMonth"],
      where: { propertyId, status: "PAID", forMonth: { gte: trendFrom, lte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.expense.findMany({
      where: { propertyId, date: { gte: trendFrom, lte: monthEnd } },
      select: { amount: true, date: true },
    }),
    prisma.payment.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        amount: true,
        status: true,
        method: true,
        createdAt: true,
        tenant: { select: { fullName: true } },
      },
    }),
    prisma.complaint.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        tenant: { select: { fullName: true } },
      },
    }),
    prisma.complaint.count({
      where: { propertyId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.tenancy.count({
      where: { propertyId, checkInDate: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.tenancy.count({
      where: { propertyId, checkOutDate: { gte: monthStart, lte: monthEnd } },
    }),
  ]);

  // --- Occupancy roll-up --------------------------------------------------------
  // One pass over the rooms feeds every breakdown, so the totals always reconcile.

  const sharingMap = new Map<number, Fill>();
  const blockMap = new Map<string, Fill & { name: string; order: number; floors: Set<string> }>();
  const floorMap = new Map<
    string,
    Fill & { number: number; name: string | null; blockName: string | null; sort: string }
  >();

  let totalBeds = 0;
  let occupiedBeds = 0;
  let fullRooms = 0;
  let partialRooms = 0;
  let emptyRooms = 0;

  for (const room of rooms) {
    const beds = room.beds.length;
    const occupied = room.beds.filter((b) => b.status === "OCCUPIED").length;
    const available = beds - occupied;

    totalBeds += beds;
    occupiedBeds += occupied;

    if (beds > 0 && occupied === beds) fullRooms += 1;
    else if (occupied > 0) partialRooms += 1;
    else emptyRooms += 1;

    const sharing = sharingMap.get(room.sharingType) ?? emptyFill();
    sharing.rooms += 1;
    sharing.beds += beds;
    sharing.occupied += occupied;
    sharing.available += available;
    sharingMap.set(room.sharingType, sharing);

    const { block } = room.floor;
    if (block) {
      const entry =
        blockMap.get(block.id) ??
        { ...emptyFill(), name: block.name, order: block.order, floors: new Set<string>() };
      entry.rooms += 1;
      entry.beds += beds;
      entry.occupied += occupied;
      entry.available += available;
      entry.floors.add(room.floor.id);
      blockMap.set(block.id, entry);
    }

    const floorEntry =
      floorMap.get(room.floor.id) ??
      {
        ...emptyFill(),
        number: room.floor.number,
        name: room.floor.name,
        blockName: block?.name ?? null,
        // Sort blocks before floors so "A · Floor 2" groups under its block.
        sort: `${String(block?.order ?? 0).padStart(4, "0")}-${String(room.floor.order).padStart(4, "0")}-${String(room.floor.number).padStart(4, "0")}`,
      };
    floorEntry.rooms += 1;
    floorEntry.beds += beds;
    floorEntry.occupied += occupied;
    floorEntry.available += available;
    floorMap.set(room.floor.id, floorEntry);
  }

  const sharingBreakdown = [...sharingMap.entries()]
    .map(([sharingType, fill]) => ({ sharingType, ...fill }))
    .sort((a, b) => a.sharingType - b.sharingType);

  const blockBreakdown = [...blockMap.entries()]
    .map(([id, { floors, order, ...fill }]) => ({ id, floors: floors.size, order, ...fill }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const floorBreakdown = [...floorMap.entries()]
    .map(([id, { sort, ...fill }]) => ({ id, sort, ...fill }))
    .sort((a, b) => a.sort.localeCompare(b.sort));

  // --- Rent roll-up -------------------------------------------------------------

  let expectedPaise = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  // Expected rent per sharing type, so the occupancy table can show what each
  // configuration actually earns.
  const revenueBySharing = new Map<number, number>();

  for (const t of activeTenancies) {
    const due = t.monthlyRent + t.maintenanceCharge;
    expectedPaise += due;

    if (t.paymentStatus === "PAID") paidCount += 1;
    else if (t.paymentStatus === "OVERDUE") overdueCount += 1;
    else pendingCount += 1;

    const sharing = t.bed.room.sharingType;
    revenueBySharing.set(sharing, (revenueBySharing.get(sharing) ?? 0) + due);
  }

  const noticeTenancies = activeTenancies
    .filter((t) => t.noticeGivenDate !== null)
    .map((t) => ({
      id: t.id,
      name: t.tenant.fullName,
      roomNumber: t.bed.room.number,
      bedLabel: t.bed.label,
      noticeGivenDate: t.noticeGivenDate as Date,
    }))
    .sort((a, b) => a.noticeGivenDate.getTime() - b.noticeGivenDate.getTime());

  const collectedPaise = collectedAgg._sum.amount ?? 0;
  const outstandingPaise = Math.max(0, expectedPaise - collectedPaise);

  // --- Trend --------------------------------------------------------------------
  // Six month buckets built from the range itself, so months with no rows still
  // appear as zeroes rather than collapsing the axis.

  const collectedByMonth = new Map<number, number>();
  for (const row of trendPayments) {
    collectedByMonth.set(startOfMonth(row.forMonth).getTime(), row._sum.amount ?? 0);
  }

  const expensesByMonth = new Map<number, number>();
  for (const e of trendExpenses) {
    const key = startOfMonth(e.date).getTime();
    expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + e.amount);
  }

  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const month = startOfMonth(subMonths(monthStart, TREND_MONTHS - 1 - i));
    const key = month.getTime();
    return {
      // Labelled here rather than in the chart: a Date crossing the RSC boundary is
      // re-read in the browser's timezone, which can shift a month-start back a day.
      label: format(month, "MMM"),
      collectedPaise: collectedByMonth.get(key) ?? 0,
      expensesPaise: expensesByMonth.get(key) ?? 0,
    };
  });

  const expensesPaise = expensesByMonth.get(monthStart.getTime()) ?? 0;

  return {
    monthStart,

    // Capacity
    totalRooms: rooms.length,
    totalBeds,
    occupiedBeds,
    availableBeds: totalBeds - occupiedBeds,
    fullRooms,
    partialRooms,
    emptyRooms,

    // Breakdowns
    sharingBreakdown: sharingBreakdown.map((s) => ({
      ...s,
      expectedPaise: revenueBySharing.get(s.sharingType) ?? 0,
    })),
    blockBreakdown,
    floorBreakdown,

    // Rent
    activeTenancies: activeTenancies.length,
    paidCount,
    pendingCount,
    overdueCount,
    expectedPaise,
    collectedPaise,
    outstandingPaise,
    expensesPaise,
    netPaise: collectedPaise - expensesPaise,

    // Movement
    moveInsThisMonth,
    moveOutsThisMonth,
    noticeTenancies,

    // Activity
    trend,
    recentPayments,
    recentComplaints,
    openComplaints,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
