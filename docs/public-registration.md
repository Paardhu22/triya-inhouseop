# Public tenant registration

Flow: website form -> website server `/api/register` -> admin `POST /api/public/registrations`
(server-to-server, shared secret) -> `RegistrationRequest` (PENDING) -> admin **Registrations**
page -> pick vacant bed -> existing tenant form (`BedForm` -> `saveBed`) prefilled -> save ->
request marked APPROVED in the same transaction.

## Setup (nothing here has been applied to any live system)

1. **Reconcile migrations first.** The working tree has uncommitted migration changes
   (`20261008000000_sync_schema_drift` deleted, `migration_lock.toml` modified,
   `20261007092141_new` untracked). Before deploying:
   - compare the live `_prisma_migrations` table with `prisma/migrations/`;
   - decide which of those uncommitted changes are intended and commit them;
   - only then run `prisma migrate deploy`.
2. New migration: `prisma/migrations/20261124000000_registration_requests/migration.sql`.
   It is additive (new enum, new table, one nullable `Property.websiteSlug` column + unique
   index) and enables RLS on the new table. It matches `prisma migrate diff` from the previous schema.
3. Admin env: `PUBLIC_REGISTRATION_SECRET` (>= 32 chars). Website env: `TRIYA_ADMIN_URL`,
   `REGISTRATION_API_SECRET` (same value). Neither is `NEXT_PUBLIC_*`.
4. In the admin app, as ADMIN, open **Registrations** for a property and enter its website
   listing slug. Until then that property accepts no registrations. Note the website's
   current listing data (`triya-house`, `the-terrace`, ...) is placeholder content; no
   listing matches a real admin property, so nothing is mapped by default.

## Data handling

- KYC images: private bucket, key `registrations/<uuid>.<ext>`; JPG/PNG/WebP up to 3 MB, magic
  bytes verified. Admin preview goes through `/api/files/...` (session + property ownership).
- On approval the same object becomes the tenant's KYC (no copy). On reject/expiry it is deleted.
- Retention (daily cron `/api/cron/reset-payments`): PENDING > 30 days -> EXPIRED + file deleted;
  closed requests > 90 days are purged. Consent version is stored per request.

## Tests

Disposable local Postgres only (the scripts refuse any other database):

```
docker run -d --rm --name reg-test-pg -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 55432:5432 postgres:16-alpine
DATABASE_URL=postgresql://t:t@localhost:55432/t DIRECT_URL=postgresql://t:t@localhost:55432/t npx prisma db push
REGISTRATION_TEST_DB=1 DATABASE_URL=postgresql://t:t@localhost:55432/t npm run check:registration
```

## Permissions

Only ADMIN and MANAGER may view, review, approve or reject requests, and read a pending request's
KYC image (`canReviewRegistrations` in `src/lib/registrations/permissions.ts`). Enforced server-side:
`saveBed` (whenever `registrationId` is present, so the mobile API is covered), `rejectRegistration`,
the Registrations page, `/api/files` and `/api/mobile/file`. STAFF keep manual tenant create/edit
(saves without `registrationId` are unchanged). After approval the image belongs to the tenant and
follows normal tenant-file rules. `setWebsiteSlug` is ADMIN only.
