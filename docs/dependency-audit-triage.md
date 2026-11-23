# npm audit triage (production dependencies)

Run 2026-11-23 after the Next 16.4.5 upgrades. Nothing below was changed. `npm audit`'s own "fix" for
Prisma (`prisma@6.12.0`) is a **downgrade across a major** and must not be applied; the npm `latest` tag for
`prisma` is currently `8.0.0-rc.34` (a release candidate).

## Admin

| Package | Severity | Path | Advisory | Exposure | Minimum safe fix |
|---|---|---|---|---|---|
| `zod` 4.4.3 (direct) | high | direct | memory exhaustion on oversized constrained collections (<4.6.6) | Used in 16 files on server inputs; mostly small forms and file uploads, but a real DoS vector | `npm install zod@^4.6.6` (4.6.7 is latest; same major, caret range already allows it). Run tsc + check:security + check:registration |
| `follow-redirects` 1.16.1 | high | twilio -> axios | credentials can follow redirects (1.16.0-1.16.1) | Only Twilio API calls to fixed hosts; low | `npm update follow-redirects` (-> 1.16.3, within axios `^1.16.0`). No major change |
| `effect` 3.20.0 | high | prisma -> @prisma/config (exact pin) | ReDoS in `Schema.TemplateLiteral` (<=3.22.0) | Only inside Prisma CLI config loading at dev/build time, never at request time; negligible | No clean fix: every Prisma 7.x (<=7.10.1) pins `effect@3.20.0`. Wait for a Prisma 7.x patch, or (needs approval) add an npm `overrides` for `effect@^3.22.3` and test `prisma generate/db push` |
| `prisma`, `@prisma/config` | high | derived from `effect` | - | same as above | same as above. **Do not** move to Prisma 8 RC |

## Website

| Package | Severity | Path | Advisory | Exposure | Minimum safe fix |
|---|---|---|---|---|---|
| `nanoid` 3.3.16 | high | next -> postcss 8.5.23 | infinite loop when custom generator size is 0 (<3.3.18) | postcss uses it for build-time ids only; negligible | Wait for a Next release bundling a newer postcss, or `overrides: { nanoid: "3.3.20" }` after a build check |
| `source-map-js` 1.2.1 | high | next -> postcss | event-loop DoS via source-map section offsets (<1.2.2) | build-time only; negligible | same: override or wait for Next |

## Recommended order

1. `zod@^4.6.6` and `follow-redirects` (low risk, same majors) — admin.
2. Leave `effect`/Prisma and the website's build-time transitive items until upstream fixes, unless the
   release process requires a clean audit; then approve targeted `overrides` and re-run all checks.
3. Never apply `npm audit fix --force`.
