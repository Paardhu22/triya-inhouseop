"use client";

import { useState } from "react";

import type { FloorRoom } from "@/lib/queries/floor";
import { cn } from "@/lib/utils";
import { BED_VISUAL_STATUS_META, bedVisualStatus } from "./bed-status";
import { BedDialog } from "./bed-dialog";
import { RoomView } from "./room-view";

function RoomCard({ room, propertySlug, onOpen }: { room: FloorRoom; propertySlug?: string; onOpen: () => void }) {
  const isFlat = propertySlug === "cozy-gowlidoddy";
  // A flat property has exactly one bed per "room" — treat the card itself as that
  // bed, with the same left-edge accent the bed tiles use, instead of a dot row.
  const flatStatus = isFlat && room.beds[0] ? BED_VISUAL_STATUS_META[bedVisualStatus(room.beds[0])] : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col items-center justify-center gap-2 sm:gap-2.5 rounded-xl bg-card px-3 py-4 sm:px-4 sm:py-5 text-center shadow-2xs transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none",
        flatStatus
          ? cn("border-t border-r border-b border-t-border border-r-border border-b-border border-l-4", flatStatus.borderLeft)
          : "border border-border hover:border-primary/25",
      )}
    >
      <span className="text-lg sm:text-2xl font-semibold tabular-nums tracking-[-0.035em] text-foreground">
        {room.number}
      </span>
      {!isFlat && room.beds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {room.beds.map((bed) => (
            <span
              key={bed.id}
              className={cn("size-2 rounded-full", BED_VISUAL_STATUS_META[bedVisualStatus(bed)].dot)}
            />
          ))}
        </div>
      ) : null}
      <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
        {isFlat ? "Flat" : `${room.beds.length} Sharing`}
      </span>
    </button>
  );
}

export function FloorBoard({
  rooms,
  propertySlug,
  canSetRent = false,
}: {
  rooms: FloorRoom[];
  propertySlug?: string;
  /** ADMIN/MANAGER may set the rent for a whole room. */
  canSetRent?: boolean;
}) {
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [openBedId, setOpenBedId] = useState<string | null>(null);

  const openRoom = rooms.find((r) => r.id === openRoomId) ?? null;
  const openBed = openRoom?.beds.find((b) => b.id === openBedId) ?? null;

  if (rooms.length === 0) {
    return (
      <div className="border-y border-border px-6 py-20 text-center text-sm text-muted-foreground">
        No rooms on this floor yet.
      </div>
    );
  }

  const N = rooms.length;
  let firstRowSize = 0;
  let secondRowSize = 0;

  if (N === 1) {
    firstRowSize = 1;
    secondRowSize = 0;
  } else if (N % 2 === 0) {
    firstRowSize = N / 2;
    secondRowSize = N / 2;
  } else {
    firstRowSize = Math.ceil(N / 2);
    secondRowSize = Math.floor(N / 2);
  }

  const cols = Math.max(firstRowSize, secondRowSize);
  const firstRowRooms = rooms.slice(0, firstRowSize);
  const secondRowRooms = rooms.slice(firstRowSize);

  return (
    <>
      <div
        className="overflow-x-auto border-y border-border"
        style={{
          paddingTop: "var(--board-padding-y)",
          paddingBottom: "var(--board-padding-y)"
        }}
      >
        <div
          className="flex flex-col gap-4"
          style={{ minWidth: `calc(${cols} * 4.5rem + ${cols - 1} * 1rem)` }}
        >
          <div
            className="grid gap-4 mx-auto"
            style={{
              gridTemplateColumns: `repeat(${firstRowSize}, minmax(0, 1fr))`,
              width: `${(firstRowSize / cols) * 100}%`
            }}
          >
            {firstRowRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                propertySlug={propertySlug}
                onOpen={() => {
                  setOpenRoomId(room.id);
                  if (propertySlug === "cozy-gowlidoddy" && room.beds.length > 0) {
                    setOpenBedId(room.beds[0].id);
                  }
                }}
              />
            ))}
          </div>

          {secondRowSize > 0 && (
            <div
              className="grid gap-4 mx-auto"
              style={{
                gridTemplateColumns: `repeat(${secondRowSize}, minmax(0, 1fr))`,
                width: `${(secondRowSize / cols) * 100}%`
              }}
            >
              {secondRowRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  propertySlug={propertySlug}
                  onOpen={() => {
                    setOpenRoomId(room.id);
                    if (propertySlug === "cozy-gowlidoddy" && room.beds.length > 0) {
                      setOpenBedId(room.beds[0].id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <RoomView
        room={propertySlug === "cozy-gowlidoddy" ? null : openRoom}
        canSetRent={canSetRent}
        onOpenChange={(open) => {
          if (!open) {
            setOpenRoomId(null);
            setOpenBedId(null);
          }
        }}
        onSelectBed={(bedId) => setOpenBedId(bedId)}
      />

      <BedDialog
        bed={openBed}
        room={openRoom}
        roomNumber={openRoom?.number ?? ""}
        isFlat={propertySlug === "cozy-gowlidoddy"}
        onOpenChange={(open) => {
          if (!open) {
            setOpenBedId(null);
            setOpenRoomId(null);
          }
        }}
      />
    </>
  );
}
