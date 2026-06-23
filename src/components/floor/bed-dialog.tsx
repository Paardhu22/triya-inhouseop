"use client";

import { format } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { paiseToRupees } from "@/lib/money";
import type { FloorBed } from "@/lib/queries/floor";
import type { BedFormValues } from "@/lib/validations/tenant";
import { BedForm } from "./bed-form";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildDefaults(bed: FloorBed): BedFormValues {
  const tenancy = bed.tenancies[0];
  if (tenancy) {
    return {
      occupancyStatus: "OCCUPIED",
      fullName: tenancy.tenant.fullName,
      phone: tenancy.tenant.phone,
      rentAmount: String(paiseToRupees(tenancy.monthlyRent)),
      checkInDate: format(tenancy.checkInDate, "yyyy-MM-dd"),
      paymentStatus: tenancy.paymentStatus === "PAID" ? "PAID" : "PENDING",
    };
  }
  // Empty bed: default to Occupied so the details are ready to fill in (the
  // common action when clicking an empty bed). Switch to Available to keep it
  // empty / vacate.
  return {
    occupancyStatus: "OCCUPIED",
    fullName: "",
    phone: "",
    rentAmount: "",
    checkInDate: todayISO(),
    paymentStatus: "PENDING",
  };
}

export function BedDialog({
  bed,
  roomNumber,
  onOpenChange,
}: {
  bed: FloorBed | null;
  roomNumber: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(bed)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Room {roomNumber} · Bed {bed?.label}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit this bed&apos;s occupancy and tenant details.
          </DialogDescription>
        </DialogHeader>

        {bed ? (
          <BedForm
            key={bed.id}
            bedId={bed.id}
            defaults={buildDefaults(bed)}
            existingPhotoKey={bed.tenancies[0]?.tenant.photoUrl ?? null}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
