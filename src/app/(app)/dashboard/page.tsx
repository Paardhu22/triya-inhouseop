import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { getActiveProperty } from "@/lib/property";
import { getDashboardData } from "@/lib/queries/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const property = await getActiveProperty();
  if (!property) redirect("/select-property");

  const data = await getDashboardData(property.id);
  const isFlat = property.slug === "cozy-gowlidoddy";

  return (
    <div className="space-y-14">
      <PageHeader title="Dashboard" />

      <section>
        <h2 className="mb-7 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Capacity
        </h2>
        <div className="grid grid-cols-2 gap-x-10 gap-y-10 lg:grid-cols-4">
          {isFlat ? (
            <>
              <StatCard label="Total Flats" value={data.totalRooms} />
              <StatCard label="Occupied Flats" value={data.occupiedBeds} />
              <StatCard label="Available Flats" value={data.availableBeds} />
            </>
          ) : (
            <>
              <StatCard label="Total Rooms" value={data.totalRooms} />
              <StatCard label="Total Beds" value={data.totalBeds} />
              <StatCard label="Occupied Beds" value={data.occupiedBeds} />
              <StatCard label="Available Beds" value={data.availableBeds} />
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-7 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Payments
        </h2>
        <div className="grid max-w-md grid-cols-2 gap-x-10 gap-y-10">
          <StatCard label="Paid" value={data.paidCount} />
          <StatCard label="Pending" value={data.pendingCount} />
        </div>
      </section>
    </div>
  );
}
