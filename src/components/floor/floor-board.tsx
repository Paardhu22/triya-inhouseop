"use client";

import { useState } from "react";

import type { FloorRoom } from "@/lib/queries/floor";
import { cn } from "@/lib/utils";
import { BedDialog } from "./bed-dialog";
import { RoomView } from "./room-view";

function RoomCard({ room, propertySlug, onOpen }: { room: FloorRoom; propertySlug?: string; onOpen: () => void }) {
  const occupied = room.beds.filter((b) => b.status === "OCCUPIED").length;
  const isPartiallyOccupied = occupied > 0 && occupied < room.beds.length;
  const isFullyOccupied = room.beds.length > 0 && occupied === room.beds.length;
  const isFlat = propertySlug === "cozy-gowlidoddy";

  return (
    <button
      onClick={onOpen}
      className="flex flex-col items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl bg-transparent py-3 sm:py-5 transition-[transform,background-color] duration-150 hover:bg-black/5 active:scale-[0.97]"
    >
      <span
        className={cn(
          "size-5 sm:size-6 rounded-full",
          isFullyOccupied ? "bg-occupied" : isPartiallyOccupied ? "bg-[#f59e0b]" : "bg-available",
        )}
      />
      <span className="text-base sm:text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {room.number}
      </span>
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
      <div className="rounded-3xl bg-[#E4E4E4] px-6 py-24 text-center text-sm text-primary/55">
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
        className="rounded-3xl bg-[#E4E4E4] px-5 sm:px-8 lg:px-12"
        style={{
          paddingTop: "var(--board-padding-y)",
          paddingBottom: "var(--board-padding-y)"
        }}
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div 
            className="grid gap-3 sm:gap-4 mx-auto"
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
              className="grid gap-3 sm:gap-4 mx-auto"
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
