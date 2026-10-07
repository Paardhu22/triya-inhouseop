import type { Metadata } from "next";

import { StatCard } from "@/components/dashboard/stat-card";
import { RentTrendChart } from "@/components/reports/rent-trend-chart";
import { ReportsClient } from "@/components/reports/reports-client";
import { PageHeader } from "@/components/shell/page-header";
import { formatINR, formatINRCompact } from "@/lib/money";
import { requireActiveProperty } from "@/lib/property";
import { getRentReport } from "@/lib/queries/reports";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const property = await requireActiveProperty();
  const { month } = await searchParams;
  const report = await getRentReport(property.id, month);
  const { summary } = report;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Reports"
        description={`Rent expected against rent collected for ${report.monthLabel}, broken down by floor, ${
          property.isFlat ? "flat" : "room"
        } and tenant.`}
      />

      <div className="grid grid-cols-2 gap-x-6 border-y border-border sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Expected"
          value={formatINRCompact(summary.expectedPaise)}
          hint={`${summary.tenancies} ${summary.tenancies === 1 ? "tenancy" : "tenancies"}`}
        />
        <StatCard
          label="Collected"
          value={formatINRCompact(summary.collectedPaise)}
          hint={`${Math.round(summary.collectionRate * 100)}% of expected`}
        />
        <StatCard
          label="Outstanding"
          value={formatINRCompact(summary.outstandingPaise)}
          hint={`${summary.unpaid} unpaid · ${summary.partiallyPaid} part paid`}
        />
        <StatCard label="Cash" value={formatINRCompact(summary.cashPaise)} hint="collected in cash" />
        <StatCard
          label="Online"
          value={formatINRCompact(summary.onlinePaise)}
          hint="collected online"
        />
        <StatCard
          label="Fully paid"
          value={`${summary.fullyPaid}/${summary.tenancies}`}
          hint={`${formatINR(summary.collectedPaise)} received`}
        />
      </div>

      <section className="space-y-5 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
          Rent collected · trailing 12 months
        </h2>
        <RentTrendChart series={report.trend} />
      </section>

      <ReportsClient report={report} isFlat={property.isFlat} />
    </div>
  );
}
