/**
 * Who may view, review, approve or reject public registration requests, and read the KYC
 * image attached to a pending request. Pure and client-safe (same pattern as tenancy.ts);
 * the SERVER is the enforcement point (saveBed, rejectRegistration, file routes, page).
 * Unknown / missing roles are denied.
 */
export function canReviewRegistrations(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
