/**
 * Exercises the REAL saveBed server action (approval path + manual path) against a
 * disposable Postgres, with only the session context and revalidatePath stubbed.
 * Same safety gate and setup as registration.test.ts. Needs Node 22+:
 *   node --experimental-test-module-mocks --conditions=react-server --import tsx --test scripts/registration-approval.test.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, mock, test } from "node:test";

const url = process.env.DATABASE_URL ?? "";
if (process.env.REGISTRATION_TEST_DB !== "1" || !/@(localhost|127\.0\.0\.1):\d+\//.test(url)) {
  throw new Error("Refusing to run: set REGISTRATION_TEST_DB=1 and a localhost DATABASE_URL");
}
process.env.AUTH_SECRET = "x".repeat(40);
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "reg-appr-"));
delete process.env.VERCEL;

let propA = "", propB = "", userId = "";
let currentProperty = () => propA;
let currentRole = "ADMIN";

mock.module("../src/lib/action-context", {
  namedExports: {
    getActionContext: async () => ({ ok: true, data: { propertyId: currentProperty(), userId, property: {} } }),
  },
});
mock.module("../src/auth", {
  namedExports: { auth: async () => ({ user: { id: userId, role: currentRole } }) },
});
mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } });

let prisma: typeof import("../src/lib/prisma").prisma;
let saveBed: typeof import("../src/lib/actions/floor").saveBed;
let beds: string[] = [];
let bedOther = "";

async function reg(phone: string, propertyId = propA, kycKey: string | null = null) {
  return (await prisma.registrationRequest.create({
    data: {
      propertyId, fullName: `Tenant ${phone}`, phone, email: "t@example.com", consentAt: new Date(), consentVersion: "t",
      kycKey, kycFilename: kycKey ? "id.png" : null, kycMimeType: kycKey ? "image/png" : null, kycSize: kycKey ? 70 : null,
    },
  })).id;
}
function form(bedId: string, phone: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  const base: Record<string, string> = {
    bedId, occupancyStatus: "OCCUPIED", fullName: "Asha Rao", phone, rentAmount: "9000", maintenanceCharge: "500",
    securityDeposit: "5000", checkInDate: "2026-12-01", paymentStatus: "PENDING", ...extra,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
}
const bedStatus = async (id: string) => (await prisma.bed.findUniqueOrThrow({ where: { id } })).status;
const tenancies = (bedId: string) => prisma.tenancy.findMany({ where: { bedId, status: "ACTIVE" } });

before(async () => {
  prisma = (await import("../src/lib/prisma")).prisma;
  saveBed = (await import("../src/lib/actions/floor")).saveBed;
  await prisma.property.deleteMany();
  await prisma.user.deleteMany({ where: { email: "approver@test.local" } });
  userId = (await prisma.user.create({ data: { name: "A", email: "approver@test.local", passwordHash: "x", role: "ADMIN" } })).id;
  const mk = async (slug: string) => {
    const p = await prisma.property.create({ data: { name: slug, slug } });
    const floor = await prisma.floor.create({ data: { propertyId: p.id, number: 1 } });
    const room = await prisma.room.create({ data: { propertyId: p.id, floorId: floor.id, number: "101", sharingType: 3 } });
    const b = await Promise.all(["A", "B", "C"].map((label) => prisma.bed.create({ data: { propertyId: p.id, roomId: room.id, label } })));
    return { id: p.id, beds: b.map((x) => x.id) };
  };
  const a = await mk("hotel-a"), b = await mk("hotel-b");
  propA = a.id; propB = b.id; beds = a.beds; bedOther = b.beds[0];
});
after(async () => { await prisma.$disconnect(); });

test("approval creates the tenant via saveBed, applies the reserve, moves KYC ownership, marks APPROVED", async () => {
  const id = await reg("9111111111", propA, "registrations/abc.png");
  const res = await saveBed(form(beds[0], "9111111111", { registrationId: id, expectedVacant: "true" }));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(await bedStatus(beds[0]), "OCCUPIED");
  const [tn] = await tenancies(beds[0]);
  assert.equal(tn.monthlyRent, 900000);
  assert.equal(tn.securityDeposit, 400000, "₹1000 maintenance reserve still held back");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tn.tenantId }, include: { documents: true } });
  assert.equal(tenant.photoUrl, "registrations/abc.png");
  assert.equal(tenant.documents.length, 1);
  assert.equal(tenant.documents[0].storageKey, "registrations/abc.png");
  const r = await prisma.registrationRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(r.status, "APPROVED");
  assert.equal(r.tenantId, tenant.id);
  assert.equal(r.kycKey, null);
});

test("approving the same request again is refused and creates nothing", async () => {
  const [{ id }] = await prisma.registrationRequest.findMany({ where: { phone: "9111111111" } });
  const res = await saveBed(form(beds[1], "9111111111", { registrationId: id, expectedVacant: "true" }));
  assert.equal(res.ok, false);
  assert.equal(await bedStatus(beds[1]), "AVAILABLE");
  assert.equal(await prisma.tenant.count({ where: { phone: "9111111111" } }), 1);
});

test("two requests racing for one bed: one wins, the loser stays PENDING with no stray tenant", async () => {
  const r1 = await reg("9222222221"), r2 = await reg("9222222222");
  const [a, b] = await Promise.all([
    saveBed(form(beds[1], "9222222221", { registrationId: r1 })),
    saveBed(form(beds[1], "9222222222", { registrationId: r2 })),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  assert.equal((await tenancies(beds[1])).length, 1);
  const statuses = (await prisma.registrationRequest.findMany({ where: { id: { in: [r1, r2] } } })).map((x) => x.status).sort();
  assert.deepEqual(statuses, ["APPROVED", "PENDING"]);
  assert.equal(await prisma.tenant.count({ where: { phone: { in: ["9222222221", "9222222222"] } } }), 1);
});

test("one request raced onto two beds is approved exactly once", async () => {
  const id = await reg("9333333333");
  const [a, b] = await Promise.all([
    saveBed(form(beds[2], "9333333333", { registrationId: id })),
    saveBed(form(bedOther, "9333333333", { registrationId: id })),
  ]);
  void a; void b;
  // bedOther belongs to hotel B, so it can only ever fail for hotel A's session.
  assert.equal(await prisma.tenant.count({ where: { phone: "9333333333" } }), 1);
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "APPROVED");
  assert.equal(await bedStatus(bedOther), "AVAILABLE");
});

test("occupied bed: save fails and the request stays PENDING", async () => {
  const id = await reg("9444444444");
  const res = await saveBed(form(beds[0], "9444444444", { registrationId: id }));
  assert.equal(res.ok, false);
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "PENDING");
  assert.equal(await prisma.tenant.count({ where: { phone: "9444444444" } }), 0);
});

test("another hotel's request cannot be approved from this property", async () => {
  const id = await reg("9555555555", propB);
  currentProperty = () => propA;
  const res = await saveBed(form(beds[2], "9555555555", { registrationId: id }));
  assert.equal(res.ok, false);
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "PENDING");
});

test("validation failure keeps the request PENDING", async () => {
  const id = await reg("9666666666");
  const free = await prisma.bed.create({ data: { propertyId: propA, roomId: (await prisma.room.findFirstOrThrow({ where: { propertyId: propA } })).id, label: "V" } });
  const res = await saveBed(form(free.id, "9666666666", { registrationId: id, rentAmount: "" }));
  assert.equal(res.ok, false);
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "PENDING");
});

test("manual creation without a registration is unchanged", async () => {
  const bed = await prisma.bed.create({ data: { propertyId: propA, roomId: (await prisma.room.findFirstOrThrow({ where: { propertyId: propA } })).id, label: "M" } });
  const res = await saveBed(form(bed.id, "9777777777"));
  assert.equal(res.ok, true);
  const [tn] = await tenancies(bed.id);
  assert.equal(tn.securityDeposit, 400000);
  assert.equal(await bedStatus(bed.id), "OCCUPIED");
  assert.equal(await prisma.registrationRequest.count({ where: { tenantId: tn.tenantId } }), 0);
});

test("STAFF cannot approve (web or mobile path); request stays PENDING, bed untouched", async () => {
  const id = await reg("9888888881");
  const bed = await prisma.bed.create({ data: { propertyId: propA, roomId: (await prisma.room.findFirstOrThrow({ where: { propertyId: propA } })).id, label: "S1" } });
  currentRole = "STAFF";
  try {
    const res = await saveBed(form(bed.id, "9888888881", { registrationId: id, expectedVacant: "true" }));
    assert.equal(res.ok, false);
    assert.match(res.ok ? "" : res.error, /admins and managers/);
    // Also refused when the occupancy flag tries to dodge the occupied branch.
    const sneaky = await saveBed(form(bed.id, "9888888881", { registrationId: id, occupancyStatus: "AVAILABLE" }));
    assert.equal(sneaky.ok, false);
  } finally { currentRole = "ADMIN"; }
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "PENDING");
  assert.equal(await bedStatus(bed.id), "AVAILABLE");
  assert.equal(await prisma.tenant.count({ where: { phone: "9888888881" } }), 0);
});

test("MANAGER can approve", async () => {
  const id = await reg("9888888882");
  const bed = await prisma.bed.create({ data: { propertyId: propA, roomId: (await prisma.room.findFirstOrThrow({ where: { propertyId: propA } })).id, label: "M1" } });
  currentRole = "MANAGER";
  try {
    const res = await saveBed(form(bed.id, "9888888882", { registrationId: id, expectedVacant: "true" }));
    assert.equal(res.ok, true, JSON.stringify(res));
  } finally { currentRole = "ADMIN"; }
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "APPROVED");
});

test("STAFF keeps manual tenant creation and editing (no registrationId)", async () => {
  const bed = await prisma.bed.create({ data: { propertyId: propA, roomId: (await prisma.room.findFirstOrThrow({ where: { propertyId: propA } })).id, label: "S2" } });
  currentRole = "STAFF";
  try {
    const created = await saveBed(form(bed.id, "9888888883"));
    assert.equal(created.ok, true, JSON.stringify(created));
    const edited = await saveBed(form(bed.id, "9888888883", { rentAmount: "9500" }));
    assert.equal(edited.ok, true);
  } finally { currentRole = "ADMIN"; }
  const [tn] = await tenancies(bed.id);
  assert.equal(tn.monthlyRent, 950000);
});

test("cross-property isolation holds for ADMIN/MANAGER too", async () => {
  const id = await reg("9888888884", propB);
  const bed = await prisma.bed.create({ data: { propertyId: propA, roomId: (await prisma.room.findFirstOrThrow({ where: { propertyId: propA } })).id, label: "X1" } });
  for (const role of ["ADMIN", "MANAGER"]) {
    currentRole = role;
    const res = await saveBed(form(bed.id, "9888888884", { registrationId: id }));
    assert.equal(res.ok, false, role);
  }
  currentRole = "ADMIN";
  assert.equal((await prisma.registrationRequest.findUniqueOrThrow({ where: { id } })).status, "PENDING");
  assert.equal(await bedStatus(bed.id), "AVAILABLE");
});
