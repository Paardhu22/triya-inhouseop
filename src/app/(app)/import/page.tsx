import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ImportClient } from "@/components/import/import-client";
import { PageHeader } from "@/components/shell/page-header";
import { getActiveProperty } from "@/lib/property";

export const metadata: Metadata = { title: "Import Data" };

export default async function ImportPage() {
  const [session, property] = await Promise.all([auth(), getActiveProperty()]);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (!property) redirect("/select-property");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import Data"
        description={`Bring existing records into ${property.name} from a spreadsheet. Upload a CSV or Excel file, or paste cells straight out of Excel — you choose which column means what before anything is saved.`}
      />
      <ImportClient propertyName={property.name} isFlat={property.isFlat} />
    </div>
  );
}
