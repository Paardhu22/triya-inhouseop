import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { getSelectedPropertyId } from "@/lib/property";
import { getDashboardData } from "@/lib/queries/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

  const data = await getDashboardData(propertyId);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Rooms" value={data.totalRooms} />
        <StatCard label="Total Beds" value={data.totalBeds} />
        <StatCard label="Occupied Beds" value={data.occupiedBeds} />
        <StatCard label="Available Beds" value={data.availableBeds} />
        <StatCard label="Paid" value={data.paidCount} />
        <StatCard label="Pending" value={data.pendingCount} />
      </div>
    </div>
  );
}
