import "server-only";

import { env } from "@/lib/env";

// Exotel-specific slice of the central env (src/lib/env.ts is the single validated
// source of truth). Kept separate so the calling feature depends on a narrow,
// feature-scoped config object instead of the whole app env.
export type ExotelConfig = {
  accountSid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  callerId: string;
  /** The "Url" Calls/connect.json needs to run our Greeting->Hangup App/Flow, built
   * from the account sid + the App Bazaar app id (my.exotel.com is Exotel's own fixed
   * flow-execution domain, not account-specific, so it's safe to hardcode here). */
  flowUrl: string;
};

/** Returns the Exotel config, or null if any required var is unset. */
export function getExotelConfig(): ExotelConfig | null {
  const {
    EXOTEL_ACCOUNT_SID,
    EXOTEL_API_KEY,
    EXOTEL_API_TOKEN,
    EXOTEL_SUBDOMAIN,
    EXOTEL_CALLER_ID,
    EXOTEL_APP_ID,
  } = env;
  if (
    !EXOTEL_ACCOUNT_SID ||
    !EXOTEL_API_KEY ||
    !EXOTEL_API_TOKEN ||
    !EXOTEL_SUBDOMAIN ||
    !EXOTEL_CALLER_ID ||
    !EXOTEL_APP_ID
  ) {
    return null;
  }
  return {
    accountSid: EXOTEL_ACCOUNT_SID,
    apiKey: EXOTEL_API_KEY,
    apiToken: EXOTEL_API_TOKEN,
    subdomain: EXOTEL_SUBDOMAIN,
    callerId: EXOTEL_CALLER_ID,
    flowUrl: `http://my.exotel.com/${EXOTEL_ACCOUNT_SID}/exoml/start_voice/${EXOTEL_APP_ID}`,
  };
}
