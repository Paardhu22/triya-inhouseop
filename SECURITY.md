# Security and reliability review — 22 October 2026

## Status and scope

The repository has been hardened and tested locally against a production build and
a disposable PostgreSQL database. No Vercel deployments, live firewall changes,
or third-party message sends were performed.
The remote database configured in `.env` was not used for integration tests.
The local development database's older, already-applied schema migration was
verified with a read-only schema diff before its history was reconciled. Only
the new counter table and lookup indexes were then applied locally; application
records were not reset or reseeded.

After the user requested restoring the app's actual database connection, both
additive security migrations were applied to the remote database configured in
`.env`. Its six preceding migrations were already applied. The local-only
development override was removed, and `npm run dev` uses the configured database.
The `testing` property was confirmed active with four rooms and one tenant before
the switch. No property or tenant records were deleted, reset, or reseeded.

Application controls do not make a site DDoS-proof. Production readiness still
depends on the Vercel firewall, private storage, environment settings, monitoring,
and database capacity described below. Vercel supplies automatic DDoS mitigation,
but the project's actual settings have not been inspected. See
[Vercel DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation).

## Findings addressed

| Finding | Change |
| --- | --- |
| Outdated framework/auth dependencies, including published unauthenticated DoS advisories | Next.js and ESLint config updated to 16.4.2, Auth.js to beta.32, React to 19.2.9, compatible transitive fixes applied. Production dependency audit reports zero advisories. |
| No shared login throttling | Atomic PostgreSQL counters enforce 20 login requests per IP per minute, shared between web and mobile; five attempts per account/IP pair per five minutes protect password verification. |
| Browser sessions could read arbitrary stored files | Every unsigned private-file read validates the current account, selected property, and file ownership. Accessible property logos have a separate narrow exception for the property picker. |
| Several actions trusted a client-editable property cookie | The shared selection helper now validates active-property ownership; forged cookies cannot select another manager's property. |
| JWT roles and account status could outlive permission changes | Every application authorization checks the current account. Deactivation, property deactivation, and role changes apply to existing sessions. |
| Password resets left sessions usable | Browser JWTs include a credential fingerprint; password changes invalidate them and delete all of the account's mobile sessions. Existing browser sessions without a fingerprint must sign in again after this upgrade. |
| Unbounded JSON/multipart reads | Actual streamed bytes are counted, including requests without Content-Length. Invalid bodies return controlled errors; oversized reads stop; body reading has a 10-second deadline. |
| Uploaded MIME labels were trusted | Accepted images/PDFs must match their file signatures. HTML disguised as an image or PDF is rejected. This is format screening, not malware scanning. |
| Small XLSX files could expand excessively | ZIP metadata and actual decompression are checked before ExcelJS loads a workbook: 2,048 entries, 8 MiB per entry, 24 MiB total, and bounded sheets/rows/columns/cells. |
| Untrusted post-login redirect reached router.push | Only internal callback paths are accepted; script URLs, external hosts, backslashes, and login loops fall back to the dashboard. |
| Concurrent automatic settlements could double-record rent | A warmed-pool reproduction produced 10 payments for one balance. Transactional tenancy locks reduce the same 10 overlapping settlements to one payment. Collections and receipt deletion use the same lock. |
| Concurrent check-ins could claim the same available bed | An atomic status update claims the bed before creating a tenant. Mobile check-ins also explicitly require a vacant bed, preventing a stale request from editing the winning tenant. |
| Expensive/billable operations could be repeated rapidly | Shared user limits protect uploads, mobile writes, imports, exports, snapshots, and password changes. WhatsApp has recipient and aggregate budgets and a 10-second provider timeout. |
| Database connections could queue indefinitely | Reused client, five connections per instance, five-second connection acquisition timeout, 30-second query timeout, and 30-second idle cleanup. Snapshot transactions have explicit deadlines. |
| File ownership checks used five parallel queries | One scoped ownership query replaces them; indexes cover private-file keys and expired-session cleanup. |
| Public login-picker requests repeatedly queried the database | Only the already-public account labels are cached for 30 seconds. Authentication, current roles, ownership, and private records are not shared-cache authorization decisions. |
| Local file tracing pulled the whole project into server bundles | Runtime-only local paths are excluded from Turbopack tracing. Uploaded files remain outside the web root. |
| Missing browser hardening headers | CSP, frame restrictions, MIME-sniff prevention, referrer/permissions policies, production HSTS, and removal of X-Powered-By. Private file/search responses are not cacheable. |
| Vercel could fall back to temporary disk or anonymous storage credentials | Vercel requires durable Supabase Storage and a server-only service-role key. Production also requires a cleanup cron secret. |

