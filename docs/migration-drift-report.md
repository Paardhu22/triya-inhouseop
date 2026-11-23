# Prisma migration drift report

Investigated read-only on 2026-11-23. No migration was applied to any real database, and no
migration file was changed by this investigation.

## Facts

| Item | State |
|---|---|
| Git HEAD (`e0329b3`) migrations | init, add_email_maintenance_notice, add_invoice_and_property_phone, expense_categories_dynamic, add_property_isflat, **`20261008000000_sync_schema_drift`**, security_rate_limits, security_lookup_indexes |
| Working tree | `20261008000000_sync_schema_drift` **deleted**; **`20261007092141_new` untracked** (same changes); `migration_lock.toml` differs by line endings only |
| Local dev DB (`localhost:5432/triya_manager`, read-only query) | `_prisma_migrations` has `20261007092141_new` applied; **no** `20261008000000_sync_schema_drift` row |
| Production / Supabase DB | **Not inspected** (no credentials in this environment). Unknown which of the two names it recorded |

`sync_schema_drift` (committed 2026-10-08, commit `9224306`) and `_new` contain identical DDL
(`_new` only adds a generated warning comment). Both add: `Invoice.lastError/paidPaise/paymentId/receivedPaise`,
`Payment.cashAmount/onlineAmount/recordedById`, `Property.logoKey/rulesText`, `Room.defaultRent/defaultMaintenance`,
`User.propertyId`, the `PaymentMethod` enum shrink to CASH/ONLINE/SPLIT, indexes and FKs.
So a developer re-ran `prisma migrate dev` locally (producing `_new`) and deleted the committed file.

Replay checks on a throwaway Postgres:
- Committed set (HEAD) replayed -> `prisma migrate diff` to HEAD schema: **empty**. HEAD is self-consistent.
- Working-tree set (with `_new`) replayed -> diff to current `schema.prisma`: **only the registration additions**
  (`20261124000000_registration_requests`). No other drift.
- The two replayed schemas (with `_new` vs with `sync_schema_drift`) are identical (`pg_dump -s` diff is only random tokens).
- Local dev DB vs `schema.prisma`: only the registration additions.

## The risk

`npm run build` runs `prisma migrate deploy`. Both files must never coexist, and the set must match what the
target DB recorded:
- If prod recorded `sync_schema_drift` and the deploy ships `_new` instead, deploy tries to re-apply the same
  DDL under a new name and **fails** (`column already exists`), blocking the Vercel build.
- If prod recorded `_new` (e.g. someone applied the working tree) and the deploy ships `sync_schema_drift`, same failure.
- If prod recorded neither (migrations not yet applied), either works.
- Shipping both fails everywhere that has applied one of them.

## Human decisions required (before any deploy)

1. **Read prod's `_prisma_migrations`** (read-only): `select migration_name, finished_at, rolled_back_at from "_prisma_migrations" order by started_at;`
2. **Choose the surviving name** (recommended: whichever prod already recorded; if neither, keep the committed
   `sync_schema_drift` because it is in history).
3. Decide how developer databases that applied the other name are fixed (local only; see step 4 below).
4. Confirm line-ending policy for `migration_lock.toml` (add a `.gitattributes` or restore LF).

## Reconciliation plan (not executed)

1. Snapshot/backup prod; do the rest first on a **staging copy restored from that snapshot**.
2. Based on step 1 above:
   - *prod has `sync_schema_drift`*: restore it (`git checkout HEAD -- prisma/migrations/20261008000000_sync_schema_drift`), move `_new` out of the repo, commit.
   - *prod has `_new`*: keep `_new`, commit it, commit the deletion of `sync_schema_drift`.
   - *prod has neither*: restore `sync_schema_drift`, drop `_new`.
3. On staging run `npx prisma migrate status` (must say "up to date" before the registration migration, with no
   missing/failed entries), then `npx prisma migrate deploy` — this applies only
   `20261124000000_registration_requests` (additive; verified identical to Prisma's own diff, plus `ENABLE ROW LEVEL SECURITY`).
4. Local dev DB that recorded the other name: after reconciling the files, align its history with
   `prisma migrate resolve --applied <name>` (and remove the stale row) — **local databases only**, never prod.
5. Confirm `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` is empty on staging.
6. Only then deploy; the build's `migrate deploy` becomes a no-op plus the one new migration.
