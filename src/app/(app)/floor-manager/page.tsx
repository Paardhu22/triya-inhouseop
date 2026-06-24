import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FloorBoard } from "@/components/floor/floor-board";
import { FloorSelectors } from "@/components/floor/floor-selectors";
import { PageHeader } from "@/components/shell/page-header";
import { getFloorLayout, getFloorNavigation } from "@/lib/queries/floor";
import { getSelectedPropertyId } from "@/lib/property";

export const metadata: Metadata = {
  title: "Floor Manager",
};

function Legend() {
  return (
    <div className="flex items-center gap-5 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-available" />
        Available
      </span>
      <span className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-occupied" />
        Occupied
      </span>
    </div>
  );
}

export default async function FloorManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string; floor?: string }>;
}) {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

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

  const rooms = selectedFloorId ? await getFloorLayout(selectedFloorId, propertyId) : [];

  return (
    <div>
      <PageHeader title="Floor Manager" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <FloorSelectors
          nav={nav}
          selectedBlockId={selectedBlockId}
          selectedFloorId={selectedFloorId}
        />
        <Legend />
      </div>
      <FloorBoard rooms={rooms} />
    </div>
  );
}
