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
      className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md"
    >
      <span
        className={cn(
          "size-5 rounded-full",
          hasAvailable ? "bg-green-500" : "bg-red-500",
        )}
      />
      <span className="text-xl font-semibold tabular-nums">{room.number}</span>
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
      <div className="rounded-2xl bg-white p-16 text-center text-sm text-muted-foreground shadow-sm">
        No rooms on this floor yet.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} onOpen={() => setOpenRoomId(room.id)} />
        ))}
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
