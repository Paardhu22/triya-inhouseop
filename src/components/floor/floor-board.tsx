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
      onClick={onOpen}
      className={cn(
        "group flex flex-col items-center justify-center gap-2 sm:gap-2.5 rounded-2xl bg-white px-3 py-4 sm:px-4 sm:py-5 text-center shadow-[0_1px_2px_rgba(15,23,42,.04),0_1px_3px_rgba(15,23,42,.04)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,23,42,.08)] active:scale-[0.97]",
        flatStatus
          ? cn("border-t border-r border-b border-t-[#EEF2F6] border-r-[#EEF2F6] border-b-[#EEF2F6] border-l-4", flatStatus.borderLeft)
          : "border border-[#EEF2F6]",
      )}
    >
      <span className="text-base sm:text-xl font-semibold tabular-nums tracking-tight text-foreground">
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

export function FloorBoard({ rooms, propertySlug }: { rooms: FloorRoom[]; propertySlug?: string }) {
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [openBedId, setOpenBedId] = useState<string | null>(null);

  const openRoom = rooms.find((r) => r.id === openRoomId) ?? null;
  const openBed = openRoom?.beds.find((b) => b.id === openBedId) ?? null;

  if (rooms.length === 0) {
    return (
      <div className="rounded-[24px] border border-[#E8EEF3] bg-white px-6 py-24 text-center text-sm text-muted-foreground">
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
        className="rounded-[24px] border border-[#E8EEF3] bg-white px-5 sm:px-8 lg:px-12"
        style={{
          paddingTop: "var(--board-padding-y)",
          paddingBottom: "var(--board-padding-y)"
        }}
      >
        <div className="flex flex-col gap-4 sm:gap-6">
          <div
            className="grid gap-4 sm:gap-6 mx-auto"
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
              className="grid gap-4 sm:gap-6 mx-auto"
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
