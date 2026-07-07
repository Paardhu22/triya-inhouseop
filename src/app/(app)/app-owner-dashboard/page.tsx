import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, ShieldCheck, TrendingUp, Users } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { MonthlyGrowthChart } from "@/components/admin/monthly-growth-chart";
import { auth } from "@/auth";
import { getAppOwnerDashboardData } from "@/lib/queries/app-owner-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AppOwnerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "APP_OWNER") redirect("/dashboard");

  const data = await getAppOwnerDashboardData();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Platform-wide view across every Property Owner and property on DAZZ."
      />

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-4" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">
              Property owners
            </span>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums">{data.totalOwners}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.activeOwners} active</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="size-4" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">
              Properties
            </span>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums">{data.totalProperties}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.activeProperties} active</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">
              Users
            </span>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums">
            {data.totalManagers + data.totalTenants}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.totalManagers} managers · {data.totalTenants} tenants
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="size-4" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">
              Occupancy
            </span>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums">{data.occupancyRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.occupiedBeds}/{data.totalBeds} beds occupied
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            &gt; Property owner growth (6 months)
          </h3>
          <div className="mt-6">
            <MonthlyGrowthChart data={data.ownerGrowth} hue="blue" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            &gt; Property growth (6 months)
          </h3>
          <div className="mt-6">
            <MonthlyGrowthChart data={data.propertyGrowth} hue="emerald" />
          </div>
        </div>
      </section>
    </div>
  );
}
