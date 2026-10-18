"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { FloorRoom } from "@/lib/queries/floor";
import { BED_VISUAL_STATUS_META, bedVisualStatus } from "./bed-status";
import { CORRIDOR_HEIGHT, PLAN_MARGIN, ROOM_WIDTH, fitFloorPlan } from "./floor-plan-layout";
import styles from "./floor-plan.module.css";

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function PlanRoom({ room, x, y, height, bottomDoor, floorPattern, index, isFlat, onOpenRoom, onOpenBed }: {
  room: FloorRoom;
  x: number;
  y: number;
  height: number;
  bottomDoor: boolean;
  floorPattern: string;
  index: number;
  isFlat: boolean;
  onOpenRoom: () => void;
  onOpenBed: (bedId: string) => void;
}) {
  const occupied = room.beds.filter((bed) => bedVisualStatus(bed) !== "vacant").length;
  const columns = Math.max(1, Math.ceil(Math.sqrt(room.beds.length)));
  const rows = Math.max(1, Math.ceil(room.beds.length / columns));
  const cellWidth = (ROOM_WIDTH - 32) / columns;
  const cellHeight = (height - 72) / rows;
  const bedWidth = Math.min(46, cellWidth - 16, (cellHeight - 14) / 1.5);
  const bedHeight = bedWidth * 1.5;
  const doorY = bottomDoor ? height : 0;
  const doorDirection = bottomDoor ? -1 : 1;
  const statusText = room.beds.length ? `${room.beds.length - occupied} available · ${room.beds.length} ${isFlat ? "unit" : "beds"}` : "Not configured";
  const bedStatuses = room.beds.map((bed) => `Bed ${bed.label}: ${BED_VISUAL_STATUS_META[bedVisualStatus(bed)].label}`).join(", ");

  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={styles.arrival} style={{ animationDelay: `${Math.min(index, 10) * 22}ms` }}>
        <g role="button" tabIndex={0} aria-label={`${isFlat ? "Flat" : "Room"} ${room.number}, ${statusText}. ${bedStatuses}`} onClick={onOpenRoom} onKeyDown={(event) => activate(event, onOpenRoom)} className={styles.roomButton}>
          <title>{isFlat ? "Flat" : "Room"} {room.number} — {statusText}</title>
          <rect className={styles.roomSurface} x="3" y="3" width={ROOM_WIDTH - 6} height={height - 6} rx="3" fill={`url(#${floorPattern})`} />
          <text x="16" y="25" fill="var(--foreground)" fontSize="18" fontWeight="650">{room.number.length > 14 ? `${room.number.slice(0, 13)}…` : room.number}</text>
          <text x="16" y={height - 13} fill="var(--muted-foreground)" fontSize="10">{statusText}</text>
          {/* A recessed window and an inward swinging door make each room legible from above. */}
          <rect x="72" y={bottomDoor ? 0 : height - 5} width="68" height="5" rx="1" fill="#e7f1fa" stroke="#99b7ce" strokeWidth="1" />
          <path d={`M 72 ${bottomDoor ? 2.5 : height - 2.5} h 68`} stroke="#b5cfdf" strokeWidth="1" />
          <path d={`M ${ROOM_WIDTH - 60} ${doorY} h 30`} stroke="#f0f1f4" strokeWidth="7" />
          <path d={`M ${ROOM_WIDTH - 60} ${doorY} v ${doorDirection * 30}`} stroke="#8d94a0" strokeWidth="2" />
          <path d={`M ${ROOM_WIDTH - 60} ${doorY + doorDirection * 30} a 30 30 0 0 ${bottomDoor ? 1 : 0} 30 ${-doorDirection * 30}`} fill="none" stroke="#b5bbc5" strokeWidth="1" strokeDasharray="3 2" />
          {room.beds.length === 0 ? <text x={ROOM_WIDTH / 2} y={height / 2} textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">No beds configured</text> : null}
        </g>
        {room.beds.map((bed, bedIndex) => {
          const status = bedVisualStatus(bed);
          const meta = BED_VISUAL_STATUS_META[status];
          const row = Math.floor(bedIndex / columns);
          const bedsInRow = Math.min(columns, room.beds.length - row * columns);
          const bedX = (ROOM_WIDTH - bedsInRow * cellWidth) / 2 + (bedIndex % columns) * cellWidth + (cellWidth - bedWidth) / 2;
          const bedY = 38 + row * cellHeight + (cellHeight - bedHeight - 12) / 2;
          const tenant = status === "vacant" ? null : bed.tenancies[0]?.tenant;
          const name = isFlat ? `Flat ${room.number}` : `Room ${room.number}, bed ${bed.label}`;
          return (
            <g key={bed.id} transform={`translate(${bedX} ${bedY})`} role="button" tabIndex={0} className={styles.bedButton} aria-label={`${name}: ${meta.label}${tenant ? `, ${tenant.fullName}` : ", assign tenant"}`} onClick={() => onOpenBed(bed.id)} onKeyDown={(event) => activate(event, () => onOpenBed(bed.id))}>
              <title>{name} · {meta.label}{tenant ? ` · ${tenant.fullName}` : ""}</title>
              <rect x="-2" y="-3" width={bedWidth + 4} height="9" rx="2" fill="#b6a18d" />
              <rect className={styles.bedFrame} width={bedWidth} height={bedHeight} rx="4" />
              <rect x="5" y="5" width={bedWidth - 10} height={bedHeight * 0.2} rx="3" fill="#f9fafb" stroke="#dce0e6" strokeWidth="0.8" />
              <rect x="2" y={bedHeight * 0.4} width={bedWidth - 4} height={bedHeight * 0.6 - 2} rx="3" fill={`var(--bed-${status})`} fillOpacity="0.16" />
              <path d={`M 2 ${bedHeight * 0.4} h ${bedWidth - 4}`} stroke={`var(--bed-${status})`} strokeWidth="4" />
              <path d={`M ${bedWidth - 8} ${bedHeight * 0.48} v ${bedHeight * 0.4}`} stroke="white" strokeOpacity="0.75" strokeWidth="1" />
              <circle cx={bedWidth / 2} cy={bedHeight * 0.7} r="3" fill={`var(--bed-${status})`} />
              <text x={bedWidth / 2} y={bedHeight + 11} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--muted-foreground)">{bed.label.length > 7 ? `${bed.label.slice(0, 6)}…` : bed.label}</text>
            </g>
          );
        })}
      </g>
    </g>
  );
}

