# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16 + Prisma 7 + React 19.** These are recent majors with breaking
> changes from older docs. Before writing framework code, read the relevant guide
> under `node_modules/next/dist/docs/` (per AGENTS.md) and heed deprecation notices.

## What this is

Triya Manager is a PG / co-living management system for property staff: occupancy
(floor → room → bed), tenants, rent collections, payments, WhatsApp rent invoices,
complaints, and expenses, all scoped to a single "active property" selected per
session.

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
npm run db:mock        # populate a full demo property with data (tsx prisma/mock-frieden.ts)
npm run db:reset       # drop, re-migrate, re-seed (prisma migrate reset)
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
settings, dashboard) is a vertical slice with the same shape:

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

Multi-property CRUD (create/rename/deactivate properties, per-property account
passwords) is ADMIN-only and lives inside the admin slice as its own
action/query/validation trio (`properties.ts`) rendered by `PropertiesManager`
within the admin page, rather than as a separate top-level nav route.

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
- Two per-property display flags on `Property` change how the rest of the UI
  behaves: `hasBlocks` (Floor Manager shows a Block selector before Floor) and
  `isFlat` (self-contained flats/studios with no per-bed sharing — the UI shows
  "Flat <number>" instead of "Room <number> · Bed <label>" throughout).

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
- The Floor Manager UI additionally derives a page-local, visual-only status
  (`Vacant`/`Paid`/`Pending`/`Overdue`) from `Bed.status` + `Tenancy.paymentStatus` in
  `src/components/floor/bed-status.ts`. This is distinct from the app-wide
  `BED_STATUS_META` / `PAYMENT_STATUS_META` in `src/lib/status.ts`, which cover the two
  underlying fields separately and are used everywhere else in the app.

### Rent ledger & payment states

`src/lib/rent.ts` (pure) + `src/lib/ledger.ts` (`server-only`) own the rules:
- A `Payment` row is one collection; a billing month (`forMonth`) can hold several (part
  payments, cash and/or online). Nothing sets `Tenancy.paymentStatus` by hand — it is
  re-derived via `refreshPaymentStatus`. List screens derive status from the ledger
  rather than trusting that snapshot.
- Two orthogonal derived states: `resolveCollectionState` → `PAID | PARTIAL | UNPAID`
  (amounts) and `resolvePaymentStatus` → `PAID | PENDING | OVERDUE` (due date). A part
  payment can be overdue. The shared filter set is `PAYMENT_FILTER_OPTIONS` /
  `matchesPaymentFilter` (Collections, Tenants, Reports).
- `rentDueDate` is the ONE due-date rule (tenancy `paymentDueDay`, else the 5th) — used
  by the status, invoices, reminders and the tenant profile.
- **Earlier dues** (`earlierDues`): shortfall for each month from `ledgerStartMonth`
  (later of check-in month and the tenancy's `createdAt` month, so imported tenancies do
  not owe pre-import months) up to the viewed month, using the CURRENT rent.
- Reminders: `remindPendingTenants` messages only tenants with anything outstanding;
  `remindAllTenants` messages everyone. Both bodies state each tenant's own balance.
- There is no "mark unpaid". A wrong collection is corrected by deleting that receipt
  (ADMIN/MANAGER) in the Collect Rent dialog.

### File storage

`src/lib/storage.ts` defines a `StorageDriver` interface; the default is a local-disk
driver writing **outside the web root** (`STORAGE_LOCAL_DIR`). Files are served only
through the authenticated route `src/app/api/files/[...key]/route.ts` — `storageKey`
columns are paths, never public URLs. Swapping to S3/R2 = implement the interface and
repoint `storage`. `next.config.ts` raises the server-actions body limit for uploads.

### Invoices & WhatsApp delivery

Rent invoices are **part of the collections slice**, not their own feature folder:
actions live in `src/lib/actions/collections.ts` (`prepareInvoice`, `sendInvoice`,
`resendInvoice`), the history query in `src/lib/queries/invoices.ts`, validation in
`src/lib/validations/invoice.ts`, and UI under `src/components/collections/`
(`invoice-*.tsx`, `send-invoice-button.tsx`).

- **One shape, two renderers.** `src/lib/invoice-compute.ts` is a **pure, client-safe**
  module (no Node/Prisma — same pattern as `tenancy.ts`) defining `InvoiceView` and
  `computeInvoiceTotals`. The on-screen HTML preview and the server-generated PDF both
  render from the same `InvoiceView`, so the numbers always agree. Charges are integer
  paise; `total = (rent + maintenance + previousDue + extra) − discount`, floored at 0.
- **PDF**: `src/lib/invoice.ts` (`server-only`) renders an A4 PDF with `pdf-lib`. Its
  standard fonts are WinAnsi and **cannot draw the ₹ glyph**, so the PDF uses an `Rs.`
  prefix; the HTML preview and WhatsApp body are unicode and use ₹.
