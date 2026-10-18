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
import { getFloorLayout, getFloorNavigation } from "@/lib/queries/floor";
import { getActiveProperty } from "@/lib/property";
import { cn } from "@/lib/utils";
import styles from "@/components/floor/floor-plan.module.css";

export const metadata: Metadata = {
  title: "Floor Manager",
};

/**
 * The floor plan and legend share the same per-bed payment status colors.
 */
const LEGEND_ORDER: BedVisualStatus[] = ["paid", "pending", "overdue", "vacant"];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Bed payment status legend">
      {LEGEND_ORDER.map((status) => (
        <span key={status} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-2 rounded-full", BED_VISUAL_STATUS_META[status].dot)} />
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
    <div className={styles.page}>
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Floor Manager<span aria-hidden="true" className="text-primary">.</span></h1>
        <p className="mt-1 text-xs text-muted-foreground">Your floor at a glance. Select a room or bed to manage it.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <FloorSelectors
          nav={nav}
          selectedBlockId={selectedBlockId}
          selectedFloorId={selectedFloorId}
        />
        <Legend />
      </div>
      <FloorBoard key={selectedFloorId} rooms={rooms} propertySlug={property.slug} canSetRent={canSetRent} floorLabel={activeFloor?.name ?? `Floor ${activeFloorNumber}`} />
      <FloorBanner 
        floorNumber={activeFloorNumber} 
        totalFloors={totalFloors} 
        currentFloorIndex={currentFloorIndex} 
      />
    </div>
  );
}
