"use client";

import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FloorOpt = { id: string; number: number; name: string | null };
type BlockOpt = { id: string; name: string; floors: FloorOpt[] };
type Nav = { hasBlocks: boolean; blocks: BlockOpt[]; floors: FloorOpt[] };

function floorLabel(f: FloorOpt) {
  return f.name ?? `Floor ${f.number}`;
}

export function FloorSelectors({
  nav,
  selectedBlockId,
  selectedFloorId,
}: {
  nav: Nav;
  selectedBlockId: string | null;
  selectedFloorId: string | null;
}) {
  const router = useRouter();

  // Only surface the Block selector when there is a genuine choice (more than
  // one block). A single block is selected implicitly and its dropdown hidden.
  const showBlocks = nav.hasBlocks && nav.blocks.length > 1;

  const floors = nav.hasBlocks
    ? (nav.blocks.find((b) => b.id === selectedBlockId)?.floors ?? [])
    : nav.floors;

  function navigate(blockId: string | null, floorId: string | null) {
    const params = new URLSearchParams();
    if (blockId) params.set("block", blockId);
    if (floorId) params.set("floor", floorId);
    router.push(`/floor-manager?${params.toString()}`);
  }

  function onBlockChange(blockId: string) {
    const block = nav.blocks.find((b) => b.id === blockId);
    navigate(blockId, block?.floors[0]?.id ?? null);
  }

  function onFloorChange(floorId: string) {
    navigate(nav.hasBlocks ? selectedBlockId : null, floorId);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {showBlocks ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Block</Label>
          <Select value={selectedBlockId ?? undefined} onValueChange={onBlockChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select block" />
            </SelectTrigger>
            <SelectContent>
              {nav.blocks.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  Block {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Floor</Label>
        <Select value={selectedFloorId ?? undefined} onValueChange={onFloorChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select floor" />
          </SelectTrigger>
          <SelectContent>
            {floors.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {floorLabel(f)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