The framework update addresses current published fixes; see the
[Next.js October security release](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

## Traffic controls

`src/lib/security/traffic.ts` is a cheap, bounded per-instance backstop before
authentication/database work. It caps its map at 10,000 active entries and does
not evict live counters to admit rotating identifiers. It is not a distributed
firewall: cold starts and additional instances have separate maps.

`src/lib/security/rate-limit.ts` provides the shared limits using a parameterized,
atomic database upsert. Identifiers are HMAC-hashed rather than stored as raw IPs
or emails. Counter values saturate, expiration is fixed, and errors fail closed
with 503/Retry-After instead of performing expensive work without a limiter.
Expired counters and mobile sessions are removed by daily maintenance.

Only Vercel-overwritten forwarding headers are trusted for IP identity. Arbitrary
forwarding headers are ignored outside Vercel. A self-hosted deployment must add
an explicit trusted-proxy configuration rather than trusting user headers. See
[Vercel request headers](https://vercel.com/docs/headers/request-headers).

| Shared operation | Limit |
| --- | --- |
| Web + mobile login, per IP | 20/minute |
| Login account/IP pair | 5/5 minutes |
| Mobile writes; shared floor/payment action context | 60/user/minute per scope |
| Document uploads | 15/user/minute |
| Imports | 10/user/minute |
| Expense PDF export | 5/user/minute |
| Mobile full snapshot | 12/user/minute |
| Password changes | 5/user/15 minutes |
| Property administration | 15/user/minute |
| WhatsApp delivery | 3/recipient/15 minutes and 200/app/minute |

These are starting policies, not measured maximum capacity. Monitor legitimate
office traffic and 429 responses before tuning them. Signed file links remain
usable until their short expiry; they are not revoked individually on sign-out.

## Required Vercel deployment steps

1. Review/apply the two new additive migrations before running the new app:
   `20261022150000_security_rate_limits` and
   `20261022153000_security_lookup_indexes`. The existing `npm run build` runs
   migration deployment first. Back up the database and test on staging first;
   ordinary index creation can briefly lock writes. Until the counter table
   exists, protected operations fail closed. Do not run the integration fixtures
   against production.
2. Set a generated `AUTH_SECRET` with at least 32 characters, a separate generated
   `CRON_SECRET` with at least 32 characters, pooled `DATABASE_URL`, migration
   `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the
   correct Vercel environments. Never place the service-role key in a
   `NEXT_PUBLIC_*` variable. Use `STORAGE_DRIVER=supabase`.
3. Confirm the `triya-uploads` bucket is **private** and has no anonymous-read
   policy. Application authorization cannot protect files that are separately
   public at the storage provider. Existing public buckets are not automatically
   converted by this patch. See
   [Supabase bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals).
4. Configure the edge firewall rules below. They must run before functions and
   database queries. There is no authenticated Vercel connection in this workspace
   to confirm or publish them. Rate-limit rules cannot be enabled merely by adding
   the application limiter or a `vercel.json` header.
5. Confirm the existing daily `/api/cron/reset-payments` job runs successfully
   with the secret. It updates payment status, applies the existing six-month
   tenant-retention policy, and now removes expired sessions/counters. Do not
   manually trigger it against production just as a health check: it changes data.
6. Configure traffic/error/latency and database connection monitoring, spending
   alerts, and the organization's intended spending controls. Verify that backup
   restoration works. Keep the function region close to the database.
7. Smoke-test the deployed hostname using synthetic staging accounts, including
   browser/mobile login, property selection, file access, receipt generation,
   password reset, and the actual HTTPS/security headers. Repeat the latency
   checks with the deployed database and realistic property sizes.

### Concrete edge rules to review

Use the Vercel project's Firewall configuration, count by client IP, and block
excess traffic rather than challenging native mobile requests with browser-only
JavaScript. Start with the login rule if the plan permits only one rate-limit
rule. Check plan limits in the dashboard. See
[Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

| Match | Starting edge rate |
| --- | --- |
| POST `/api/auth/callback/credentials` or `/api/mobile/login` | 20/minute/IP |
| POST under `/api/`, or POST with a `Next-Action` header | 60/minute/IP |
| GET `/api/mobile/snapshot` | 12/minute/IP |
| GET `/api/expenses/export` | 5/minute/IP |
| Other dynamic API/page traffic | 180/minute/IP; exclude static assets |

Review overlapping rules and shared-office IPs. Do not bypass managed DDoS
protection for the whole application. Attack Challenge Mode is an incident tool;
enabling it globally can block native clients and external invoice fetchers.

## Validation and limits of the evidence

Final verification: 10 security regression cases, 51 existing mobile integration
assertions, and 54 targeted security assertions passed (115 total), along with
the production build, full TypeScript/ESLint checks, and a real-browser smoke
check of login, dashboard hydration, the property menu, and mobile navigation.
The final 20-request local authenticated-search check measured 106 ms p95. No
runtime or CSP errors appeared in the browser smoke check.

- `npm run check:security`: ten regression cases covering body limits, spoofed
  headers, bounded counter storage, forged file types, safe spreadsheets, ZIP
  bombs, redirect validation, and multiplied property creation.
- `npm run check:mobile`: the existing 51 integration assertions against the
  isolated local production server.
- `scripts/check-security-api.ts`: real web CSRF/cookie and mobile login, cookie
  tampering, file ownership/signatures, account/role/property revocation, password
  session revocation, 429/Retry-After, atomic shared counters, overlapping
  check-ins/settlements, and 20 concurrent authenticated searches.
- Full ESLint, TypeScript, production compilation, migration application in the
  isolated database, and dependency audits.

The concurrency check is deliberately small and local. Its timings are not a
production benchmark or a simulated DDoS test. No destructive or high-volume
traffic was sent to a live deployment.

Vercel uploads and imports are capped at 3 MiB; request/proxy buffering is capped
at 4 MiB to leave multipart room. See the platform's
[function body limits](https://vercel.com/docs/functions/limitations).

Known remaining considerations:

- Nine audit findings remain in development/build tooling through the unpatched
  `braces` glob parser. They are excluded from the production dependency audit.
  Do not feed untrusted glob expressions into these tools; track the upstream
  fix. Forced audit remediation proposes incompatible tool downgrades and was
  not applied.
- The login account picker intentionally publishes active account names, emails,
  and roles. This existing product behavior is preserved. A private account-entry
  or invitation flow would reduce account enumeration.
- The baseline CSP permits inline scripts needed by the current Next.js output;
  it is not a strict nonce-based policy or a replacement for safe rendering.
- File signatures are not antivirus scanning or complete image/PDF validation.
  Consider quarantine/scanning if untrusted tenants receive direct upload access.
- Full mobile snapshots and some historical lists still grow with property data.
  Request rates/timeouts bound repeated work, but pagination/incremental sync and
  queued bulk messaging are appropriate before substantially larger rollouts.
- Query timeouts bound the application wait, not every possible database-side
  resource use. Configure appropriate Postgres/pooler statement limits and
  monitor actual connection capacity on the hosting plan.
- The Compose file now binds PostgreSQL to loopback. The existing local container
  was not recreated; apply the new binding during a planned local restart.

## Reproducing the integration checks

Use a newly created local database named `triya_security_YYYYMMDD`, migrate it,
and run a separate production build/server on localhost:3109 with
`TRIYA_TEST_DIST_DIR=.next/security-audit` and
`STORAGE_LOCAL_DIR=/tmp/triya-security-uploads`. Set a test-only auth/cron secret,
`STORAGE_MAX_FILE_MB=2`, and empty Twilio credentials so no real messages can be
sent. Both integration scripts reject remote database/server URLs.

Run the existing mobile suite first, then run the security suite using:

```sh
node --conditions=react-server --import tsx scripts/check-security-api.ts
```

Set the same test `DATABASE_URL`, `AUTH_SECRET`, storage directory, and test-server
URL in the process environment. Recreate/clear only the isolated server's account
data cache when replacing fixtures. Never point these scripts at application
data. The mobile suite intentionally clears fixture records in its guarded test
database.