export function FloorPlan({ rooms, isFlat, onOpenRoom, onOpenBed }: {
  rooms: FloorRoom[];
  isFlat: boolean;
  onOpenRoom: (room: FloorRoom) => void;
  onOpenBed: (room: FloorRoom, bedId: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 440 });
  const id = useId().replace(/:/g, "");
  const floorPattern = `floor-wood-${id}`;
  const maxBeds = rooms.reduce((max, room) => Math.max(max, room.beds.length), 0);
  const layout = fitFloorPlan(rooms.length, maxBeds, size.width, size.height);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.viewport} ref={viewport}>
      <svg className={styles.plan} viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Interactive floor plan. Rooms and beds can be selected. Layout is schematic.">
        <defs>
          <pattern id={floorPattern} width="32" height="16" patternUnits="userSpaceOnUse">
            <rect width="32" height="16" fill="#f7f3ed" />
            <path d="M0 0h32M0 16h32M16 0v16" stroke="#e9e2d9" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect x={PLAN_MARGIN - 5} y={PLAN_MARGIN - 5} width={layout.width - PLAN_MARGIN * 2 + 10} height={layout.height - PLAN_MARGIN * 2 + 10} rx="5" fill="#e9ecf1" stroke="#b8bec9" strokeWidth="2" />
        {Array.from({ length: Math.ceil(layout.rows / 2) }, (_, pair) => {
          const y = PLAN_MARGIN + pair * (layout.roomHeight * 2 + CORRIDOR_HEIGHT) + layout.roomHeight;
          return (
            <g key={pair} aria-hidden="true">
              <rect x={PLAN_MARGIN} y={y} width={layout.columns * ROOM_WIDTH} height={CORRIDOR_HEIGHT} fill="#edf0f5" />
              <path d={`M ${PLAN_MARGIN + 12} ${y + CORRIDOR_HEIGHT / 2} h ${layout.columns * ROOM_WIDTH - 24}`} stroke="#c7cedb" strokeWidth="1" strokeDasharray="4 8" />
              <rect x={layout.width / 2 - 29} y={y + 10} width="58" height="18" rx="9" fill="#edf0f5" />
              <text x={layout.width / 2} y={y + 22} textAnchor="middle" fontSize="8" letterSpacing="1.4" fill="#8b95a6">CORRIDOR</text>
            </g>
          );
        })}
        {rooms.map((room, index) => {
          const row = Math.floor(index / layout.columns);
          return (
            <PlanRoom key={room.id} room={room} index={index} isFlat={isFlat} x={PLAN_MARGIN + (index % layout.columns) * ROOM_WIDTH} y={PLAN_MARGIN + Math.floor(row / 2) * (layout.roomHeight * 2 + CORRIDOR_HEIGHT) + (row % 2) * (layout.roomHeight + CORRIDOR_HEIGHT)} height={layout.roomHeight} bottomDoor={row % 2 === 0} floorPattern={floorPattern} onOpenRoom={() => onOpenRoom(room)} onOpenBed={(bedId) => onOpenBed(room, bedId)} />
          );
        })}
      </svg>
    </div>
  );
}
