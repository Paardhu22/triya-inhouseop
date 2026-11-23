import "server-only";

import { subDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { CLOSED_PURGE_DAYS, PENDING_EXPIRY_DAYS } from "./shared";

/**
 * Daily retention for public registrations (called from the cron route):
 *  - PENDING older than PENDING_EXPIRY_DAYS become EXPIRED and their KYC file is deleted.
 *  - Closed requests (approved/rejected/expired) older than CLOSED_PURGE_DAYS are deleted.
 * The DB is updated first; a failed file delete leaves only an unreferenced object.
 */
export async function runRegistrationRetention(now = new Date()) {
  const stale = await prisma.registrationRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: subDays(now, PENDING_EXPIRY_DAYS) } },
    select: { id: true, kycKey: true },
    take: 500,
  });
  let expired = 0;
  for (const row of stale) {
    const res = await prisma.registrationRequest.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "EXPIRED", kycKey: null, kycFilename: null, kycMimeType: null, kycSize: null, reviewedAt: now },
    });
    if (res.count === 1) {
      expired += 1;
      if (row.kycKey) await storage.remove(row.kycKey).catch(() => undefined);
    }
  }
  const purged = await prisma.registrationRequest.deleteMany({
    where: { status: { not: "PENDING" }, updatedAt: { lt: subDays(now, CLOSED_PURGE_DAYS) }, kycKey: null },
  });
  return { expired, purged: purged.count };
}
