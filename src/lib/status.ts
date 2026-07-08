// Centralized status -> label + Tailwind class mappings so occupancy, payment and
// complaint states look identical everywhere they appear.
import type {
  BedStatus,
  CallStatus,
  ComplaintPriority,
  ComplaintStatus,
  DepositStatus,
  MessageStatus,
  PaymentStatus,
} from "@/generated/prisma/client";

type Meta = {
  label: string;
  /** Solid dot / indicator color — the only colour a status carries. */
  dot: string;
};

// Four restrained, on-palette status tones. Status always carries a text label,
// so the dot is reinforcement — never the sole signal.
const TONE = {
  green: { dot: "bg-available" },
  red: { dot: "bg-occupied" },
  amber: { dot: "bg-[#c79a3e]" },
  neutral: { dot: "bg-[#9ca3af]" },
} as const;

export const BED_STATUS_META: Record<BedStatus, Meta> = {
  AVAILABLE: { label: "Available", ...TONE.green },
  OCCUPIED: { label: "Occupied", ...TONE.red },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, Meta> = {
  PAID: { label: "Paid", ...TONE.green },
  PENDING: { label: "Pending", ...TONE.amber },
  OVERDUE: { label: "Overdue", ...TONE.red },
};

/** Badge for synthetic test tenants (see TEST_TENANT_MARKER) — not a real PaymentStatus. */
export const TEST_STATUS_META: Meta = { label: "Test", ...TONE.neutral };

export const COMPLAINT_STATUS_META: Record<ComplaintStatus, Meta> = {
  OPEN: { label: "Open", ...TONE.red },
  IN_PROGRESS: { label: "In Progress", ...TONE.amber },
  RESOLVED: { label: "Resolved", ...TONE.green },
};

export const COMPLAINT_PRIORITY_META: Record<ComplaintPriority, Meta> = {
  LOW: { label: "Low", ...TONE.neutral },
  MEDIUM: { label: "Medium", ...TONE.amber },
  HIGH: { label: "High", ...TONE.red },
};

export const DEPOSIT_STATUS_META: Record<DepositStatus, Meta> = {
  PENDING: { label: "Pending", ...TONE.amber },
  REFUNDABLE: { label: "Refundable", ...TONE.green },
  FORFEITED: { label: "Forfeited", ...TONE.red },
  ADJUSTED: { label: "Adjusted", ...TONE.neutral },
};

export const KYC_STATUS_META = {
  VERIFIED: { label: "Verified", ...TONE.green },
  PENDING: { label: "Pending", ...TONE.amber },
} as const;

// Whether the caution/security deposit has actually been collected (cash or
// online) — distinct from DepositStatus above, which is about refund eligibility
// at vacate and stays PENDING for the entire active stay either way.
export const DEPOSIT_COLLECTED_META = {
  COLLECTED: { label: "Collected", ...TONE.green },
  NOT_COLLECTED: { label: "Not collected", ...TONE.amber },
} as const;

export const MESSAGE_STATUS_META: Record<MessageStatus, Meta> = {
  SENT: { label: "Sent", ...TONE.green },
  FAILED: { label: "Failed", ...TONE.red },
};

export const CALL_STATUS_META: Record<CallStatus, Meta> = {
  CALLING: { label: "Calling", ...TONE.amber },
  CONNECTED: { label: "Connected", ...TONE.amber },
  COMPLETED: { label: "Completed", ...TONE.green },
  FAILED: { label: "Failed", ...TONE.red },
};
