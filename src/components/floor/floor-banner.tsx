import Link from "next/link";
import { ArrowLeft, Layers3 } from "lucide-react";

export function FloorBanner({ floorNumber, totalFloors, currentFloorIndex }: {
  floorNumber: number;
  totalFloors: number;
  currentFloorIndex: number;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 py-1 hover:text-primary">
        <ArrowLeft aria-hidden="true" className="size-3.5" /> Dashboard
      </Link>
      <span className="inline-flex items-center gap-2">
        <Layers3 aria-hidden="true" className="size-3.5 text-primary" />
        {floorNumber < 0 ? `Basement ${Math.abs(floorNumber)}` : `Floor ${floorNumber}`}
        {totalFloors > 0 ? <span className="text-muted-foreground/70">· {currentFloorIndex + 1} of {totalFloors}</span> : null}
      </span>
    </div>
  );
}
