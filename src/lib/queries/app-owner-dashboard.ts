import "server-only";

import { prisma } from "@/lib/prisma";

const MONTHS_OF_HISTORY = 6;

function lastNMonths(n: number) {
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() - i + 1, 1);
    months.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: start.toLocaleDateString("en-IN", { month: "short" }),
      start,
      end,
    });
  }
  return months;
}

function bucketByMonth(dates: Date[], months: ReturnType<typeof lastNMonths>) {
  return months.map((m) => ({
    month: m.label,
    count: dates.filter((d) => d >= m.start && d < m.end).length,
  }));
}

/**
 * Platform-wide stats for the App Owner's Dashboard: how many owners, properties,
 * and users are on the system, current occupancy, and month-over-month growth for
 * owners and properties over the last 6 months.
 */
export async function getAppOwnerDashboardData() {
  const months = lastNMonths(MONTHS_OF_HISTORY);
  const historyStart = months[0].start;

  const [
    totalOwners,
    activeOwners,
    totalProperties,
    activeProperties,
    totalManagers,
    totalTenants,
    bedCounts,
    ownerCreations,
    propertyCreations,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "PROPERTY_OWNER" } }),
    prisma.user.count({ where: { role: "PROPERTY_OWNER", isActive: true } }),
    prisma.property.count(),
    prisma.property.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "MANAGER" } }),
    prisma.user.count({ where: { role: "TENANT" } }),
    prisma.bed.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: "PROPERTY_OWNER", createdAt: { gte: historyStart } },
      select: { createdAt: true },
    }),
    prisma.property.findMany({
      where: { createdAt: { gte: historyStart } },
      select: { createdAt: true },
    }),
  ]);

  const totalBeds = bedCounts.reduce((sum, b) => sum + b._count._all, 0);
  const occupiedBeds = bedCounts.find((b) => b.status === "OCCUPIED")?._count._all ?? 0;

  return {
    totalOwners,
    activeOwners,
    totalProperties,
    activeProperties,
    totalManagers,
    totalTenants,
    totalBeds,
    occupiedBeds,
    occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    ownerGrowth: bucketByMonth(
      ownerCreations.map((o) => o.createdAt),
      months,
    ),
    propertyGrowth: bucketByMonth(
      propertyCreations.map((p) => p.createdAt),
      months,
    ),
  };
}

export type AppOwnerDashboardData = Awaited<ReturnType<typeof getAppOwnerDashboardData>>;
