/**
 * Turn an arbitrary display name into a url/handle-safe slug. Pure and client-safe so
 * both the add-property wizard (to preview the account email) and the server action
 * (to persist Property.slug) derive the same value.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
