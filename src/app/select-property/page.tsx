import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PropertyPicker } from "@/components/property/property-picker";
import { listProperties } from "@/lib/property";

export const metadata: Metadata = {
  title: "Select property",
};

export default async function SelectPropertyPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const properties = await listProperties();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Select a property</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which PG you want to manage. You can switch anytime from the top bar.
          </p>
        </div>
        {properties.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            No properties have been configured yet.
          </p>
        ) : (
          <PropertyPicker properties={properties} />
        )}
      </div>
    </div>
  );
}
