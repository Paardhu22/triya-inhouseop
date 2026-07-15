import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FloorBoard } from "@/components/floor/floor-board";
import { FloorSelectors } from "@/components/floor/floor-selectors";
import { FloorBanner } from "@/components/floor/floor-banner";
import { PageHeader } from "@/components/shell/page-header";
import { getFloorLayout, getFloorNavigation } from "@/lib/queries/floor";
import { getActiveProperty } from "@/lib/property";

export const metadata: Metadata = {
  title: "Floor Manager",
};

function Legend() {
  return (
    <div className="flex items-center gap-5 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="size-3 rounded-full bg-available" />
        Beds available
      </span>
      <span className="flex items-center gap-2">
        <span className="size-3 rounded-full bg-[#f59e0b]" />
        Partially occupied
      </span>
      <span className="flex items-center gap-2">
        <span className="size-3 rounded-full bg-occupied" />
        Fully occupied
      </span>
    </div>
  );
}

export default async function FloorManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string; floor?: string }>;
}) {
  const property = await getActiveProperty();
  if (!property) redirect("/select-property");
  const propertyId = property.id;

  const nav = await getFloorNavigation(propertyId);
  const { block, floor } = await searchParams;

  let selectedBlockId: string | null = null;
  let selectedFloorId: string | null = null;

  if (nav.hasBlocks) {
    const selectedBlock = nav.blocks.find((b) => b.id === block) ?? nav.blocks[0] ?? null;
    selectedBlockId = selectedBlock?.id ?? null;
    const floorsOfBlock = selectedBlock?.floors ?? [];
    selectedFloorId =
      (floorsOfBlock.find((f) => f.id === floor) ?? floorsOfBlock[0])?.id ?? null;
  } else {
    selectedFloorId = (nav.floors.find((f) => f.id === floor) ?? nav.floors[0])?.id ?? null;
  }

  const floors = nav.hasBlocks
    ? (nav.blocks.find((b) => b.id === selectedBlockId)?.floors ?? [])
    : nav.floors;

  const activeFloor = floors.find((f) => f.id === selectedFloorId) ?? floors[0];
  const activeFloorNumber = activeFloor ? activeFloor.number : 1;
  const currentFloorIndex = activeFloor ? floors.indexOf(activeFloor) : 0;
  const totalFloors = floors.length;

  const rooms = selectedFloorId ? await getFloorLayout(selectedFloorId, propertyId) : [];

  return (
    <div className="relative space-y-6">
      {/* Extremely subtle premium gradient, scoped to this page only. */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: "radial-gradient(circle at top, #ffffff, #f6fff9 45%, #edf8ff 100%)",
        }}
      />
      <PageHeader title="Floor Manager" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FloorSelectors
          nav={nav}
          selectedBlockId={selectedBlockId}
          selectedFloorId={selectedFloorId}
        />
        <Legend />
      </div>
      <FloorBoard rooms={rooms} propertySlug={property.slug} />
      {/* Spacer to prevent fixed footer from covering content when scrolling */}
      <div style={{ height: "var(--banner-height)" }} />
      <FloorBanner 
        floorNumber={activeFloorNumber} 
        totalFloors={totalFloors} 
        currentFloorIndex={currentFloorIndex} 
      />
    </div>
  );
}
