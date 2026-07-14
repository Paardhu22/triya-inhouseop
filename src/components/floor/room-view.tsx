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
    return { label: "Empty", cardClass: "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 dark:from-slate-800 dark:to-slate-900 dark:text-slate-300" };
  }
  if (tenancy.paymentStatus === "PAID") {
    return { label: "Paid", cardClass: "bg-gradient-to-br from-emerald-50 to-emerald-200/70 text-emerald-700 dark:from-emerald-900/40 dark:to-emerald-800/40 dark:text-emerald-400" };
  }
  return { label: "Not Paid", cardClass: "bg-gradient-to-br from-rose-50 to-rose-200/70 text-rose-700 dark:from-rose-900/40 dark:to-rose-800/40 dark:text-rose-400" };
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
      {/* Force a clean white/light gradient background for the modal as requested, removing the dark blue slate */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl bg-gradient-to-br from-white to-slate-50 dark:from-zinc-900 dark:to-zinc-950 border-border shadow-xl">
        <DialogHeader>
          <DialogTitle>Room {room?.number}</DialogTitle>
          <DialogDescription className="sr-only">
            Beds in this room. Click a bed to manage it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-4 py-4">
          {room?.beds.map((bed) => {
            const state = bedState(bed);
            return (
              <button
                key={bed.id}
                onClick={() => onSelectBed(bed.id)}
                className={cn(
                  "flex w-full max-w-[160px] sm:max-w-[185px] min-h-[168px] flex-col items-center justify-between rounded-2xl p-6 transition duration-150 hover:brightness-105 active:scale-[0.98] border border-black/5 dark:border-white/5",
                  state.cardClass,
                )}
              >
                <span className="text-xs font-semibold tracking-[0.08em] uppercase opacity-75">
                  {state.label}
                </span>
                <span className="text-base font-semibold tracking-tight">
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
