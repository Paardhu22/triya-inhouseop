# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16 + Prisma 7 + React 19.** These are recent majors with breaking
> changes from older docs. Before writing framework code, read the relevant guide
> under `node_modules/next/dist/docs/` (per AGENTS.md) and heed deprecation notices.

## What this is

Triya Manager is a PG / co-living management system for property staff: occupancy
(floor → room → bed), tenants, rent collections, payments, complaints, and expenses,
all scoped to a single "active property" selected per session.

## Commands

```bash
npm run dev            # Next dev server (http://localhost:3000)
npm run build          # prisma generate + next build
npm run lint           # eslint (flat config, eslint.config.mjs)

# Database (Postgres via Docker)
npm run db:up          # start the local Postgres container (docker compose, --wait)
npm run db:down        # stop it
npm run db:migrate     # prisma migrate dev (create/apply a migration)
npm run db:generate    # regenerate the Prisma client into src/generated/prisma
npm run db:seed        # seed staff + empty property structure (tsx prisma/seed.ts)
npm run db:reset       # drop, re-migrate, re-seed
npm run db:studio      # Prisma Studio
```

No test runner is configured — there is no test command. Verify changes with
`npm run build` (runs `tsc`) and `npm run lint`.

First-time setup: `cp .env.example .env`, `npm run db:up`, `npm run db:migrate`,
`npm run db:seed`. Seeded login: `admin@triya.local` / `Admin@12345` (staff users
use `Staff@12345`).

## Architecture

### Request/data flow (per feature — the vertical slice)

Each domain feature (tenants, collections, complaints, expenses, floor, admin,
settings) is a vertical slice with the same shape:

- **Page** — `src/app/(app)/<feature>/page.tsx`, a React Server Component. Resolves
  the active property, calls a query, renders a `*-client.tsx`.
- **Query** — `src/lib/queries/<feature>.ts` (`import "server-only"`). Read-only
  Prisma reads, always filtered by `propertyId`. Co-locates derived types via
  `Awaited<ReturnType<typeof ...>>`.
- **Client component** — `src/components/<feature>/<feature>-client.tsx`. Interactive
  UI; calls server actions and toasts results (`sonner`). Search/filter is done
  client-side over the full list with `useMemo` (see `collections-client.tsx`,
  `tenants-client.tsx`).
- **Action** — `src/lib/actions/<feature>.ts` (`"use server"`). Mutations. Validates
  with a Zod schema from `src/lib/validations/`, writes via Prisma, calls
  `revalidatePath`, returns an `ActionResult`.
- **Validation** — `src/lib/validations/<feature>.ts`, Zod schemas. Often a pair: a
  server schema that coerces `FormData` strings, and a client schema of plain strings
  with a `superRefine` for friendly per-field messages (see `tenant.ts`).

### Multi-tenancy: the active property

The app is always scoped to one property. The selected id lives in an httpOnly cookie
(`triya.property`), set by `selectProperty` in `src/lib/actions/property.ts`.

- Server: `src/lib/property.ts` — `getSelectedPropertyId()`, `getActiveProperty()`,
  `requireActiveProperty()`. **Every query and action must filter by this
  `propertyId`** — it is the tenant boundary, not optional.
- Client: `src/stores/property-store.ts` (Zustand) mirrors the active property,
  hydrated by `PropertyStoreHydrator` from the `(app)` layout.
- `(app)/layout.tsx` redirects to `/login` if unauthenticated and `/select-property`
  if no property is selected.

### Auth (Auth.js v5 / next-auth beta)

Split for edge-safety:
- `src/auth.config.ts` — edge-safe config (matcher `authorized` callback, JWT
  session, role propagation). **Must not import Prisma/bcrypt or any Node-only code.**
- `src/auth.ts` — full Node instance; the Credentials `authorize` (Prisma + bcrypt)
  lives here.
- `src/proxy.ts` — Next 16 renamed Middleware to **Proxy**. It needs a statically
  recognizable `proxy` (or default) function export — a destructured `const` export
  is NOT detected. It delegates to Auth.js's `auth` handler.

