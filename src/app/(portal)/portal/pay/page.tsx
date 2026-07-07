import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { auth } from "@/auth";
import { PageHeader } from "@/components/shell/page-header";
import { AdvancePayButton, PayNowButton } from "@/components/portal/pay-now-button";
import { formatINR } from "@/lib/money";
import { getTenantByUserId, hasDepositPayment } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Pay Now" };

export default async function PortalPayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getTenantByUserId(session.user.id);
  if (!tenant) redirect("/login");

  const tenancy = tenant.tenancies[0];
  const amount = tenancy ? tenancy.monthlyRent + tenancy.maintenanceCharge : 0;
  const depositAmount = tenancy?.securityDeposit ?? null;
  const depositPaid = tenancy && depositAmount ? await hasDepositPayment(tenancy.id) : false;

  const contact = { userName: tenant.fullName, userEmail: tenant.email, userPhone: tenant.phone };

  return (
    <div className="space-y-8">
      <PageHeader title="Pay Now" description="Pay your rent and advance online via Razorpay." />

      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This month&apos;s rent</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">{formatINR(amount)}</p>
        <div className="mt-6">
          <PayNowButton {...contact} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          You&apos;ll be redirected to Razorpay&apos;s secure checkout.
        </p>
      </div>

      {depositAmount ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Advance (security deposit)</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatINR(depositAmount)}</p>
          <div className="mt-6">
            {depositPaid ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-available">
                <CheckCircle2 className="size-4" />
                Advance paid
              </span>
            ) : (
              <AdvancePayButton {...contact} />
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {depositPaid
              ? "Refundable per your tenancy terms when you vacate with proper notice."
              : "A one-time payment, separate from your monthly rent."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
