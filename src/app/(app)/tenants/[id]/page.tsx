import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, FileText, Phone, User } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { formatINR } from "@/lib/money";
import { getSelectedPropertyId } from "@/lib/property";
import { getTenantProfile, type TenantProfile } from "@/lib/queries/tenants";
import { COMPLAINT_STATUS_META, PAYMENT_STATUS_META } from "@/lib/status";

export const metadata: Metadata = {
  title: "Tenant profile",
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

function tenancyPeriod(t: TenantProfile["tenancies"][number]) {
  const start = format(t.checkInDate, "dd MMM yyyy");
  const end = t.checkOutDate ? format(t.checkOutDate, "dd MMM yyyy") : "Present";
  return `${start} – ${end}`;
}

function paymentMethodLabel(method: TenantProfile["payments"][number]["method"]) {
  return method.replace(/_/g, " ").toLowerCase();
}

export default async function TenantProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

  const { id } = await params;
  const tenant = await getTenantProfile(id, propertyId);
  if (!tenant) notFound();

  const active = tenant.tenancies.find((t) => t.status === "ACTIVE");
  const hasKyc = Boolean(
    tenant.fatherName ||
      tenant.motherName ||
      tenant.emergencyContact ||
      tenant.address ||
      tenant.aadhaarNumber ||
      tenant.panNumber ||
      tenant.college ||
      tenant.company ||
      tenant.occupation ||
      tenant.notes,
  );

  return (
    <div className="space-y-5">
      <Link
        href="/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to tenants
      </Link>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
        {tenant.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${tenant.photoUrl}`}
            alt={tenant.fullName}
            className="size-16 rounded-xl border border-border object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <User className="size-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-xl font-bold tracking-tight">{tenant.fullName}</h1>
            {active ? (
              <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-foreground">
                <span className="size-1.5 rounded-full bg-available" />
                Current
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">Past</span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <Phone className="size-3.5" />
            {tenant.phone}
          </p>
          {active ? (
            <p className="text-sm text-muted-foreground">
              Room {active.bed.room.number} · Bed {active.bed.label} · {formatINR(active.monthlyRent)}/mo
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="KYC & personal details">
          {hasKyc ? (
            <div className="divide-y">
              <InfoRow label="Father's name" value={tenant.fatherName} />
              <InfoRow label="Mother's name" value={tenant.motherName} />
              <InfoRow label="Emergency contact" value={tenant.emergencyContact} />
              <InfoRow label="Aadhaar" value={tenant.aadhaarNumber} />
              <InfoRow label="PAN" value={tenant.panNumber} />
              <InfoRow label="Occupation" value={tenant.occupation} />
              <InfoRow label="College" value={tenant.college} />
              <InfoRow label="Company" value={tenant.company} />
              <InfoRow label="Address" value={tenant.address} />
              <InfoRow label="Notes" value={tenant.notes} />
            </div>
          ) : (
            <Empty label="No additional KYC details captured yet." />
          )}
        </SectionCard>

        <SectionCard title="Stay history">
          {tenant.tenancies.length === 0 ? (
            <Empty label="No stays recorded." />
          ) : (
            <div className="space-y-2">
              {tenant.tenancies.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Room {t.bed.room.number} · Bed {t.bed.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{tenancyPeriod(t)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{formatINR(t.monthlyRent)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.status === "ACTIVE" ? "Active" : "Ended"}
                    </p>
                  </div>
                  <div className="sr-only">
                    {t.securityDeposit ? `Security deposit ${formatINR(t.securityDeposit)}. ` : ""}
                    {t.paymentDueDay ? `Payment due on day ${t.paymentDueDay}. ` : ""}
                    {t.expectedLeavingDate
                      ? `Expected leaving ${format(t.expectedLeavingDate, "dd MMM yyyy")}.`
                      : ""}
                  </div>
                </div>
              ))}
              {active ? (
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>
                    Deposit: {active.securityDeposit ? formatINR(active.securityDeposit) : "Not set"}
                  </span>
                  <span>Rent due: {active.paymentDueDay ? `Day ${active.paymentDueDay}` : "Not set"}</span>
                  <span>
                    Leaving: {active.expectedLeavingDate ? format(active.expectedLeavingDate, "dd MMM yyyy") : "Not set"}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Payment history">
          {tenant.payments.length === 0 ? (
            <Empty label="No payments recorded." />
          ) : (
            <div className="divide-y">
              {tenant.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{format(p.forMonth, "MMMM yyyy")}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.paidAt
                        ? `Paid ${format(p.paidAt, "dd MMM")} by ${paymentMethodLabel(p.method)}`
                        : "Not paid"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{formatINR(p.amount)}</span>
                    <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Documents">
          {tenant.documents.length === 0 ? (
            <Empty label="No documents uploaded." />
          ) : (
            <div className="space-y-2">
              {tenant.documents.map((d) => (
                <a
                  key={d.id}
                  href={`/api/files/${d.storageKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/50"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.type.replace(/_/g, " ").toLowerCase()}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Complaints">
          {tenant.complaints.length === 0 ? (
            <Empty label="No complaints linked to this tenant." />
          ) : (
            <div className="space-y-2">
              {tenant.complaints.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(c.createdAt, "dd MMM yyyy")}
                    </p>
                  </div>
                  <StatusBadge meta={COMPLAINT_STATUS_META[c.status]} dot />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
