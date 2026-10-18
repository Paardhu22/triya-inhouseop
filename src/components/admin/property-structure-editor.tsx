"use client";

import { useId, useState, type CSSProperties } from "react";
import { Building2, ChevronDown, ChevronUp, DoorOpen, Layers3, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PropertySectionDraft } from "./property-structure";
import styles from "./property-structure.module.css";

function NumberStepper({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function change(next: number) {
    onChange(Math.min(max, Math.max(min, Math.round(next))));
    setDraft(null);
  }
  return (
    <div className="inline-flex h-8 shrink-0 items-center rounded-lg border border-input bg-background">
      <Button type="button" variant="ghost" size="icon-xs" className="rounded-r-none" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => change(value - 1)}><Minus aria-hidden="true" className="size-3" /></Button>
      <input type="number" aria-label={`${label} value`} min={min} max={max} step={1} value={draft ?? value} onChange={(event) => setDraft(event.target.value)} onBlur={() => {
        const number = Number(draft);
        if (draft !== null && draft.trim() && Number.isFinite(number)) change(number);
        else setDraft(null);
      }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-full w-10 bg-transparent text-center text-xs font-semibold tabular-nums outline-none focus-visible:bg-primary/5" />
      <Button type="button" variant="ghost" size="icon-xs" className="rounded-l-none" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => change(value + 1)}><Plus aria-hidden="true" className="size-3" /></Button>
    </div>
  );
}

