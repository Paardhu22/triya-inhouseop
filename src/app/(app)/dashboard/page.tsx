import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  Sparkles,
  ArrowUpRight,
  ClipboardList,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { getActiveProperty } from "@/lib/property";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatINR } from "@/lib/money";
import type { PaymentStatus, ComplaintStatus, ComplaintPriority } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Grid Backgrounds matching the blueprint styling from reference but for white/light theme
const blueGridStyle = {
  backgroundSize: "14px 14px",
  backgroundImage: `
    linear-gradient(to right, rgba(14, 165, 233, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(14, 165, 233, 0.08) 1px, transparent 1px)
  `,
  backgroundColor: "rgba(14, 165, 233, 0.015)",
};

const purpleGridStyle = {
  backgroundSize: "14px 14px",
  backgroundImage: `
    linear-gradient(to right, rgba(168, 85, 247, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(168, 85, 247, 0.08) 1px, transparent 1px)
  `,
  backgroundColor: "rgba(168, 85, 247, 0.015)",
};

const emeraldGridStyle = {
  backgroundSize: "14px 14px",
  backgroundImage: `
    linear-gradient(to right, rgba(16, 185, 129, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(16, 185, 129, 0.08) 1px, transparent 1px)
  `,
  backgroundColor: "rgba(16, 185, 129, 0.015)",
};

const roseGridStyle = {
  backgroundSize: "14px 14px",
  backgroundImage: `
    linear-gradient(to right, rgba(244, 63, 94, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(244, 63, 94, 0.08) 1px, transparent 1px)
  `,
  backgroundColor: "rgba(244, 63, 94, 0.015)",
};

const paymentStatusColors: Record<PaymentStatus, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono",
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono",
  OVERDUE: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-mono",
};

const priorityColors: Record<ComplaintPriority, string> = {
  LOW: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-mono",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono",
  HIGH: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-mono",
};

