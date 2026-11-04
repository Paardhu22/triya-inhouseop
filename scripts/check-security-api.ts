/** Run only against a dedicated, migrated LOCAL database and LOCAL production server. */
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL ?? "";
const db = new URL(databaseUrl);
const base = process.env.TRIYA_SECURITY_TEST_URL ?? "http://127.0.0.1:3109";
if (!["127.0.0.1", "localhost"].includes(db.hostname) || !/^\/triya_security_\d{8}$/.test(db.pathname)) throw new Error("Use a disposable local triya_security_YYYYMMDD database.");
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Security checks require a local server.");
if (process.env.STORAGE_LOCAL_DIR !== "/tmp/triya-security-uploads") throw new Error("Use isolated /tmp/triya-security-uploads storage.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
const password = "SecurityTest@123";
const cookieValues = (response: Response) => response.headers.getSetCookie().map(cookie => cookie.split(";")[0]);

async function webLogin(email: string) {
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieValues(csrf).join("; "), "Origin": base, "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${base}/dashboard` }),
  });
  const session = cookieValues(response).find(cookie => cookie.startsWith("authjs.session-token="));
  check(response.status === 200 && session, "Web credentials/CSRF flow issues a real session cookie");
  return session!;
}
async function mobileLogin(email: string) {
  const response = await fetch(`${base}/api/mobile/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const result = await response.json();
  check(response.status === 200 && result.token, "Mobile credentials flow issues a revocable session");
  return result.token as string;
}

async function main() {
  await prisma.rateLimitBucket.deleteMany();
  const suffix = randomUUID();
  const [a, b] = await Promise.all(["A", "B"].map(name => prisma.property.create({ data: { name: `Security ${name}`, slug: `security-${name.toLowerCase()}-${suffix}` } })));
  const passwordHash = await bcrypt.hash(password, 4);
  const admin = await prisma.user.create({ data: { name: "Security Admin", email: `admin-${suffix}@security.test`, role: "ADMIN", passwordHash } });
  const manager = await prisma.user.create({ data: { name: "Security Manager", email: `Manager-${suffix}@security.test`, role: "MANAGER", propertyId: a.id, passwordHash } });
  const [ownTenant, foreignTenant] = await Promise.all([a, b].map(property => prisma.tenant.create({ data: { propertyId: property.id, fullName: `Security Tenant ${property.name}`, phone: "9876543210" } })));
  await mkdir("/tmp/triya-security-uploads/kyc", { recursive: true });
  const keys = [a, b].map(() => `kyc/${randomUUID()}.pdf`);
  for (const key of keys) await writeFile(`/tmp/triya-security-uploads/${key}`, "%PDF-1.4\n%%EOF");
  await Promise.all([ownTenant, foreignTenant].map((tenant, i) => prisma.document.create({ data: { tenantId: tenant.id, type: "OTHER", storageKey: keys[i], filename: "security.pdf", mimeType: "application/pdf", size: 14 } })));

  const adminCookie = await webLogin(admin.email);
  const managerCookie = await webLogin(manager.email);
  const mobileToken = await mobileLogin(admin.email);
  await mobileLogin(manager.email);
  const web = (path: string, cookie: string, propertyId = a.id) => fetch(`${base}${path}`, { headers: { Cookie: `${cookie}; triya.property=${propertyId}` }, redirect: "manual" });
  const ownSearch = await web("/api/search?q=Security", managerCookie);
  const ownResults = await ownSearch.json();
  check(ownSearch.status === 200 && ownResults.results.some((result: { title: string }) => result.title === ownTenant.fullName), "Manager can search their own property");
  const foreignSearch = await web("/api/search?q=Security", managerCookie, b.id);
  check((await foreignSearch.json()).results.length === 0, "Forged property cookie cannot read another property's search results");
  check((await web("/api/expenses/export", managerCookie, b.id)).status === 400, "Forged property cookie cannot export another property");
  const ownFile = await web(`/api/files/${keys[0]}`, managerCookie);
  check(ownFile.status === 200, "Manager can read their property's private document");
  check(ownFile.headers.get("cache-control") === "private, no-store" && ownFile.headers.get("x-content-type-options") === "nosniff", "Private files cannot persist in shared/browser caches or MIME-sniff");
  check((await web(`/api/files/${keys[1]}`, managerCookie)).status === 401, "Browser session cannot read another property's KYC file");
  check((await web(`/api/files/${keys[1]}`, managerCookie, b.id)).status === 401, "Forging property cookie cannot grant private-file access");
  const exp = Math.floor(Date.now() / 1000) + 60;
  const sig = createHmac("sha256", process.env.AUTH_SECRET!).update(`${keys[0]}.${exp}`).digest("hex");
  check((await fetch(`${base}/api/files/${keys[0]}?exp=${exp}&sig=${sig}`)).status === 200, "Valid file-specific signed URL works without a session");
  check((await fetch(`${base}/api/files/${keys[1]}?exp=${exp}&sig=${sig}`)).status === 401, "Signed file URL cannot be replayed for another key");

  await prisma.user.update({ where: { id: admin.id }, data: { role: "MANAGER", propertyId: a.id } });
  check((await (await web("/api/auth/session", adminCookie)).json()).user.role === "MANAGER", "Browser session endpoint reports the current role, not the JWT's old role");
  check((await (await web("/api/search?q=Security", adminCookie, b.id)).json()).results.length === 0, "Demoted admin's existing web JWT immediately loses cross-property access");
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN", propertyId: null } });
  await prisma.user.update({ where: { id: manager.id }, data: { isActive: false } });
  check((await (await web("/api/auth/session", managerCookie)).json()) === null, "Browser session endpoint rejects a deactivated account");
  check((await web("/api/search?q=Security", managerCookie)).status === 401, "Deactivated account's existing web session is rejected");
  await prisma.user.update({ where: { id: manager.id }, data: { isActive: true } });
  await prisma.property.update({ where: { id: a.id }, data: { isActive: false } });
  check((await web("/api/search?q=Security", managerCookie)).status === 401, "Deactivating a property revokes its manager's existing web access");
  await prisma.property.update({ where: { id: a.id }, data: { isActive: true } });

  const loginPage = await fetch(`${base}/login?callbackUrl=javascript:alert(1)`);
  check(loginPage.headers.get("x-frame-options") === "DENY" && Boolean(loginPage.headers.get("content-security-policy")), "Security headers are present on the production login page");
  check(!loginPage.headers.has("x-powered-by"), "Framework identification header is disabled");
  const malformed = await fetch(`${base}/api/mobile/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  check(malformed.status === 400, "Malformed JSON is a controlled 400");
  const oversized = await fetch(`${base}/api/mobile/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "x".repeat(5000) }) });
  check(oversized.status === 413, "Oversized login body is rejected before authentication");
  check((await fetch(`${base}/api/cron/reset-payments`)).status === 401, "Maintenance cannot run without its secret");

  const raceFloor = await prisma.floor.create({ data: { propertyId: a.id, number: 1 } });
  const raceRoom = await prisma.room.create({ data: { propertyId: a.id, floorId: raceFloor.id, number: `race-${suffix}`, sharingType: 1 } });
  const raceBed = await prisma.bed.create({ data: { propertyId: a.id, roomId: raceRoom.id, label: "A" } });
  const assignments = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(`${base}/api/mobile/actions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${mobileToken}`, "X-Triya-Property": a.id },
    body: JSON.stringify({ action: "assignTenantToBed", args: [{ bedId: raceBed.id, fullName: `Concurrent tenant ${i}`, phone: "9876543210", monthlyRent: 100000, maintenanceCharge: 0, checkInDate: new Date().toISOString(), paymentStatus: "PENDING" }] }),
  }).then(response => response.json())));
  check(assignments.filter(result => result.ok).length === 1, "Only one of eight racing check-ins can claim an available bed");
  const raceTenancy = await prisma.tenancy.findFirstOrThrow({ where: { bedId: raceBed.id, status: "ACTIVE" } });
  check((await prisma.tenancy.count({ where: { bedId: raceBed.id, status: "ACTIVE" } })) === 1, "Racing check-ins cannot create duplicate active tenancies");
  const { settleMonth } = await import("../src/lib/ledger");
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  await Promise.all(Array.from({ length: 10 }, () => prisma.$executeRaw`SELECT pg_sleep(0.02)`));
  const settlements = await Promise.all(Array.from({ length: 10 }, () => prisma.$transaction(tx => settleMonth(tx, {
    propertyId: a.id, tenancy: raceTenancy, forMonth: month, method: "CASH", recordedById: admin.id, at: new Date(),
  }))));
  check(settlements.filter(Boolean).length === 1, "Only one of ten racing automatic rent settlements records a payment");
  const settled = await prisma.payment.aggregate({ where: { tenancyId: raceTenancy.id }, _sum: { amount: true }, _count: true });
  check(settled._count === 1 && settled._sum.amount === 100000, "Concurrent settlement preserves the exact rent balance");

  const timings = await Promise.all(Array.from({ length: 20 }, async () => {
    const start = performance.now();
    const response = await web("/api/search?q=Security", adminCookie);
    await response.arrayBuffer();
    check(response.status === 200, "Authenticated search remains available under bounded concurrent load");
    return performance.now() - start;
  }));
  timings.sort((x, y) => x - y);

  const changed = await fetch(`${base}/api/mobile/actions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${mobileToken}`, "X-Triya-Property": a.id },
    body: JSON.stringify({ action: "changePassword", args: [admin.id, password, "SecurityChanged@123"] }),
  });
  check((await changed.json()).ok, "Password change succeeds through the real API");
  check((await prisma.session.count({ where: { userId: admin.id } })) === 0, "Password change deletes every mobile session for the account");
  check((await web("/api/search?q=Security", adminCookie)).status === 401, "Password change invalidates the existing browser JWT");
  check((await (await web("/api/auth/session", adminCookie)).json()) === null, "Browser session endpoint also rejects a password-revoked JWT");
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  check(createHash("sha256").update(stored.passwordHash).digest("hex") !== createHash("sha256").update(passwordHash).digest("hex"), "Credential fingerprint changes with the password");

  const { consumeRateLimit } = await import("../src/lib/security/rate-limit");
  const rate = await Promise.all(Array.from({ length: 40 }, () => consumeRateLimit("security-race", suffix, 10, 60_000)));
  check(rate.filter(result => result.allowed).length === 10, "Distributed limiter admits exactly 10 of 40 racing requests");
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const response = await fetch(`${base}/api/mobile/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${i}` }, body: JSON.stringify({ email: `no-${i}@security.test`, password: "wrong" }) });
    if (response.status === 429) { limited = response.headers.has("retry-after"); break; }
  }
  check(limited, "Login floods return 429/Retry-After despite spoofed forwarded headers");
  console.log(JSON.stringify({ checks, concurrentAuthenticatedSearch: { requests: 20, p50Ms: Math.round(timings[9]), p95Ms: Math.round(timings[18]), maxMs: Math.round(timings[19]) }, scope: "isolated local production server; not a capacity or real DDoS test" }, null, 2));
  await (await import("../src/lib/prisma")).prisma.$disconnect();
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
