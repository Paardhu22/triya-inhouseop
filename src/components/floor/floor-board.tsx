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
      className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl bg-card transition-[transform,background-color] duration-150 hover:bg-hover active:scale-[0.97]"
    >
      <span
        className={cn(
          "size-3.5 rounded-full",
          hasAvailable ? "bg-available" : "bg-occupied",
        )}
      />
      <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {room.number}
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
      <div className="rounded-3xl bg-secondary-surface px-6 py-24 text-center text-sm text-primary/55">
        No rooms on this floor yet.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-3xl bg-secondary-surface p-5 sm:p-8 lg:p-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onOpen={() => setOpenRoomId(room.id)}
            />
          ))}
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