Roles are `ADMIN | MANAGER | STAFF` (`session.user.role`), typed in
`src/types/next-auth.d.ts`.

### Money: integer paise everywhere

All monetary amounts (rent, maintenance, deposits, expenses, payments) are stored as
**integer paise** (1 rupee = 100 paise) to avoid float drift and Decimal
serialization across the RSC boundary. Convert at the form boundary and format for
display with `src/lib/money.ts` (`rupeesToPaise`, `paiseToRupees`, `formatINR`,
`formatINRCompact`). Never store rupees or floats.

### Tenancy business rules

`src/lib/tenancy.ts` is a **pure, client-safe module** (no Node/Prisma imports) holding
the shared occupancy/finance rules so server actions and client UI agree:
- `NOTICE_PERIOD_DAYS = 15` — fixed system-wide; there is intentionally no per-tenancy
  override and no UI input for it.
- `MAINTENANCE_RESERVE_PAISE` (₹1000) — held back from a tenant's security deposit at
  move-in. The stored `Tenancy.securityDeposit` is **net** of this reserve, so every
  display site is consistent without extra math.
- `vacateByDate()` / `resolveDepositStatusOnVacate()` — derive the notice vacate-by
  date and the `DepositStatus` (REFUNDABLE only when proper notice was served and the
  full period elapsed; otherwise FORFEITED).

### Occupancy & history model

- Structure: `Property → Block? → Floor → Room → Bed`. `Block` only when
  `Property.hasBlocks` (drives whether the Floor Manager shows a Block selector).
- `FloorTemplate`/`RoomTemplate` let a property define a layout once and instantiate
  it onto many identical floors.
- A `Tenancy` is one occupancy of a bed by a tenant. **Vacating ends the tenancy**
  (`status = ENDED`, `checkOutDate` set, `depositStatus` resolved) rather than
  deleting it — history is preserved. The active occupant is the tenancy with
  `status = ACTIVE`.
- `Bed.status`, `Tenancy.paymentStatus` and `Tenancy.depositStatus` are denormalized
  snapshots kept in sync by actions. `src/lib/actions/floor.ts` `saveBed` is the
  canonical example: one action covers vacate, new move-in, and edit, transactionally,
  keeping the bed status, the payments ledger, and the KYC photo/document in step.
  `giveNotice` stamps `noticeGivenDate`.

### File storage

`src/lib/storage.ts` defines a `StorageDriver` interface; the default is a local-disk
driver writing **outside the web root** (`STORAGE_LOCAL_DIR`). Files are served only
through the authenticated route `src/app/api/files/[...key]/route.ts` — `storageKey`
columns are paths, never public URLs. Swapping to S3/R2 = implement the interface and
repoint `storage`. `next.config.ts` raises the server-actions body limit for uploads.

### Conventions

- Server actions return `ActionResult<T>` (`src/lib/action-result.ts`): a
  `{ ok: true, data } | { ok: false, error }` union — clients branch on `ok` and toast
  the error. Do not throw across the action boundary for expected failures.
- `src/app/(app)/` is the authenticated shell (sidebar + topbar); `login`,
  `select-property`, and the root redirect live outside it. Nav is centralized in
  `src/components/shell/nav-config.ts`.
- Prisma client is generated to **`src/generated/prisma`** (not `node_modules`); import
  from `@/generated/prisma/client`. Prisma 7 is engine-less and connects through the
  **node-postgres driver adapter** (`PrismaPg`, singleton in `src/lib/prisma.ts`); the
  datasource URL comes from `prisma.config.ts` (reads `.env`), not the schema. Run
  `npm run db:generate` after schema changes (also a `postinstall` step).
- UI is shadcn/ui (`src/components/ui/`, Radix + Tailwind v4) + `lucide-react` icons.
- The app is **light-theme only and intentionally minimal**; preserve the existing
  blueprint/technical visual style when changing design.
</content>
