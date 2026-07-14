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
      <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-gradient-to-br from-white to-slate-100 shadow-2xl sm:max-w-2xl dark:from-slate-900 dark:to-slate-950">
        <DialogHeader>
          <DialogTitle>Room {room?.number}</DialogTitle>
          <DialogDescription className="sr-only">
            Beds in this room. Click a bed to manage it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-6 py-8">
          {room?.beds.map((bed) => {
            const state = bedState(bed);
            return (
              <button
                key={bed.id}
                onClick={() => onSelectBed(bed.id)}
                className={cn(
                  "group relative flex h-[240px] w-[140px] shrink-0 flex-col items-center overflow-hidden rounded-[32px] shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary/20",
                  state.cardClass,
                )}
              >
                {/* Pillow */}
                <div className="absolute top-6 h-12 w-[84px] rounded-[20px] bg-white/70 shadow-sm transition-transform duration-300 group-hover:scale-105 dark:bg-black/20" />
                
                {/* Blanket */}
                <div className="absolute bottom-0 h-[65%] w-full rounded-t-[32px] bg-white/40 shadow-[0_-8px_20px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300 group-hover:h-[68%] dark:bg-black/10" />

                {/* Content */}
                <div className="z-10 mt-auto flex w-full flex-col items-center pb-8">
                  <span className="mb-1 text-[11px] font-bold tracking-[0.1em] text-foreground/50 uppercase">
                    {state.label}
                  </span>
                  <span className="text-xl font-bold tracking-tight text-foreground/80">
                    {bed.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
