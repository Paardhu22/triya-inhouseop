import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { StatusBadge } from "@/components/common/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { OccupancyStatCard } from "@/components/dashboard/occupancy-stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { formatINR, formatINRCompact } from "@/lib/money";
import { getActiveProperty } from "@/lib/property";
import { getDashboardData } from "@/lib/queries/dashboard";
import { PAYMENT_METHOD_META } from "@/lib/rent";
import {
  COLLECTION_STATE_META,
  COMPLAINT_PRIORITY_META,
  COMPLAINT_STATUS_META,
  PAYMENT_STATUS_META,
} from "@/lib/status";
import { vacateByDate } from "@/lib/tenancy";

import {
  BlockOccupancyPanel,
  MoneyTrendPanel,
  SharingOccupancyPanel,
} from "./dashboard-charts";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const property = await getActiveProperty();
  if (!property) redirect("/select-property");

  const data = await getDashboardData(property.id);
  const { isFlat, hasBlocks } = property;

  const unitLabel = isFlat ? "flats" : "beds";
  const occupancyRate =
    data.totalBeds > 0 ? Math.round((data.occupiedBeds / data.totalBeds) * 100) : 0;
  const collectionRate =
    data.expectedPaise > 0 ? Math.round((data.collectedPaise / data.expectedPaise) * 100) : 0;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description={`Occupancy and rent for ${property.name} as at ${format(new Date(), "d MMMM yyyy")}.`}
      />

      {/* 01 / Capacity Overview */}
      <section className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
            Capacity Overview
          </h2>
          <span className="text-xs text-muted-foreground">
            {data.totalRooms} {isFlat ? "Units" : "Rooms"} Total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 border-t border-border sm:gap-x-8 lg:grid-cols-4">
          <StatCard
            label={isFlat ? "Total Flats" : "Total Beds"}
            value={data.totalBeds}
            hint={`Across ${data.totalRooms} ${isFlat ? "units" : "rooms"}`}
          />
          <OccupancyStatCard
            label="Occupied"
            value={data.occupiedBeds}
            hint={`${occupancyRate}% of capacity filled`}
            entries={data.occupancyEntries.filter((entry) => entry.status === "OCCUPIED")}
            isFlat={isFlat}
          />
          <OccupancyStatCard
            label="Available"
            value={data.availableBeds}
            hint={`${unitLabel} ready to move in`}
            entries={data.occupancyEntries.filter((entry) => entry.status === "AVAILABLE")}
            isFlat={isFlat}
          />
          <StatCard
            label={isFlat ? "Units Let" : "Rooms Full"}
            value={`${data.fullRooms}/${data.totalRooms}`}
            hint={`${data.partialRooms} part filled · ${data.emptyRooms} empty`}
          />
        </div>
      </section>

      {/* 02 / Rent & Financial Ledger */}
      <section className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
            Financial Ledger · {format(data.monthStart, "MMMM yyyy")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {collectionRate}% Realization Rate
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 border-t border-border sm:gap-x-8 lg:grid-cols-4">
          <StatCard
            label="Expected Rent"
            value={formatINRCompact(data.expectedPaise)}
            hint={`${data.activeTenancies} active ${data.activeTenancies === 1 ? "tenancy" : "tenancies"}`}
          />
          <StatCard
            label="Collected"
            value={formatINRCompact(data.collectedPaise)}
            hint={`${collectionRate}% of target collected`}
          />
          <StatCard
            label="Outstanding"
            value={formatINRCompact(data.outstandingPaise)}
            hint={`${data.unpaidCount} unpaid · ${data.partialCount} part paid · ${data.overdueCount} overdue`}
          />
          <StatCard
            label="Operational Expenses"
            value={formatINRCompact(data.expensesPaise)}
            hint={`Net ${formatINRCompact(data.netPaise)} this month`}
          />
        </div>
      </section>

      {/* 03 / Financial Trend */}
      <MoneyTrendPanel trend={data.trend} />

      {/* 04 / Capacity Breakdown */}
      <SharingOccupancyPanel rows={data.sharingBreakdown} isFlat={isFlat} />

      {/* Two or more blocks — with one there is nothing to compare against. */}
      {hasBlocks && data.blockBreakdown.length > 1 ? (
        <BlockOccupancyPanel rows={data.blockBreakdown} />
      ) : null}

      {/* 05 / Floor Directory */}
      <section className="min-w-0 overflow-hidden border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-5">
          <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
            Floor Occupancy Directory
          </h2>
          <span className="text-xs text-muted-foreground">
            {data.floorBreakdown.length} Floors Configured
          </span>
        </div>
        {data.floorBreakdown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No floors configured for this property yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
                  <th className="pr-5 py-3 first:pl-0 last:pr-0">Floor</th>
                  <th className="pr-5 py-3 first:pl-0 last:pr-0 text-right">
                    {isFlat ? "Flats" : "Rooms"}
                  </th>
                  <th className="pr-5 py-3 first:pl-0 last:pr-0 text-right">
                    {isFlat ? "Units" : "Beds"}
                  </th>
                  <th className="pr-5 py-3 first:pl-0 last:pr-0 text-right">Occupied</th>
                  <th className="pr-5 py-3 first:pl-0 last:pr-0 text-right">Available</th>
                  <th className="pr-5 py-3 first:pl-0 last:pr-0 text-right">Fill Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.floorBreakdown.map((f) => {
                  const fill = f.beds > 0 ? Math.round((f.occupied / f.beds) * 100) : 0;
                  return (
                    <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                      <td className="pr-5 py-3 first:pl-0 last:pr-0 font-medium text-foreground">
                        {f.blockName ? `Block ${f.blockName} · ` : ""}
                        {f.name ?? `Floor ${f.number}`}
                      </td>
                      <td className="pr-5 py-3 first:pl-0 last:pr-0 text-right tabular-nums text-muted-foreground">{f.rooms}</td>
                      <td className="pr-5 py-3 first:pl-0 last:pr-0 text-right tabular-nums text-muted-foreground">{f.beds}</td>
                      <td className="pr-5 py-3 first:pl-0 last:pr-0 text-right tabular-nums font-medium text-foreground">{f.occupied}</td>
                      <td className="pr-5 py-3 first:pl-0 last:pr-0 text-right tabular-nums font-medium text-foreground">
                        {f.available}
                      </td>
                      <td className="pr-5 py-3 first:pl-0 last:pr-0 text-right tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-10 text-right">{fill}%</span>
                          <span className="inline-block h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.min(fill, 100)}%` }}
                            />
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 06 & 07 / Operations Matrix */}
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        {/* Rent status */}
        <section className="flex flex-col justify-between border-t border-border pt-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-5">
              <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
                Rent Settlement Status
              </h2>
              <span className="text-xs text-muted-foreground">
                {data.activeTenancies} Tenancies
              </span>
            </div>
            <div className="pb-5">
              <dl className="divide-y divide-border/60">
                {(
                  [
                    [COLLECTION_STATE_META.PAID, data.paidCount],
                    [COLLECTION_STATE_META.PARTIAL, data.partialCount],
                    [COLLECTION_STATE_META.UNPAID, data.unpaidCount],
                    [
                      { ...PAYMENT_STATUS_META.OVERDUE, label: "Overdue (unpaid or part paid)" },
                      data.overdueCount,
                    ],
                  ] as const
                ).map(([meta, count]) => (
                  <div key={meta.label} className="flex items-center justify-between py-2.5">
                    <dt>
                      <StatusBadge meta={meta} />
                    </dt>
                    <dd className="text-base font-bold tabular-nums text-foreground">
                      {count}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {count === 1 ? "tenancy" : "tenancies"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-border py-3.5 text-sm">
            <div>
              <div className="text-lg font-bold tabular-nums text-foreground">{data.moveInsThisMonth}</div>
              <div className="text-[0.725rem] font-medium text-muted-foreground uppercase tracking-wider">Moved in</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums text-foreground">{data.moveOutsThisMonth}</div>
              <div className="text-[0.725rem] font-medium text-muted-foreground uppercase tracking-wider">Moved out</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums text-foreground">{data.openComplaints}</div>
              <div className="text-[0.725rem] font-medium text-muted-foreground uppercase tracking-wider">Complaints</div>
            </div>
          </div>
        </section>

        {/* Vacating soon */}
        <section className="flex min-w-0 flex-col border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-5">
            <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
              Notice Register
            </h2>
            <span className="text-xs text-muted-foreground">
              {data.noticeTenancies.length} Scheduled
            </span>
          </div>
          <div className="flex-1">
            {data.noticeTenancies.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No active move-out notices on file.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.noticeTenancies.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/10 transition-colors px-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isFlat
                          ? `Flat ${t.roomNumber}`
                          : `Room ${t.roomNumber} · Bed ${t.bedLabel}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {format(vacateByDate(t.noticeGivenDate), "d MMM yyyy")}
                      </p>
                      <p className="text-[0.725rem] font-medium text-muted-foreground uppercase tracking-wider">Vacate by</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 08 & 09 / Live Activity Log */}
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        {/* Recent payments */}
        <section className="flex min-w-0 flex-col border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-5">
            <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
              Recent Collections
            </h2>
            <span className="text-xs text-muted-foreground">
              Latest 5 Transactions
            </span>
          </div>
          <div className="flex-1">
            {data.recentPayments.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No payment transactions recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/10 transition-colors px-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.tenant.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(p.createdAt, "d MMM yyyy")} · {PAYMENT_METHOD_META[p.method].label}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                      <span className="text-sm font-bold tabular-nums text-foreground min-w-[5rem] text-right">
                        {formatINR(p.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recent complaints */}
        <section className="flex min-w-0 flex-col border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-5">
            <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
              Incident & Complaints Log
            </h2>
            <span className="text-xs text-muted-foreground">
              Latest 5 Tickets
            </span>
          </div>
          <div className="flex-1">
            {data.recentComplaints.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No tickets or complaints raised yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.recentComplaints.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-3 hover:bg-muted/10 transition-colors px-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.tenant?.fullName ?? "Staff"} · {format(c.createdAt, "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge meta={COMPLAINT_STATUS_META[c.status]} />
                      <StatusBadge
                        meta={COMPLAINT_PRIORITY_META[c.priority]}
                        className="text-muted-foreground"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
