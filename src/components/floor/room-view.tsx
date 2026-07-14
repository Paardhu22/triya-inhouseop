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
    return { label: "Empty", blanket: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400" };
  }
  if (tenancy.paymentStatus === "PAID") {
    return { label: "Paid", blanket: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" };
  }
  return { label: "Not Paid", blanket: "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400" };
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl bg-gradient-to-b from-background to-muted/30">
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
                className="group relative flex h-[200px] w-[130px] shrink-0 flex-col items-center overflow-hidden rounded-[24px] border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {/* Pillow */}
                <div className="absolute top-4 h-[32px] w-[70px] rounded-[14px] bg-muted shadow-sm transition-transform duration-300 group-hover:scale-105" />
                
                {/* Blanket */}
                <div className={cn(
                  "absolute bottom-0 h-[60%] w-full rounded-t-[20px] transition-all duration-300 group-hover:h-[64%]",
                  state.blanket
                )}>
                  {/* Fold detail */}
                  <div className="absolute top-0 h-3 w-full bg-black/5 dark:bg-white/5" />
                  
                  {/* Content inside blanket */}
                  <div className="absolute bottom-5 left-0 right-0 flex flex-col items-center">
                    <span className="mb-1 text-[10px] font-bold tracking-[0.1em] uppercase opacity-70">
                      {state.label}
                    </span>
                    <span className="text-xl font-bold tracking-tight">
                      Bed {bed.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
