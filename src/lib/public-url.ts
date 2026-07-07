import "server-only";

// Resolves the public base URL used to build absolute media URLs for external
// services (GreenAPI fetches invoice PDFs by URL). GreenAPI's servers run in the cloud
// and CANNOT reach a developer's localhost, so a localhost/unset value is the most
// common cause of "Invalid media URL(s)" — we surface that as an actionable error
// instead of letting GreenAPI fail cryptically.

type Resolved = { ok: true; base: string } | { ok: false; error: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

let warnedHttp = false;

/**
 * Validate and return APP_PUBLIC_URL as an absolute, trailing-slash-free base URL.
 * Returns an actionable error (not a throw) when it is unset or not publicly
 * reachable, so callers can return it straight through as an ActionResult.
 */
export function resolvePublicBaseUrl(): Resolved {
  const raw = process.env.APP_PUBLIC_URL?.trim();
  if (!raw) {
    return {
      ok: false,
      error:
        "APP_PUBLIC_URL is not set. GreenAPI needs a public HTTPS URL to fetch the invoice. " +
        "Set APP_PUBLIC_URL to a public URL (e.g. an ngrok tunnel) and restart.",
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: `APP_PUBLIC_URL is not a valid URL: "${raw}"` };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "APP_PUBLIC_URL must start with http:// or https://" };
  }

  if (LOCAL_HOSTS.has(url.hostname)) {
    console.warn(
      `[invoice] APP_PUBLIC_URL points to ${url.hostname} — GreenAPI cannot reach localhost.`,
    );
    return {
      ok: false,
      error:
        "APP_PUBLIC_URL points to localhost, which GreenAPI cannot reach. " +
        "Start a tunnel (e.g. `ngrok http 3000`), set APP_PUBLIC_URL to the public " +
        "https URL it prints, and restart the server.",
    };
  }

  // GreenAPI strongly prefers HTTPS for media; warn once rather than block.
  if (url.protocol === "http:" && !warnedHttp) {
    warnedHttp = true;
    console.warn(
      "[invoice] APP_PUBLIC_URL uses http:// — GreenAPI prefers https for media URLs.",
    );
  }

  return { ok: true, base: raw.replace(/\/$/, "") };
}
