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
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description={`Occupancy and rent for ${property.name} as at ${format(new Date(), "d MMMM yyyy")}.`}
      />

      {/* Capacity */}
      <section className="space-y-4">
        <h2 className={heading}>Capacity</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label={isFlat ? "Total flats" : "Total beds"}
            value={data.totalBeds}
            hint={`across ${data.totalRooms} ${isFlat ? "units" : "rooms"}`}
          />
          <StatCard
            label="Occupied"
            value={data.occupiedBeds}
            hint={`${occupancyRate}% of capacity`}
          />
          <StatCard
            label="Available"
            value={data.availableBeds}
            hint={`${unitLabel} ready to fill`}
          />
          <StatCard
            label={isFlat ? "Units let" : "Rooms full"}
            value={`${data.fullRooms}/${data.totalRooms}`}
            hint={`${data.partialRooms} part filled · ${data.emptyRooms} empty`}
          />
        </div>
      </section>

      {/* Rent */}
      <section className="space-y-4">
        <h2 className={heading}>Rent · {format(data.monthStart, "MMMM yyyy")}</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Expected"
            value={formatINRCompact(data.expectedPaise)}
            hint={`${data.activeTenancies} active ${data.activeTenancies === 1 ? "tenancy" : "tenancies"}`}
          />
          <StatCard
            label="Collected"
            value={formatINRCompact(data.collectedPaise)}
            hint={`${collectionRate}% of expected`}
          />
          <StatCard
            label="Outstanding"
            value={formatINRCompact(data.outstandingPaise)}
            hint={`${data.unpaidCount} unpaid · ${data.partialCount} part paid · ${data.overdueCount} overdue`}
          />
          <StatCard
            label="Expenses"
            value={formatINRCompact(data.expensesPaise)}
            hint={`net ${formatINRCompact(data.netPaise)} this month`}
          />
        </div>
      </section>

      <SharingOccupancyPanel rows={data.sharingBreakdown} isFlat={isFlat} />

      <MoneyTrendPanel trend={data.trend} />

      {/* Two or more blocks — with one there is nothing to compare against. */}
      {hasBlocks && data.blockBreakdown.length > 1 ? (
        <BlockOccupancyPanel rows={data.blockBreakdown} />
      ) : null}

      {/* Floor-by-floor detail */}
      <section className={panel}>
        <h2 className={heading}>Occupancy by floor</h2>
        {data.floorBreakdown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No floors configured for this property yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
                  <th className="py-2 pr-4">Floor</th>
                  <th className="py-2 pr-4 text-right">
                    {isFlat ? "Flats" : "Rooms"}
                  </th>
                  <th className="py-2 pr-4 text-right">
                    {isFlat ? "Units" : "Beds"}
                  </th>
                  <th className="py-2 pr-4 text-right">Occupied</th>
                  <th className="py-2 pr-4 text-right">Available</th>
                  <th className="py-2 text-right">Fill</th>
                </tr>
              </thead>
              <tbody>
                {data.floorBreakdown.map((f) => {
                  const fill = f.beds > 0 ? Math.round((f.occupied / f.beds) * 100) : 0;
                  return (
                    <tr key={f.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-semibold text-foreground">
                        {f.blockName ? `Block ${f.blockName} · ` : ""}
                        {f.name ?? `Floor ${f.number}`}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{f.rooms}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{f.beds}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{f.occupied}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium text-foreground">
                        {f.available}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {fill}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rent status */}
        <section className={panel}>
          <h2 className={heading}>Rent status</h2>
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
          <div className="grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
            <div>
              <div className="text-xl font-bold tabular-nums">{data.moveInsThisMonth}</div>
              <div className="text-xs text-muted-foreground">moved in</div>
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums">{data.moveOutsThisMonth}</div>
              <div className="text-xs text-muted-foreground">moved out</div>
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums">{data.openComplaints}</div>
              <div className="text-xs text-muted-foreground">open complaints</div>
            </div>
          </div>
        </section>

        {/* Vacating soon */}
        <section className={panel}>
          <h2 className={heading}>On notice</h2>
          {data.noticeTenancies.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nobody has given notice.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.noticeTenancies.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isFlat
                        ? `Flat ${t.roomNumber}`
                        : `Room ${t.roomNumber} · Bed ${t.bedLabel}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-foreground">
                      {format(vacateByDate(t.noticeGivenDate), "d MMM")}
                    </p>
                    <p className="text-xs text-muted-foreground">vacate by</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent payments */}
        <section className={panel}>
          <h2 className={heading}>Recent payments</h2>
          {data.recentPayments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {p.tenant.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(p.createdAt, "d MMM yyyy")} · {PAYMENT_METHOD_META[p.method].label}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {formatINR(p.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent complaints */}
        <section className={panel}>
          <h2 className={heading}>Recent complaints</h2>
          {data.recentComplaints.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No complaints raised yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.recentComplaints.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
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
        </section>
      </div>
    </div>
  );
}
