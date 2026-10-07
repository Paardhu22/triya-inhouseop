import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  BED_VISUAL_STATUS_META,
  type BedVisualStatus,
} from "@/components/floor/bed-status";
import { FloorBoard } from "@/components/floor/floor-board";
import { FloorSelectors } from "@/components/floor/floor-selectors";
import { FloorBanner } from "@/components/floor/floor-banner";
import { PageHeader } from "@/components/shell/page-header";
import { getFloorLayout, getFloorNavigation } from "@/lib/queries/floor";
import { getActiveProperty } from "@/lib/property";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Floor Manager",
};

/**
 * The dots on a room tile are per-BED and carry that bed's payment state, not the
 * room's occupancy — so the legend is generated from BED_VISUAL_STATUS_META, the
 * very map `RoomCard` colours those dots with. Add a state there and it shows up
 * here on its own; the two can never drift apart.
 */
const LEGEND_ORDER: BedVisualStatus[] = ["paid", "pending", "overdue", "vacant"];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
      {LEGEND_ORDER.map((status) => (
        <span key={status} className="flex items-center gap-2">
          <span className={cn("size-3 rounded-full", BED_VISUAL_STATUS_META[status].dot)} />
          {BED_VISUAL_STATUS_META[status].label}
        </span>
      ))}
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

  const [session, nav] = await Promise.all([auth(), getFloorNavigation(propertyId)]);
  const canSetRent = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
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
      <PageHeader title="Floor Manager" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FloorSelectors
          nav={nav}
          selectedBlockId={selectedBlockId}
          selectedFloorId={selectedFloorId}
        />
        <Legend />
      </div>
      <FloorBoard rooms={rooms} propertySlug={property.slug} canSetRent={canSetRent} />
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
