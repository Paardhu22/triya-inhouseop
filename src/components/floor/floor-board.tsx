"use client";

import { useState } from "react";
import { Scan, BedDouble } from "lucide-react";
import type { FloorRoom } from "@/lib/queries/floor";
import { bedVisualStatus } from "./bed-status";
import { BedDialog } from "./bed-dialog";
import { RoomView } from "./room-view";
import { FloorPlan } from "./floor-plan";
import styles from "./floor-plan.module.css";

export function FloorBoard({ rooms, propertySlug, canSetRent = false, floorLabel = "Floor plan" }: {
  rooms: FloorRoom[];
  propertySlug?: string;
  canSetRent?: boolean;
  floorLabel?: string;
}) {
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [openBedId, setOpenBedId] = useState<string | null>(null);
  const isFlat = propertySlug === "cozy-gowlidoddy";
  const openRoom = rooms.find((room) => room.id === openRoomId) ?? null;
  const openBed = openRoom?.beds.find((bed) => bed.id === openBedId) ?? null;
  const bedCount = rooms.reduce((sum, room) => sum + room.beds.length, 0);
  const available = rooms.reduce((sum, room) => sum + room.beds.filter((bed) => bedVisualStatus(bed) === "vacant").length, 0);

  function selectRoom(room: FloorRoom) {
    setOpenRoomId(room.id);
    setOpenBedId(isFlat && room.beds.length ? room.beds[0].id : null);
  }

  return (
    <>
      <div className={styles.board}>
        <div className={styles.toolbar}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold"><Scan aria-hidden="true" className="size-3.5 shrink-0 text-primary" /><span className="truncate">{floorLabel}</span></p>
            <p className="mt-1 text-[10px] text-muted-foreground">{rooms.length} {isFlat ? "flats" : "rooms"} · {bedCount} {isFlat ? "units" : "beds"} · <span className="text-primary">{available} available</span></p>
          </div>
          {rooms.length > 0 ? (
            <select aria-label={isFlat ? "Find a flat" : "Find a room"} value="" onChange={(event) => {
              const room = rooms.find((item) => item.id === event.target.value);
              if (room) selectRoom(room);
            }} className="h-8 min-w-0 max-w-[45%] rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="" disabled>{isFlat ? "Find a flat" : "Find a room"}</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{isFlat ? "Flat" : "Room"} {room.number}</option>)}
            </select>
          ) : null}
        </div>
        {rooms.length > 0 ? (
          <FloorPlan rooms={rooms} isFlat={isFlat} onOpenRoom={selectRoom} onOpenBed={(room, bedId) => {
            setOpenRoomId(room.id);
            setOpenBedId(bedId);
          }} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-sm text-muted-foreground"><BedDouble aria-hidden="true" className="size-8 text-muted-foreground/50" />No rooms on this floor yet.</div>
        )}
      </div>
      <RoomView room={openBed ? null : openRoom} canSetRent={canSetRent} onOpenChange={(open) => {
        if (!open) { setOpenRoomId(null); setOpenBedId(null); }
      }} onSelectBed={setOpenBedId} />
      <BedDialog bed={openBed} room={openRoom} roomNumber={openRoom?.number ?? ""} isFlat={isFlat} onOpenChange={(open) => {
        if (!open) { setOpenBedId(null); setOpenRoomId(null); }
      }} />
    </>
  );
}
