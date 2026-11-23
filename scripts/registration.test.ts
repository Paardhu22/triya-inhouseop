/**
 * Integration tests for public tenant registration. They write to a real Postgres, so they
 * refuse to run unless pointed at a disposable local database:
 *
 *   docker run -d --rm --name reg-test-pg -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 55432:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://t:t@localhost:55432/t DIRECT_URL=$DATABASE_URL npx prisma db push
 *   REGISTRATION_TEST_DB=1 DATABASE_URL=... npm run check:registration
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const url = process.env.DATABASE_URL ?? "";
if (process.env.REGISTRATION_TEST_DB !== "1" || !/@(localhost|127\.0\.0\.1):\d+\//.test(url)) {
  throw new Error("Refusing to run: set REGISTRATION_TEST_DB=1 and a localhost DATABASE_URL");
}
process.env.AUTH_SECRET = "x".repeat(40);
process.env.PUBLIC_REGISTRATION_SECRET = "s".repeat(40);
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "reg-test-"));
delete process.env.VERCEL;

const SECRET = process.env.PUBLIC_REGISTRATION_SECRET;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

type Mods = {
  prisma: typeof import("../src/lib/prisma").prisma;
  POST: typeof import("../src/app/api/public/registrations/route").POST;
  GET: typeof import("../src/app/api/public/registrations/properties/route").GET;
  retention: typeof import("../src/lib/registrations/retention").runRegistrationRetention;
  owns: typeof import("../src/lib/mobile/files").propertyOwnsFile;
};
let m: Mods;
let propA: string, propB: string;
let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;

before(async () => {
  m = {
    prisma: (await import("../src/lib/prisma")).prisma,
    POST: (await import("../src/app/api/public/registrations/route")).POST,
    GET: (await import("../src/app/api/public/registrations/properties/route")).GET,
    retention: (await import("../src/lib/registrations/retention")).runRegistrationRetention,
    owns: (await import("../src/lib/mobile/files")).propertyOwnsFile,
  };
  await m.prisma.registrationRequest.deleteMany();
  await m.prisma.rateLimitBucket.deleteMany();
  await m.prisma.property.deleteMany();
  propA = (await m.prisma.property.create({ data: { name: "Mapped", slug: "mapped", websiteSlug: "triya-house" } })).id;
  propB = (await m.prisma.property.create({ data: { name: "Unmapped", slug: "unmapped" } })).id;
});
after(async () => { await m.prisma.$disconnect(); });

function submit(fields: Record<string, string>, opts: { file?: File; secret?: string | null; ip?: string } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (opts.file) form.set("photo", opts.file);
  const headers: Record<string, string> = { "x-registration-client-ip": opts.ip ?? nextIp() };
  if (opts.secret !== null) headers["x-registration-secret"] = opts.secret ?? SECRET;
  return m.POST(new Request("http://localhost/api/public/registrations", { method: "POST", body: form, headers }));
}
const base = (over: Record<string, string> = {}) => ({
  websiteSlug: "triya-house", fullName: "Asha Rao", phone: "9876543210", consent: "true", ...over,
});
const png = () => new File([PNG], "id.png", { type: "image/png" });
const rows = (where = {}) => m.prisma.registrationRequest.findMany({ where });

test("rejects missing or wrong website secret", async () => {
  assert.equal((await submit(base(), { secret: null })).status, 401);
  assert.equal((await submit(base(), { secret: "nope" })).status, 401);
  assert.equal((await rows()).length, 0);
});

test("unmapped website slug cannot accept registrations", async () => {
  const res = await submit(base({ websiteSlug: "the-terrace" }));
  assert.equal(res.status, 404);
  assert.equal((await rows()).length, 0);
});

test("property list exposes only mapped slugs", async () => {
  const res = await m.GET(new Request("http://localhost/x", { headers: { "x-registration-secret": SECRET } }));
  assert.deepEqual((await res.json()).slugs, ["triya-house"]);
  assert.equal((await m.GET(new Request("http://localhost/x"))).status, 401);
});

test("valid submission is PENDING, scoped to the mapped property, ignores admin fields, stores KYC privately", async () => {
  const res = await submit(
    base({ phone: "+91 98765 11111", email: "a@b.co", preferredCheckIn: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), propertyId: propB, status: "APPROVED", bedId: "x", rent: "1" }),
    { file: png() },
  );
  assert.equal(res.status, 201);
  const [row] = await rows({ phone: "9876511111" });
  assert.equal(row.status, "PENDING");
  assert.equal(row.propertyId, propA);
  assert.equal(row.tenantId, null);
  assert.match(row.kycKey ?? "", /^registrations\/[0-9a-f-]+\.png$/);
  assert.ok(existsSync(path.join(process.env.STORAGE_LOCAL_DIR!, row.kycKey!)));
  assert.equal(await m.owns(propA, row.kycKey!, "ADMIN"), true);
  assert.equal(await m.owns(propA, row.kycKey!, "MANAGER"), true);
  assert.equal(await m.owns(propA, row.kycKey!, "STAFF"), false, "STAFF must not read pending registration KYC");
  assert.equal(await m.owns(propA, row.kycKey!), false, "no role = denied");
  assert.equal(await m.owns(propB, row.kycKey!, "ADMIN"), false, "other hotel must not read this KYC");
});

test("duplicate pending request is idempotent and leaves no stray file", async () => {
  const first = await submit(base({ phone: "9000000001" }), { file: png() });
  assert.equal(first.status, 201);
  const second = await submit(base({ phone: "9000000001" }), { file: png() });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).status, "duplicate");
  assert.equal((await rows({ phone: "9000000001" })).length, 1);
});

test("concurrent submissions for one phone create exactly one request", async () => {
  const results = await Promise.all([1, 2, 3].map(() => submit(base({ phone: "9000000002" }), { file: png() })));
  assert.ok(results.every((r) => r.status === 201 || r.status === 200));
  assert.equal((await rows({ phone: "9000000002" })).length, 1);
});

test("fake image content, wrong type and oversize are refused with no row", async () => {
  const before = (await rows()).length;
  const fake = new File([Buffer.from("<script>alert(1)</script>")], "x.png", { type: "image/png" });
  assert.equal((await submit(base({ phone: "9000000003" }), { file: fake })).status, 422);
  const pdf = new File([Buffer.from("%PDF-1.4")], "x.pdf", { type: "application/pdf" });
  assert.equal((await submit(base({ phone: "9000000003" }), { file: pdf })).status, 415);
  const big = new File([Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)])], "big.png", { type: "image/png" });
  assert.equal((await submit(base({ phone: "9000000003" }), { file: big })).status, 413);
  assert.equal((await rows()).length, before);
});

test("validation: bad phone, missing consent, honeypot", async () => {
  assert.equal((await submit(base({ phone: "12345" }))).status, 400);
  assert.equal((await submit(base({ phone: "9000000004", consent: "" }))).status, 400);
  assert.equal((await submit(base({ phone: "9000000005", company: "bot" }))).status, 201);
  assert.equal((await rows({ phone: { in: ["12345", "9000000004", "9000000005"] } })).length, 0);
});

test("per-IP rate limit returns 429", async () => {
  const ip = "198.51.100.7";
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await submit(base({ phone: `90000100${i}0` }), { ip })).status);
  assert.ok(codes.includes(429), `expected a 429 in ${codes}`);
});

test("approval guard: only one concurrent approval wins; other hotel cannot approve", async () => {
  const [row] = await rows({ phone: "9876511111" });
  const claim = (propertyId: string) => m.prisma.registrationRequest.updateMany({
    where: { id: row.id, propertyId, status: "PENDING" },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });
  assert.equal((await claim(propB)).count, 0, "cross-hotel approval blocked");
  const counts = (await Promise.all([claim(propA), claim(propA), claim(propA)])).map((r) => r.count);
  assert.equal(counts.reduce((a, b) => a + b, 0), 1);
  assert.equal((await claim(propA)).count, 0, "repeat approval is a no-op");
});

test("retention expires stale pending requests, deletes their KYC, purges old closed rows", async () => {
  await submit(base({ phone: "9000000006" }), { file: png() });
  const [row] = await rows({ phone: "9000000006" });
  const key = row.kycKey!;
  await m.prisma.registrationRequest.update({ where: { id: row.id }, data: { createdAt: new Date(Date.now() - 31 * 864e5) } });
  const out = await m.retention();
  assert.ok(out.expired >= 1);
  const after = await m.prisma.registrationRequest.findUnique({ where: { id: row.id } });
  assert.equal(after?.status, "EXPIRED");
  assert.equal(after?.kycKey, null);
  assert.equal(existsSync(path.join(process.env.STORAGE_LOCAL_DIR!, key)), false);
  await m.prisma.registrationRequest.updateMany({ where: { id: row.id }, data: { updatedAt: new Date(Date.now() - 100 * 864e5) } });
  assert.ok((await m.retention()).purged >= 1);
});