function CountSlider({ label, value, max, onChange, hint, icon }: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
  icon?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="gap-1.5 text-xs">{icon}{label}</Label>
        <NumberStepper label={label} value={value} min={1} max={max} onChange={onChange} />
      </div>
      <input id={id} type="range" min={1} max={max} step={1} value={value} disabled={max === 1} onChange={(event) => onChange(Number(event.target.value))} className={styles.slider} style={{ "--progress": `${max > 1 ? (value - 1) / (max - 1) * 100 : 100}%` } as CSSProperties} />
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>1</span><span>{max}</span></div>
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PropertyStructureEditor({ section, hasBlocks, isFlat, canRemove, onChange, onRemove }: {
  section: PropertySectionDraft;
  hasBlocks: boolean;
  isFlat: boolean;
  canRemove: boolean;
  onChange: (section: PropertySectionDraft) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [floorIndex, setFloorIndex] = useState(0);
  const [customFloors, setCustomFloors] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const floorNumber = section.floors[Math.min(floorIndex, section.floors.length - 1)];
  const activeRoom = selectedRoom === null ? null : Math.min(selectedRoom, section.roomsPerFloor.length - 1);
  const mixed = new Set(section.roomsPerFloor).size > 1;
  const roomNumber = (index: number) => `${hasBlocks ? section.name : ""}${floorNumber}${String(index + 1).padStart(2, "0")}`;

  function resizeFloors(count: number) {
    const floors = section.floors.slice(0, count);
    for (let index = floors.length; index < count; index++) {
      let next = (floors[index - 1] + 1) % 1000;
      while (floors.includes(next)) next = (next + 1) % 1000;
      floors.push(next);
    }
    onChange({ ...section, floors });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border p-3 sm:p-4" aria-label={hasBlocks ? `Block ${section.name || "unnamed"} structure` : "Property structure"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><Building2 className="size-4" /></span>
          {hasBlocks ? <div className="flex min-w-0 items-center gap-2"><Label htmlFor={`${id}-name`} className="text-xs">Block</Label><Input plain id={`${id}-name`} aria-label="Block name" value={section.name} onChange={(event) => onChange({ ...section, name: event.target.value })} maxLength={30} className="h-8 w-24 text-xs" placeholder="A" /></div> : <p className="text-sm font-semibold">Floor layout</p>}
        </div>
        {canRemove ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove block ${section.name}`} className="text-muted-foreground hover:text-destructive" onClick={onRemove}><Trash2 aria-hidden="true" className="size-4" /></Button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountSlider label="Floors" value={section.floors.length} max={40} onChange={resizeFloors} icon={<Layers3 aria-hidden="true" className="size-3.5 text-primary" />} />
        <CountSlider label={isFlat ? "Flats per floor" : "Rooms per floor"} value={section.roomsPerFloor.length} max={40} onChange={(count) => onChange({ ...section, roomsPerFloor: Array.from({ length: count }, (_, index) => section.roomsPerFloor[index] ?? section.defaultBeds) })} icon={<DoorOpen aria-hidden="true" className="size-3.5 text-primary" />} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Starting floor</span><NumberStepper label="Starting floor" value={section.floors[0]} min={0} max={999} onChange={(start) => onChange({ ...section, floors: Array.from({ length: Math.min(section.floors.length, 1000 - start) }, (_, index) => start + index) })} /></div>
        <Button type="button" size="xs" variant="ghost" aria-expanded={customFloors} aria-controls={`${id}-floor-numbers`} onClick={() => setCustomFloors(!customFloors)}>{customFloors ? "Done editing numbers" : "Edit floor numbers"}{customFloors ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</Button>
      </div>
      {customFloors ? (
        <div id={`${id}-floor-numbers`} className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3 sm:grid-cols-3">
          {section.floors.map((number, index) => <div key={index} className="space-y-1.5"><p className="text-[11px] text-muted-foreground">Floor {index + 1} number</p><NumberStepper label={`Floor ${index + 1} number`} value={number} min={0} max={999} onChange={(next) => onChange({ ...section, floors: section.floors.map((current, i) => i === index ? next : current) })} /></div>)}
          <p className="col-span-full text-[11px] text-muted-foreground">Use 0 for ground floor. Each floor number must be unique.</p>
        </div>
      ) : null}
      {!isFlat ? <CountSlider label={mixed ? "Beds in all rooms" : "Beds per room"} value={section.defaultBeds} max={12} hint={mixed ? "Mixed sharing. This sets the bed count in every room." : "Choose a sharing size, then select any room below to adjust it."} onChange={(count) => onChange({ ...section, defaultBeds: count, roomsPerFloor: section.roomsPerFloor.map(() => count) })} /> : null}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preview floor">
          {section.floors.map((number, index) => <Button key={index} type="button" size="xs" variant={index === Math.min(floorIndex, section.floors.length - 1) ? "secondary" : "ghost"} aria-pressed={index === Math.min(floorIndex, section.floors.length - 1)} className={cn(index === Math.min(floorIndex, section.floors.length - 1) && "bg-primary/8 text-primary")} onClick={() => setFloorIndex(index)}>{number === 0 ? "Ground" : `Floor ${number}`}</Button>)}
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/20 p-3 min-[380px]:grid-cols-3 sm:grid-cols-6">
          {section.roomsPerFloor.map((beds, index) => isFlat ? (
            <div key={index} className={styles.room}><Building2 aria-hidden="true" className="size-5 text-primary/60" /><span className="max-w-full truncate text-[11px] font-semibold" title={`Flat ${roomNumber(index)}`}>{roomNumber(index)}</span><span className="text-[9px] text-muted-foreground">Whole flat</span></div>
          ) : (
            <button key={index} type="button" className={styles.room} aria-label={`Room ${roomNumber(index)}, ${beds} beds. Customize bed count`} aria-pressed={activeRoom === index} onClick={() => setSelectedRoom(activeRoom === index ? null : index)}>
              <span className="max-w-full truncate text-[11px] font-semibold" title={roomNumber(index)}>{roomNumber(index)}</span>
              <span aria-hidden="true" className="grid min-h-6 justify-items-center gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(beds, 3)}, 16px)` }}>{Array.from({ length: beds }, (_, bed) => <span key={bed} className={styles.mattress} />)}</span>
              <span className="text-[9px] text-muted-foreground">{beds} {beds === 1 ? "bed" : "beds"}</span>
            </button>
          ))}
        </div>
        {!isFlat && activeRoom !== null ? (
          <div className="space-y-2" aria-label="Individual room settings">
            <CountSlider label={`Room ${roomNumber(activeRoom)} beds`} value={section.roomsPerFloor[activeRoom]} max={12} onChange={(count) => onChange({ ...section, roomsPerFloor: section.roomsPerFloor.map((beds, index) => index === activeRoom ? count : beds) })} />
            <Button type="button" variant="ghost" size="xs" onClick={() => setSelectedRoom(null)}>Done customizing</Button>
          </div>
        ) : null}
        <p className="text-[11px] leading-relaxed text-muted-foreground">{isFlat ? "Each flat is managed as a whole unit." : "Select a room to customize its beds."} This layout applies to every floor{hasBlocks ? " in this block" : ""}.</p>
      </div>
    </section>
  );
}
