import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowUpRight,
  ClipboardList,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { getActiveProperty } from "@/lib/property";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatINR } from "@/lib/money";
import type { PaymentStatus, ComplaintStatus, ComplaintPriority } from "@/generated/prisma/client";

import { DashboardCharts } from "./dashboard-charts";

export const metadata: Metadata = {
  title: "Dashboard",
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

  return (
    <div className="space-y-10">
      <PageHeader title="Dashboard" />

      {/* Renders the new charts component */}
      <DashboardCharts data={data} isFlat={isFlat} />

      {/* Recent Activity Grid */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments Card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="h-14 relative border-b border-border flex items-center justify-between px-5 py-3 bg-emerald-500/5">
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
          <div className="h-14 relative border-b border-border flex items-center justify-between px-5 py-3 bg-rose-500/5">
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
