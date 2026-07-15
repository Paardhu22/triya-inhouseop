import type { FloorRoom } from "@/lib/queries/floor";

// Visual-only classification for the Floor Manager redesign: Vacant / Paid / Pending /
// Overdue. Distinct from the app-wide BED_STATUS_META / PAYMENT_STATUS_META in
// src/lib/status.ts (those cover Bed.status and Tenancy.paymentStatus individually and
// are used across the whole app) — this collapses both into the single accent a bed
// card shows, scoped to this page only.
export type BedVisualStatus = "paid" | "pending" | "overdue" | "vacant";

export function bedVisualStatus(bed: FloorRoom["beds"][number]): BedVisualStatus {
  const tenancy = bed.tenancies[0];
  if (!tenancy || bed.status !== "OCCUPIED") return "vacant";
  if (tenancy.paymentStatus === "PAID") return "paid";
  if (tenancy.paymentStatus === "OVERDUE") return "overdue";
  return "pending";
}

type BedVisualStatusMeta = {
  label: string;
  dot: string;
  text: string;
  /** Left-edge accent only — kept as a dedicated `border-l-*` utility so it never
   * competes with the neutral `border-t/r/b` color used for the rest of the tile. */
  borderLeft: string;
  softBg: string;
};

export const BED_VISUAL_STATUS_META: Record<BedVisualStatus, BedVisualStatusMeta> = {
  paid: { label: "Paid", dot: "bg-bed-paid", text: "text-bed-paid", borderLeft: "border-l-bed-paid", softBg: "bg-bed-paid/10" },
  pending: { label: "Pending", dot: "bg-bed-pending", text: "text-bed-pending", borderLeft: "border-l-bed-pending", softBg: "bg-bed-pending/10" },
  overdue: { label: "Overdue", dot: "bg-bed-overdue", text: "text-bed-overdue", borderLeft: "border-l-bed-overdue", softBg: "bg-bed-overdue/10" },
  vacant: { label: "Vacant", dot: "bg-bed-vacant", text: "text-bed-vacant", borderLeft: "border-l-bed-vacant", softBg: "bg-bed-vacant/10" },
};