- **Delivery**: `src/lib/twilio.ts` (`server-only`) sends a WhatsApp media message via
  Twilio; lazy singleton client, normalizes Indian numbers to `whatsapp:+E164`.
- **Twilio must fetch the PDF by URL from the cloud**, which drives two pieces:
  `src/lib/public-url.ts` resolves `APP_PUBLIC_URL` and **rejects localhost with an
  actionable error** (use an ngrok tunnel in dev); and the PDF is served through the
  normal authenticated `api/files/[...key]` route, which also accepts a short-lived
  **HMAC-signed token** (`src/lib/file-token.ts`, signed with `AUTH_SECRET`) so Twilio
  can fetch it without a session and without ever minting a permanent public link.
- **`sendInvoice` is staged so a failure never orphans data**: (1) reserve the invoice
  row + number (`INV-YYYYMM-NNNN`, unique per property); (2) render + store the PDF,
  deleting the reserved row if this fails; (3) send WhatsApp — on send failure the row
  is **kept as `status = FAILED`** so `resendInvoice` can retry it.
- **Issuing lives in `src/lib/invoice-delivery.ts`** (`server-only`): `previewInvoice`,
  `issueInvoice`, `deliverInvoice`, `issueInvoiceForPayment`. Actions stay thin.
- **Every collection issues an invoice automatically.** `collectRent` (and `saveBed`
  when "Paid" records money) commits the Payment FIRST, then calls
  `issueInvoiceForPayment`, which links the invoice to the payment (`Invoice.paymentId`)
  and snapshots `receivedPaise` (this collection) and `paidPaise` (month total so far),
  so the PDF shows paid-so-far and the balance. Collect Rent has a default-on
  "send invoice" checkbox; the importer never issues invoices. A delivery failure keeps
  the invoice as FAILED with `lastError` — it never rolls back the payment.
- **Env**: invoices need `APP_PUBLIC_URL` (public, non-localhost) and
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` (see
  `.env.example`).

### Bulk import (spreadsheets in)

Properties arrive with their history in Excel, so `/import` (ADMIN-only, in `ADMIN_NAV`)
takes a CSV / TSV / `.xlsx` upload — or cells pasted straight out of Excel — and writes
it into the app. Four sheet types: **tenants** (residents + occupancy), **structure**
(floors/rooms/beds), **payments** (historical receipts) and **expenses**.

- **The field catalogue is the single source of truth.** `src/lib/import/fields.ts`
  defines every importable column, its type, and the header spellings to recognise. The
  mapping UI, the auto-mapper, the validators and the downloadable templates are all
  generated from it, so a new column is a one-file change.
- **Pure core, server shell** — same split as `tenancy.ts` / `rent.ts` /
  `invoice-compute.ts`. `coerce.ts`, `validate.ts`, `auto-map.ts`, `fields.ts`,
  `template.ts` and `types.ts` are pure and client-safe; the browser guesses the column
  mapping and previews single cells with the very same code the server validates with.
  **The server never trusts the client's verdict on a row** — it re-coerces the raw
  strings. `parse-file.ts`, `structure-map.ts`, the four `plan-*.ts` and `run.ts` are
  `server-only`.
- **Every cell is read as a string** by `parse-file.ts` (papaparse for delimited text,
  exceljs for `.xlsx`, which is in `serverExternalPackages`). All interpretation happens
  in `coerce.ts`, so no library gets to decide whether `03/04/2024` is March or April —
  it is read **day-first**, and legacy `.xls` is rejected with an actionable message.
- **Preview is a real dry run.** `run.ts` builds the plan, renders it, and throws it
  away; commit re-plans *inside* the transaction and applies it. One resolver, so the
  preview cannot promise something the commit does not do. Valid rows import and bad
  rows are reported rather than failing the whole sheet.
- **The tenants importer must not drift from `saveBed`** (`src/lib/actions/floor.ts`):
  it holds back `MAINTENANCE_RESERVE_PAISE` from the deposit and seeds the ledger via
  `settleMonth` + `refreshPaymentStatus` rather than setting `paymentStatus` by hand.
  Historical **payments** deliberately bypass `settleMonth` (which clamps to the
  outstanding balance) and write `Payment` rows at their literal amount.
- **Re-running a sheet is safe.** Tenants dedupe on the last 10 digits of the phone,
  payments and expenses on a natural key, so a second pass reports "already on file"
  instead of double-writing.
- **Row numbers are the user's own.** `ParsedSheet.firstDataRow` carries the offset past
  any title row, and blank rows are kept mid-file, so every number reported back points
  at the right line of their spreadsheet.

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
