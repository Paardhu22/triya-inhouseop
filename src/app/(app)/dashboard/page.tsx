import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { StatusBadge } from "@/components/common/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
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

const panel = "space-y-4 rounded-xl border border-border bg-card p-6";
const heading = "text-[0.8rem] font-bold tracking-[0.08em] text-muted-foreground uppercase";

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
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={`Occupancy and rent for ${property.name} as at ${format(new Date(), "d MMMM yyyy")}.`}
      />

      {/* 01 / Capacity Overview */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
            01 / Capacity Overview
          </h2>
          <span className="text-xs font-mono text-muted-foreground">
            {data.totalRooms} {isFlat ? "Units" : "Rooms"} Total
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y border border-border bg-card rounded-lg overflow-hidden lg:grid-cols-4 lg:divide-y-0">
          <StatCard
            label={isFlat ? "Total Flats" : "Total Beds"}
            value={data.totalBeds}
            hint={`Across ${data.totalRooms} ${isFlat ? "units" : "rooms"}`}
          />
          <StatCard
            label="Occupied"
            value={data.occupiedBeds}
            hint={`${occupancyRate}% of capacity filled`}
          />
          <StatCard
            label="Available"
            value={data.availableBeds}
            hint={`${unitLabel} ready to move in`}
          />
          <StatCard
            label={isFlat ? "Units Let" : "Rooms Full"}
            value={`${data.fullRooms}/${data.totalRooms}`}
            hint={`${data.partialRooms} part filled · ${data.emptyRooms} empty`}
          />
        </div>
      </section>

      {/* 02 / Rent & Financial Ledger */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
            02 / Financial Ledger · {format(data.monthStart, "MMMM yyyy")}
          </h2>
          <span className="text-xs font-mono text-muted-foreground">
            {collectionRate}% Realization Rate
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y border border-border bg-card rounded-lg overflow-hidden lg:grid-cols-4 lg:divide-y-0">
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
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-3">
          <h2 className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
            05 / Floor Occupancy Directory
          </h2>
          <span className="text-xs font-mono text-muted-foreground">
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
                <tr className="border-b border-border bg-muted/15 text-left text-[0.7rem] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                  <th className="px-5 py-2.5">Floor</th>
                  <th className="px-5 py-2.5 text-right">
                    {isFlat ? "Flats" : "Rooms"}
                  </th>
                  <th className="px-5 py-2.5 text-right">
                    {isFlat ? "Units" : "Beds"}
                  </th>
                  <th className="px-5 py-2.5 text-right">Occupied</th>
                  <th className="px-5 py-2.5 text-right">Available</th>
                  <th className="px-5 py-2.5 text-right">Fill Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.floorBreakdown.map((f) => {
                  const fill = f.beds > 0 ? Math.round((f.occupied / f.beds) * 100) : 0;
                  return (
                    <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-2.5 font-medium text-foreground">
                        {f.blockName ? `Block ${f.blockName} · ` : ""}
                        {f.name ?? `Floor ${f.number}`}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{f.rooms}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{f.beds}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-medium text-foreground">{f.occupied}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-medium text-foreground">
                        {f.available}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-10 text-right">{fill}%</span>
                          <span className="inline-block h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                            <span
                              className="block h-full bg-foreground/60 rounded-full"
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
      <div className="grid lg:grid-cols-2 rounded-lg border border-border bg-card overflow-hidden divide-y lg:divide-y-0 lg:divide-x">
        {/* Rent status */}
        <section className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
              <h2 className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
                06 / Rent Settlement Status
              </h2>
              <span className="text-xs font-mono text-muted-foreground">
                {data.activeTenancies} Tenancies
              </span>
            </div>
            <div className="p-5">
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
                      <span className="text-xs font-normal text-muted-foreground font-mono">
                        {count === 1 ? "tenancy" : "tenancies"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x border-t border-border bg-muted/10 text-center py-3.5 text-sm">
            <div>
              <div className="text-lg font-bold tabular-nums text-foreground">{data.moveInsThisMonth}</div>
              <div className="text-[0.7rem] font-mono text-muted-foreground uppercase tracking-wider">Moved in</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums text-foreground">{data.moveOutsThisMonth}</div>
              <div className="text-[0.7rem] font-mono text-muted-foreground uppercase tracking-wider">Moved out</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums text-foreground">{data.openComplaints}</div>
              <div className="text-[0.7rem] font-mono text-muted-foreground uppercase tracking-wider">Complaints</div>
            </div>
          </div>
        </section>

        {/* Vacating soon */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
            <h2 className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
              07 / Notice Register
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              {data.noticeTenancies.length} Scheduled
            </span>
          </div>
          <div className="p-5 flex-1">
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
                      <p className="text-xs font-mono text-muted-foreground">
                        {isFlat
                          ? `Flat ${t.roomNumber}`
                          : `Room ${t.roomNumber} · Bed ${t.bedLabel}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {format(vacateByDate(t.noticeGivenDate), "d MMM yyyy")}
                      </p>
                      <p className="text-[0.7rem] font-mono text-muted-foreground uppercase tracking-wider">Vacate by</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 08 & 09 / Live Activity Log */}
      <div className="grid lg:grid-cols-2 rounded-lg border border-border bg-card overflow-hidden divide-y lg:divide-y-0 lg:divide-x">
        {/* Recent payments */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
            <h2 className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
              08 / Recent Collections
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              Latest 5 Transactions
            </span>
          </div>
          <div className="p-5 flex-1">
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
                      <p className="text-xs font-mono text-muted-foreground">
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
        <section className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
            <h2 className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
              09 / Incident & Complaints Log
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              Latest 5 Tickets
            </span>
          </div>
          <div className="p-5 flex-1">
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
                      <p className="text-xs font-mono text-muted-foreground">
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
