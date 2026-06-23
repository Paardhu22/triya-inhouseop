// Centralized status -> label + Tailwind class mappings so occupancy, payment and
// complaint states look identical everywhere they appear.
import type {
  BedStatus,
  ComplaintPriority,
  ComplaintStatus,
  PaymentStatus,
} from "@/generated/prisma/client";

type Meta = {
  label: string;
  /** Badge classes (border + bg tint + text). */
  badge: string;
  /** Solid dot / indicator color. */
  dot: string;
};

export const BED_STATUS_META: Record<BedStatus, Meta> = {
  AVAILABLE: {
    label: "Available",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  OCCUPIED: {
    label: "Occupied",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400",
    dot: "bg-rose-500",
  },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, Meta> = {
  PAID: {
    label: "Paid",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  PENDING: {
    label: "Pending",
    badge:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  OVERDUE: {
    label: "Overdue",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400",
    dot: "bg-rose-500",
  },
};

export const COMPLAINT_STATUS_META: Record<ComplaintStatus, Meta> = {
  OPEN: {
    label: "Open",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    badge:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  RESOLVED: {
    label: "Resolved",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

export const COMPLAINT_PRIORITY_META: Record<ComplaintPriority, Meta> = {
  LOW: {
    label: "Low",
    badge:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
    dot: "bg-slate-400",
  },
  MEDIUM: {
    label: "Medium",
    badge:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  HIGH: {
    label: "High",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400",
    dot: "bg-rose-500",
  },
};

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  ELECTRICITY: "Electricity",
  WATER: "Water",
  MAINTENANCE: "Maintenance",
  SALARY: "Salary",
  INTERNET: "Internet",
  CLEANING: "Cleaning",
  MISCELLANEOUS: "Miscellaneous",
};
