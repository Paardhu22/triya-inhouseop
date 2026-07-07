import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PageHeader } from "@/components/shell/page-header";
import { PayNowButton } from "@/components/portal/pay-now-button";
import { formatINR } from "@/lib/money";
import { getTenantByUserId } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Pay Now" };

export default async function PortalPayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getTenantByUserId(session.user.id);
  if (!tenant) redirect("/login");

  const tenancy = tenant.tenancies[0];
  const amount = tenancy ? tenancy.monthlyRent + tenancy.maintenanceCharge : 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Pay Now" description="Online payments via Razorpay — coming soon." />
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This month&apos;s rent</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">{formatINR(amount)}</p>
        <div className="mt-6">
          <PayNowButton />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Online payments aren&apos;t live yet. Please pay your manager by cash until then.
        </p>
      </div>
    </div>
  );
}