const complaintStatusColors: Record<ComplaintStatus, string> = {
  OPEN: "bg-rose-500/10 text-rose-600 border border-rose-500/20 font-mono",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600 border border-amber-500/20 font-mono",
  RESOLVED: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono",
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
      <PageHeader title="Dashboard" />

      {/* Capacity & Summary Stats */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* STAT 1: Capacity */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="h-32 relative border-b border-border flex items-center justify-center p-4" style={blueGridStyle}>
            <span className="absolute top-3 right-3 text-[9px] font-mono tracking-wider text-muted-foreground/60">FIG.01</span>
            <div className="text-4xl font-black tracking-tight text-foreground tabular-nums">
              {totalUnits}
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                &gt; {isFlat ? "TOTAL FLATS" : "TOTAL CAPACITY"}
              </h3>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                Active units in this property: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{isFlat ? `${totalUnits} flats` : `${data.totalRooms} rooms`}</code>.
              </p>
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
              <span>status = &quot;active&quot;</span>
              <div className="flex items-center gap-1">
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </div>
            </div>
          </div>
        </div>

        {/* STAT 2: Occupancy Rate */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="h-32 relative border-b border-border flex flex-col items-center justify-center p-4" style={purpleGridStyle}>
            <span className="absolute top-3 right-3 text-[9px] font-mono tracking-wider text-muted-foreground/60">FIG.02</span>
            <div className="text-4xl font-black tracking-tight text-foreground tabular-nums">
              {occupancyRate}%
            </div>
            <div className="absolute bottom-4 left-4 right-4 h-1.5 rounded-full bg-purple-500/10 overflow-hidden">
              <div 
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                &gt; OCCUPANCY STATUS
              </h3>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                Active tenancy breakdown: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{data.occupiedBeds} occupied</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{data.availableBeds} vacant</code>.
              </p>
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
              <span>rate = &quot;{occupancyRate}%&quot;</span>
              <div className="flex items-center gap-1">
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </div>
            </div>
          </div>
        </div>

        {/* STAT 3: Monthly Income */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="h-32 relative border-b border-border flex items-center justify-center p-4" style={emeraldGridStyle}>
            <span className="absolute top-3 right-3 text-[9px] font-mono tracking-wider text-muted-foreground/60">FIG.03</span>
            <div className="text-3xl font-black tracking-tight text-foreground tabular-nums">
              {formatINR(data.monthlyCollections)}
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                &gt; COLLECTIONS (MONTH)
              </h3>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                Summary of active contracts: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{data.paidCount} paid</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{data.pendingCount} unpaid</code>.
              </p>
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
              <span>revenue = &quot;PAID&quot;</span>
              <div className="flex items-center gap-1">
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </div>
            </div>
          </div>
        </div>

        {/* STAT 4: Expenses */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="h-32 relative border-b border-border flex items-center justify-center p-4" style={roseGridStyle}>
            <span className="absolute top-3 right-3 text-[9px] font-mono tracking-wider text-muted-foreground/60">FIG.04</span>
            <div className="text-3xl font-black tracking-tight text-foreground tabular-nums">
              {formatINR(data.monthlyExpenses)}
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                &gt; EXPENSES (MONTH)
              </h3>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                Total operational costs: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{formatINR(data.monthlyExpenses)}</code> debited.
              </p>
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
              <span>outflow = &quot;DEBIT&quot;</span>
              <div className="flex items-center gap-1">
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Capacity Breakdown */}
      <section className="space-y-4">
        <h2 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
          &gt; {isFlat ? "FLAT TYPE BREAKDOWN" : "ROOM CAPACITY BREAKDOWN"}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isFlat
            ? data.blockBreakdown.map((b, idx) => {
                const name =
                  b.name === "A"
                    ? "Block A (STUDIO)"
                    : b.name === "B"
                      ? "Block B (Premium)"
                      : b.name === "C"
                        ? "Block C (Hotel)"
                        : `Block ${b.name}`;
                const blockOccupancy = b.rooms > 0 ? Math.round((b.occupied / b.rooms) * 100) : 0;
                const figure = `FIG.0${5 + idx}`;
                return (
                  <div
                    key={b.name}
                    className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div className="h-28 relative border-b border-border flex flex-col items-center justify-center p-4" style={blueGridStyle}>
                      <span className="absolute top-3 right-3 text-[9px] font-mono tracking-wider text-muted-foreground/60">{figure}</span>
                      <div className="text-3xl font-black tracking-tight text-foreground tabular-nums">
                        {b.rooms}
                      </div>
                      <div className="absolute bottom-3 left-4 right-4 h-1 rounded-full bg-blue-500/10 overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${blockOccupancy}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                          &gt; {name}
                        </h3>
                        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed font-medium">
                          Status: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{b.occupied} occupied</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{b.available} available</code>.
                        </p>
                      </div>
                      <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
                        <span>block = &quot;{b.name.toLowerCase()}&quot;</span>
                        <div className="flex items-center gap-1">
                          <span className="size-1 rounded-full bg-muted-foreground/30" />
                          <span className="size-1 rounded-full bg-muted-foreground/30" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            : data.sharingBreakdown.map((s, idx) => {
                const sharingOccupancy = s.beds > 0 ? Math.round((s.occupied / s.beds) * 100) : 0;
                const figure = `FIG.0${5 + idx}`;
                return (
                  <div
                    key={s.sharingType}
                    className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div className="h-28 relative border-b border-border flex flex-col items-center justify-center p-4" style={purpleGridStyle}>
                      <span className="absolute top-3 right-3 text-[9px] font-mono tracking-wider text-muted-foreground/60">{figure}</span>
                      <div className="text-3xl font-black tracking-tight text-foreground tabular-nums">
                        {s.rooms}
                      </div>
                      <div className="absolute bottom-3 left-4 right-4 h-1 rounded-full bg-purple-500/10 overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 transition-all duration-500"
                          style={{ width: `${sharingOccupancy}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h3 className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase">
                          &gt; {s.sharingType} SHARING ROOMS
                        </h3>
                        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed font-medium">
                          Beds capacity: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{s.occupied}/{s.beds} occupied</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-foreground">{s.available} vacant</code>.
                        </p>
                      </div>
                      <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
                        <span>sharing = &quot;{s.sharingType}p&quot;</span>
                        <div className="flex items-center gap-1">
                          <span className="size-1 rounded-full bg-muted-foreground/30" />
                          <span className="size-1 rounded-full bg-muted-foreground/30" />
                        </div>
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
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="h-14 relative border-b border-border flex items-center justify-between px-5 py-3" style={emeraldGridStyle}>
            <h3 className="text-[11px] font-mono font-bold tracking-wider text-foreground uppercase">
              &gt; RECENT PAYMENTS
            </h3>
            <span className="text-[9px] font-mono tracking-wider text-muted-foreground/60">FIG.08</span>
          </div>
          <div className="p-5 flex-1 flex flex-col justify-between min-h-[300px]">
            {data.recentPayments.length === 0 ? (
              <div className="py-20 text-center text-xs font-mono text-muted-foreground">
                No recent payment transactions found.
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-xs p-1">
                    <div className="flex items-center gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <ArrowUpRight className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{p.tenant.fullName}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {format(new Date(p.createdAt), "dd.MM.yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 text-right">
                      <span className="font-mono font-bold text-foreground tabular-nums">
                        {formatINR(p.amount)}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-[9px] font-bold border ${paymentStatusColors[p.status]}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50 mt-4">
              <span>transaction = &quot;all&quot;</span>
              <span>type = &quot;payment&quot;</span>
            </div>
          </div>
        </div>

        {/* Recent Complaints Card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="h-14 relative border-b border-border flex items-center justify-between px-5 py-3" style={roseGridStyle}>
            <h3 className="text-[11px] font-mono font-bold tracking-wider text-foreground uppercase">
              &gt; RECENT COMPLAINTS
            </h3>
            <span className="text-[9px] font-mono tracking-wider text-muted-foreground/60">FIG.09</span>
          </div>
          <div className="p-5 flex-1 flex flex-col justify-between min-h-[300px]">
            {data.recentComplaints.length === 0 ? (
              <div className="py-20 text-center text-xs font-mono text-muted-foreground">
                No active complaints reported.
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentComplaints.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 text-xs p-1">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 mt-0.5">
                        <ClipboardList className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{c.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          By {c.tenant?.fullName ?? "Staff"} · <span className="font-mono text-[9px]">{format(new Date(c.createdAt), "dd.MM.yyyy")}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold border ${priorityColors[c.priority]}`}>
                        {c.priority}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold border ${complaintStatusColors[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground/50 mt-4">
              <span>tickets = &quot;open&quot;</span>
              <span>type = &quot;complaint&quot;</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
