"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { refreshPaymentStatus } from "@/lib/ledger";
import { rupeesToPaise } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { roomRentSchema, type RoomRentInput } from "@/lib/validations/room";

async function requireManagerContext() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") return null;
  const propertyId = await getSelectedPropertyId();
  return propertyId ? { propertyId } : null;
}

/**
 * Set a room's rent once instead of typing it into every bed.
 *
 * The amounts are stored on the Room as defaults that pre-fill a new move-in, and can
 * optionally be pushed onto the tenancies already occupying the room. Rent stays a
 * per-tenancy figure — a room default is a starting point, never a hidden override, so
 * an individually negotiated rent is only overwritten when staff explicitly ask for it.
 */
export async function setRoomRent(
  input: RoomRentInput,
): Promise<ActionResult<{ updatedTenancies: number }>> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Administrator or manager access required");

  const parsed = roomRentSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid rent");
  const { roomId, rent, maintenance, applyToOccupants } = parsed.data;

  if (applyToOccupants && rent === null) {
    return actionError("Enter a rent amount before applying it to the current occupants");
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, propertyId: ctx.propertyId },
    select: {
      id: true,
      number: true,
      beds: {
        select: {
          tenancies: {
            where: { status: "ACTIVE" },
            select: { id: true, tenantId: true, paymentDueDay: true },
          },
        },
      },
    },
  });
  if (!room) return actionError("Room not found");

  const rentPaise = rent === null ? null : rupeesToPaise(rent);
  const maintenancePaise = maintenance === null ? null : rupeesToPaise(maintenance);
  const occupants = room.beds.flatMap((bed) => bed.tenancies);

  let updatedTenancies = 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.room.update({
        where: { id: room.id },
        data: { defaultRent: rentPaise, defaultMaintenance: maintenancePaise },
      });

      if (!applyToOccupants || rentPaise === null) return;

      for (const tenancy of occupants) {
        await tx.tenancy.update({
          where: { id: tenancy.id },
          data: { monthlyRent: rentPaise, maintenanceCharge: maintenancePaise ?? 0 },
        });
        // Changing what is owed changes whether the month is settled, so re-derive the
        // snapshot from the ledger rather than leaving a stale Paid/Pending badge.
        await refreshPaymentStatus(tx, {
          id: tenancy.id,
          tenantId: tenancy.tenantId,
          monthlyRent: rentPaise,
          maintenanceCharge: maintenancePaise ?? 0,
          paymentDueDay: tenancy.paymentDueDay,
        });
      }
      updatedTenancies = occupants.length;
    });
  } catch {
    return actionError("Could not save the room rent. Please try again.");
  }

  revalidatePath("/floor-manager");
  revalidatePath("/collections");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/tenants");
  revalidatePath("/admin");
  return actionOk({ updatedTenancies });
}
