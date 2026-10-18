import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PropertyStoreHydrator } from "@/components/shell/property-store-hydrator";
import { DesktopSidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getActiveProperty, listProperties } from "@/lib/property";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, property, properties] = await Promise.all([
    auth(),
    getActiveProperty(),
    listProperties(),
  ]);
  if (!session?.user) {
    redirect("/login");
  }

  if (!property) {
    redirect("/select-property");
  }
  return (
    <div className="min-h-screen bg-background">
      <DesktopSidebar role={session.user.role} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <Topbar
          property={{ id: property.id, name: property.name, city: property.city, logoKey: property.logoKey }}
          properties={properties.map((p) => ({
            id: p.id,
            name: p.name,
            city: p.city,
            logoKey: p.logoKey,
          }))}
          user={{
            name: session.user.name,
            email: session.user.email,
            role: session.user.role,
          }}
        />
        <main className="mx-auto w-full min-w-0 max-w-[1180px] flex-1 px-5 py-10 sm:px-8 lg:px-12 lg:py-12">
          {children}
        </main>
      </div>
      <PropertyStoreHydrator
        property={{
          id: property.id,
          name: property.name,
          slug: property.slug,
          hasBlocks: property.hasBlocks,
        }}
      />
    </div>
  );
}
