/** router.push must never receive an untrusted javascript: or external URL. */
export function safeCallbackPath(candidate?: string): string {
  if (!candidate || candidate.length > 2048 || !candidate.startsWith("/") || candidate.startsWith("//") || /[\\\x00-\x20]/.test(candidate)) return "/dashboard";
  try {
    const url = new URL(candidate, "https://triya.invalid");
    if (url.origin !== "https://triya.invalid" || url.pathname === "/login") return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
