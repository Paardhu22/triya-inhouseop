"use client";

import { useState } from "react";

import type { FloorRoom } from "@/lib/queries/floor";
import { cn } from "@/lib/utils";
import { BedDialog } from "./bed-dialog";
import { RoomView } from "./room-view";

function RoomCard({ room, onOpen }: { room: FloorRoom; onOpen: () => void }) {
  const occupied = room.beds.filter((b) => b.status === "OCCUPIED").length;
  const hasAvailable = room.beds.length === 0 || occupied < room.beds.length;

  return (
    <button
      onClick={onOpen}
      className="flex flex-col items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl bg-transparent py-3 sm:py-5 transition-[transform,background-color] duration-150 hover:bg-black/5 active:scale-[0.97]"
    >
      <span
        className={cn(
          "size-5 sm:size-6 rounded-full",
          hasAvailable ? "bg-available" : "bg-occupied",
        )}
      />
      <span className="text-base sm:text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {room.number}
      </span>
      <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
        {room.beds.length} Sharing
      </span>
    </button>
  );
}

export function FloorBoard({ rooms }: { rooms: FloorRoom[] }) {
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
  const firstRowSize = N === 1 ? 1 : Math.floor(N / 2);
  const secondRowSize = N === 1 ? 0 : Math.ceil(N / 2);
  const cols = Math.max(firstRowSize, secondRowSize);

  const gridItems: (FloorRoom | null)[] = [];
  for (let i = 0; i < firstRowSize; i++) {
    gridItems.push(rooms[i]);
  }
  for (let i = firstRowSize; i < cols; i++) {
    gridItems.push(null);
  }
  for (let i = 0; i < secondRowSize; i++) {
    gridItems.push(rooms[firstRowSize + i]);
  }

  return (
    <>
      <div className="rounded-3xl bg-[#E4E4E4] p-5 sm:p-8 lg:p-12">
        <div 
          className="grid gap-3 sm:gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {gridItems.map((room, idx) => {
            if (room === null) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }
            return (
              <RoomCard
                key={room.id}
                room={room}
                onOpen={() => setOpenRoomId(room.id)}
              />
            );
          })}
        </div>
      </div>

      <RoomView
        room={openRoom}
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
        onOpenChange={(open) => {
          if (!open) setOpenBedId(null);
        }}
      />
    </>
  );
}
