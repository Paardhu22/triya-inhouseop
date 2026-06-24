"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FloorRoom } from "@/lib/queries/floor";
import { cn } from "@/lib/utils";

function bedState(bed: FloorRoom["beds"][number]) {
  const tenancy = bed.tenancies[0];
  if (!tenancy || bed.status !== "OCCUPIED") {
    return { label: "Empty", cardClass: "bg-available-soft" };
  }
  if (tenancy.paymentStatus === "PAID") {
    return { label: "Paid", cardClass: "bg-occupied-soft" };
  }
  return { label: "Not Paid", cardClass: "bg-occupied-soft" };
}

export function RoomView({
  room,
  onOpenChange,
  onSelectBed,
}: {
  room: FloorRoom | null;
  onOpenChange: (open: boolean) => void;
  onSelectBed: (bedId: string) => void;
}) {
  return (
    <Dialog open={Boolean(room)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Room {room?.number}</DialogTitle>
          <DialogDescription className="sr-only">
            Beds in this room. Click a bed to manage it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-4 py-2">
          {room?.beds.map((bed) => {
            const state = bedState(bed);
            return (
              <button
                key={bed.id}
                onClick={() => onSelectBed(bed.id)}
                className={cn(
                  "flex w-full max-w-[160px] sm:max-w-[185px] min-h-[168px] flex-col items-center justify-between rounded-2xl p-6 transition duration-150 hover:brightness-[0.98] active:scale-[0.98]",
                  state.cardClass,
                )}
              >
                <span className="text-xs font-semibold tracking-[0.08em] text-foreground/65 uppercase">
                  {state.label}
                </span>
                <span className="text-base font-semibold tracking-tight text-foreground">
                  Bed {bed.label}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
