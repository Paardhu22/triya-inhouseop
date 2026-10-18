"use client";

import { format } from "date-fns";
import { BedDouble, Building2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { paiseToRupees } from "@/lib/money";
import type { FloorBed, FloorRoom } from "@/lib/queries/floor";
import type { BedFormValues } from "@/lib/validations/tenant";
import { BedForm } from "./bed-form";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Room-level rent default as a form string; "" when the room has none. */
function roomAmount(paise: number | null | undefined): string {
  return paise ? String(paiseToRupees(paise)) : "";
}

function buildDefaults(bed: FloorBed, room: FloorRoom | null): BedFormValues {
  const tenancy = bed.tenancies[0];
  if (tenancy) {
    return {
      occupancyStatus: "OCCUPIED",
      fullName: tenancy.tenant.fullName,
      phone: tenancy.tenant.phone,
      email: tenancy.tenant.email ?? "",
      rentAmount: String(paiseToRupees(tenancy.monthlyRent)),
      maintenanceCharge: tenancy.maintenanceCharge
        ? String(paiseToRupees(tenancy.maintenanceCharge))
        : "",
      securityDeposit: tenancy.securityDeposit
        ? String(paiseToRupees(tenancy.securityDeposit))
        : "",
      checkInDate: format(tenancy.checkInDate, "yyyy-MM-dd"),
      paymentStatus: tenancy.paymentStatus === "PAID" ? "PAID" : "PENDING",
      paymentMethod: "CASH",
      cashAmount: "",
      onlineAmount: "",
    };
  }
  // Empty bed: default to Occupied so the details are ready to fill in (the
  // common action when clicking an empty bed). Switch to Available to keep it
  // empty / vacate. Rent starts from the room's default when one is set, so a move-in
  // does not mean re-typing the same amount for every bed in the room.
  return {
    occupancyStatus: "OCCUPIED",
    fullName: "",
    phone: "",
    email: "",
    rentAmount: roomAmount(room?.defaultRent),
    maintenanceCharge: roomAmount(room?.defaultMaintenance),
    securityDeposit: "",
    checkInDate: todayISO(),
    paymentStatus: "PENDING",
    paymentMethod: "CASH",
    cashAmount: "",
    onlineAmount: "",
  };
}

export function BedDialog({
  bed,
  room,
  roomNumber,
  isFlat = false,
  onOpenChange,
}: {
  bed: FloorBed | null;
  /** The bed's room — supplies the rent defaults a new move-in starts from. */
  room?: FloorRoom | null;
  roomNumber: string;
  isFlat?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(bed)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
          <span className="flex items-center gap-2 text-[11px] font-medium text-primary/80">{isFlat ? <Building2 aria-hidden="true" className="size-3.5" /> : <BedDouble aria-hidden="true" className="size-3.5" />}Tenant management</span>
          <DialogTitle className="text-xl leading-snug">
            {isFlat ? `Flat ${roomNumber}` : `Room ${roomNumber} · Bed ${bed?.label}`}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {bed?.tenancies[0] ? "Update tenant details, charges, and payment status." : "Assign a tenant and set up their monthly charges."}
          </DialogDescription>
        </DialogHeader>

        {bed ? (
          <BedForm
            key={bed.id}
            bedId={bed.id}
            isFlat={isFlat}
            defaults={buildDefaults(bed, room ?? null)}
            existingPhotoKey={bed.tenancies[0]?.tenant.photoUrl ?? null}
            tenancyId={bed.tenancies[0]?.id ?? null}
            noticeGivenDate={bed.tenancies[0]?.noticeGivenDate ?? null}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
