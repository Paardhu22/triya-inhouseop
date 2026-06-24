import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  Home,
  BedDouble,
  Percent,
  Coins,
  TrendingDown,
  Wallet,
  ClipboardList,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { getActiveProperty } from "@/lib/property";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatINR } from "@/lib/money";
import type { PaymentStatus, ComplaintStatus, ComplaintPriority } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Dashboard",
};

const paymentStatusColors: Record<PaymentStatus, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
};

const priorityColors: Record<ComplaintPriority, string> = {
  LOW: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  HIGH: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
};

const complaintStatusColors: Record<ComplaintStatus, string> = {
  OPEN: "bg-rose-500/10 text-rose-600 border border-rose-500/20",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  RESOLVED: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
};

export default async function DashboardPage() {
  const property = await getActiveProperty();
  if (!property) redirect("/select-property");

  const data = await getDashboardData(property.id);
  const isFlat = property.slug === "cozy-gowlidoddy";

  const totalUnits = isFlat ? data.totalRooms : data.totalBeds;
  const occupancyRate = totalUnits > 0 ? Math.round((data.occupiedBeds / totalUnits) * 100) : 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2">
        <PageHeader title="Dashboard" />
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="size-4 text-amber-500 animate-pulse" />
          Real-time overview of <span className="font-semibold text-foreground">{property.name}</span>
        </p>
      </div>

      {/* Capacity & Summary Stats */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* STAT 1: Capacity */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md border-l-4 border-l-blue-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{isFlat ? "Total Flats" : "Total Capacity"}</span>
              {isFlat ? <Home className="size-4 text-blue-500" /> : <BedDouble className="size-4 text-blue-500" />}
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {totalUnits}
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground font-medium">
            {isFlat ? (
              <span>Fully mapped residential units</span>
            ) : (
              <span>{data.totalRooms} configured rooms</span>
            )}
          </div>
        </div>

        {/* STAT 2: Occupancy Rate */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md border-l-4 border-l-purple-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Occupancy Rate</span>
              <Percent className="size-4 text-purple-500" />
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {occupancyRate}%
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
              <span>{data.occupiedBeds} Occupied</span>
              <span>{data.availableBeds} Available</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-purple-500/10 overflow-hidden">
              <div 
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* STAT 3: Monthly Income */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Collections (Month)</span>
              <Coins className="size-4 text-emerald-500" />
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {formatINR(data.monthlyCollections)}
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground flex items-center justify-between font-medium">
            <span>Active Payments:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              <CheckCircle2 className="size-3.5" />
              {data.paidCount} Paid
            </span>
          </div>
        </div>

        {/* STAT 4: Expenses */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md border-l-4 border-l-rose-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Expenses (Month)</span>
              <TrendingDown className="size-4 text-rose-500" />
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {formatINR(data.monthlyExpenses)}
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground flex items-center justify-between font-medium">
            <span>Pending collection:</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
              <AlertCircle className="size-3.5" />
              {data.pendingCount} Pending
            </span>
          </div>
        </div>
      </section>

      {/* Detailed Capacity Breakdown */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
          {isFlat ? "Flat Type Breakdown" : "Room Capacity Breakdown"}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isFlat
            ? data.blockBreakdown.map((b) => {
                const name =
                  b.name === "A"
                    ? "Block A (STUDIO)"
                    : b.name === "B"
                      ? "Block B (Premium)"
                      : b.name === "C"
                        ? "Block C (Hotel)"
                        : `Block ${b.name}`;
                const blockOccupancy = b.rooms > 0 ? Math.round((b.occupied / b.rooms) * 100) : 0;
                return (
                  <div
                    key={b.name}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between border-t-4 border-t-blue-500"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{name}</p>
                      <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                        {b.rooms} <span className="text-xs font-medium text-muted-foreground">Flats</span>
                      </p>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                        <span>{b.occupied} Occupied</span>
                        <span>{b.available} Available</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-blue-500/10 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${blockOccupancy}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            : data.sharingBreakdown.map((s) => {
                const sharingOccupancy = s.beds > 0 ? Math.round((s.occupied / s.beds) * 100) : 0;
                return (
                  <div
                    key={s.sharingType}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between border-t-4 border-t-purple-500"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.sharingType} Sharing</p>
                      <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                        {s.rooms} <span className="text-xs font-medium text-muted-foreground font-medium">Rooms</span>
                      </p>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                        <span>{s.occupied}/{s.beds} Beds Occupied</span>
                        <span>{s.available} Available</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-purple-500/10 overflow-hidden">
                        <div
                          className="h-full bg-purple-500 transition-all duration-500"
                          style={{ width: `${sharingOccupancy}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </section>

      {/* Recent Activity Grid */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Wallet className="size-4 text-emerald-500" />
                Recent Payments
              </h3>
              <span className="text-xs text-muted-foreground">Latest collections</span>
            </div>
            {data.recentPayments.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No recent payment transactions recorded.
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-sm p-1">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                        <ArrowUpRight className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{p.tenant.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(p.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 text-right">
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatINR(p.amount)}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${paymentStatusColors[p.status]}`}>
                        {p.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Complaints Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="size-4 text-rose-500" />
                Recent Complaints
              </h3>
              <span className="text-xs text-muted-foreground">Issue tracker</span>
            </div>
            {data.recentComplaints.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No active complaints reported.
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentComplaints.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 text-sm p-1">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mt-0.5">
                        <ClipboardList className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground truncate font-medium">
                          By {c.tenant?.fullName ?? "Staff"} · {format(new Date(c.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${priorityColors[c.priority]}`}>
                        {c.priority.toLowerCase()}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${complaintStatusColors[c.status]}`}>
                        {c.status.replace("_", " ").toLowerCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
