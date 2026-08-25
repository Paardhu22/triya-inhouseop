import type { Metadata } from "next";

import { auth } from "@/auth";
import { CollectionsClient } from "@/components/collections/collections-client";
import { RemindEveryoneButton } from "@/components/collections/remind-everyone-button";
import { PageHeader } from "@/components/shell/page-header";
import { getCollectionsData } from "@/lib/queries/collections";
import { getInvoiceHistory } from "@/lib/queries/invoices";
import { requireActiveProperty } from "@/lib/property";

export const metadata: Metadata = {
  title: "Collections",
};

export default async function CollectionsPage() {
  const property = await requireActiveProperty();
  const [session, rows, invoices] = await Promise.all([
    auth(),
    getCollectionsData(property.id),
    getInvoiceHistory(property.id),
  ]);
  const role = session?.user?.role;
  const canDelete = role === "ADMIN" || role === "MANAGER";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collections"
        description="Rent and maintenance dues for every active tenant in this property."
        actions={<RemindEveryoneButton />}
      />
      <CollectionsClient rows={rows} invoices={invoices} canDelete={canDelete} />
    </div>
  );
}
