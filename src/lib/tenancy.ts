// Tenancy business rules shared by server actions and client UI. Pure functions
// only (no Node/Prisma imports) so this is safe to import from client components.
import { addDays } from "date-fns";

import type { DepositStatus } from "@/generated/prisma/client";

/** Fixed system-wide notice period. There is intentionally no per-tenancy override. */
export const NOTICE_PERIOD_DAYS = 15;

/**
 * Maintenance reserve deducted from a tenant's security deposit at move-in.
 * Fixed at ₹1000, stored — like all money — in integer paise.
 */
export const MAINTENANCE_RESERVE_PAISE = 100_000; // ₹1000

/** Date the tenant must vacate by once notice is given (notice date + 15 days). */
export function vacateByDate(noticeGivenDate: Date): Date {
  return addDays(noticeGivenDate, NOTICE_PERIOD_DAYS);
}

/**
 * Deposit outcome when a tenancy ends. Refundable only when proper notice was
 * served and the tenant stayed through the full notice period; otherwise forfeited.
 */
export function resolveDepositStatusOnVacate(
  noticeGivenDate: Date | null,
  checkOutDate: Date,
): DepositStatus {
  if (!noticeGivenDate) return "FORFEITED";
  return checkOutDate >= vacateByDate(noticeGivenDate) ? "REFUNDABLE" : "FORFEITED";
}
