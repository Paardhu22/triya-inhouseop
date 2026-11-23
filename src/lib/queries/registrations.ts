import "server-only";

import type { RegistrationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getRegistrations(propertyId: string, status: RegistrationStatus | "ALL") {
  return prisma.registrationRequest.findMany({
    where: { propertyId, ...(status === "ALL" ? {} : { status }) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, fullName: true, phone: true, email: true, preferredCheckIn: true,
      kycKey: true, status: true, rejectionReason: true, createdAt: true, reviewedAt: true,
    },
  });
}

export async function getRegistrationCounts(propertyId: string) {
  const rows = await prisma.registrationRequest.groupBy({
    by: ["status"], where: { propertyId }, _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<RegistrationStatus, number>>;
}

/** Beds with no active tenancy, with the room's rent defaults for prefill. */
export async function getVacantBeds(propertyId: string) {
  const beds = await prisma.bed.findMany({
    where: { propertyId, status: "AVAILABLE", tenancies: { none: { status: "ACTIVE" } } },
    orderBy: [{ room: { floor: { number: "asc" } } }, { room: { number: "asc" } }, { order: "asc" }],
    select: {
      id: true, label: true,
      room: { select: { number: true, defaultRent: true, defaultMaintenance: true, floor: { select: { number: true, name: true, block: { select: { name: true } } } } } },
    },
  });
  return beds.map((b) => ({
    id: b.id,
    bedLabel: b.label,
    roomNumber: b.room.number,
    floorLabel: b.room.floor.name ?? `Floor ${b.room.floor.number}`,
    blockName: b.room.floor.block?.name ?? null,
    defaultRent: b.room.defaultRent,
    defaultMaintenance: b.room.defaultMaintenance,
  }));
}
export type VacantBed = Awaited<ReturnType<typeof getVacantBeds>>[number];
