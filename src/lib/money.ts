// Money helpers. All monetary amounts are stored in the database as integer PAISE
// (1 rupee = 100 paise) to avoid floating-point drift. Convert at the form boundary
// and format for display with these helpers.

/** Convert a rupee amount (possibly with decimals) to integer paise for storage. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert stored paise back to a rupee number (may have decimals). */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrDecimal = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a paise amount as Indian currency (e.g. 850000 -> "₹8,500").
 * Shows two decimals only when the amount has a fractional rupee component.
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return paise % 100 === 0 ? inrWhole.format(rupees) : inrDecimal.format(rupees);
}

/** Compact format for dense dashboards (e.g. 1250000 -> "₹12.5K", 12000000 -> "₹1.2L"). */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2)}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return inrWhole.format(rupees);
}
