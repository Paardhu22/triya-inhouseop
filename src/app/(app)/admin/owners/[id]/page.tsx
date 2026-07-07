import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Building2, ClipboardList, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ViewPropertyButton } from "@/components/admin/view-property-button";
import { PageHeader } from "@/components/shell/page-header";
import { auth } from "@/auth";
import { formatINR } from "@/lib/money";
import { getPropertyOwnerDetail } from "@/lib/queries/property-owners";
import { getDashboardData } from "@/lib/queries/dashboard";

export const metadata: Metadata = { title: "Property owner" };

export default async function PropertyOwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "APP_OWNER") redirect("/dashboard");

  const { id } = await params;
  const owner = await getPropertyOwnerDetail(id);
  if (!owner) notFound();

  const properties = await Promise.all(
    owner.ownedProperties.map(async ({ property }) => ({
      property,
      data: await getDashboardData(property.id),
    })),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        App Owner Console
      </Link>

      <PageHeader
        title={owner.name}
        description={`${owner.email}${owner.phone ? ` · ${owner.phone}` : ""} · Owner since ${format(
          new Date(owner.createdAt),
          "dd MMM yyyy",
        )}`}
        actions={
          !owner.isActive ? <Badge variant="secondary">Inactive</Badge> : <Badge>Active</Badge>
        }
      />

      {properties.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          This owner has no properties assigned yet.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {properties.map(({ property, data }) => {
            const occupancyRate =
              data.totalBeds > 0 ? Math.round((data.occupiedBeds / data.totalBeds) * 100) : 0;
            return (
              <div
                key={property.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                      <p className="truncate font-semibold">{property.name}</p>
                      {!property.isActive ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{property.city}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-bold tabular-nums">{occupancyRate}%</p>
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">
                      occupied
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Rooms / Beds</dt>
                    <dd className="font-medium tabular-nums">
                      {property._count.floors} floors · {data.totalRooms} rooms ·{" "}
                      {data.totalBeds} beds
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Tenants</dt>
                    <dd className="flex items-center gap-1 font-medium tabular-nums">
                      <Users className="size-3.5 text-muted-foreground" />
                      {property._count.tenants}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Collections (month)</dt>
                    <dd className="font-medium tabular-nums">{formatINR(data.monthlyCollections)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Expenses (month)</dt>
                    <dd className="font-medium tabular-nums">{formatINR(data.monthlyExpenses)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Payments</dt>
                    <dd className="font-medium tabular-nums">
                      {data.paidCount} paid · {data.pendingCount} pending
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Open complaints</dt>
                    <dd className="flex items-center gap-1 font-medium tabular-nums">
                      <ClipboardList className="size-3.5 text-muted-foreground" />
                      {data.recentComplaints.filter((c) => c.status !== "RESOLVED").length}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t pt-4">
                  <ViewPropertyButton propertyId={property.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
