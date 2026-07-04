// Runs once when the server boots. Loading src/lib/env validates the environment up
// front, so a misconfigured host fails fast here instead of at the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
