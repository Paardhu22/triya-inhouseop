import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { TrafficLimiter } from "../src/lib/security/traffic";
import { clientAddress } from "../src/lib/security/client-address";
import { readBoundedBody, readJsonBody, readFormBody, RequestError } from "../src/lib/security/request";
import { validFileSignature } from "../src/lib/security/file-signature";
import { validateWorkbookArchive } from "../src/lib/security/zip";
import { parseImportFile, parseImportText } from "../src/lib/import/parse-file";
import { createPropertySchema } from "../src/lib/validations/properties";
import { safeCallbackPath } from "../src/lib/security/redirect";

function streamedBody(chunks: Uint8Array[]) {
  return new Request("http://localhost/test", {
    method: "POST", duplex: "half",
    body: new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } }),
  } as RequestInit);
}

test("traffic limits stop excess requests, reset, and do not grow with rotating keys", () => {
  const limiter = new TrafficLimiter(2);
  assert.equal(limiter.check("a", 2, 1000, 100_000).allowed, true);
  assert.equal(limiter.check("a", 2, 1000, 100_001).allowed, true);
  assert.equal(limiter.check("a", 2, 1000, 100_002).allowed, false);
  assert.equal(limiter.check("b", 2, 1000, 100_002).allowed, true);
  assert.equal(limiter.check("rotating-new-key", 2, 1000, 100_003).allowed, false);
  assert.equal(limiter.check("a", 2, 1000, 101_001).allowed, true);
  assert.equal(limiter.check("fresh", 2, 1000, 131_001).allowed, true);
});

test("client-supplied forwarded headers are ignored outside Vercel", () => {
  const previous = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9" })), "local");
    process.env.VERCEL = "1";
    assert.equal(clientAddress(new Headers({ "x-vercel-forwarded-for": "203.0.113.8", "x-forwarded-for": "203.0.113.9" })), "203.0.113.8");
    assert.equal(clientAddress(new Headers({ "x-vercel-forwarded-for": "garbage" })), "unknown");
  } finally {
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
  }
});

test("body limits count actual streamed bytes without trusting Content-Length", async () => {
  assert.equal((await readBoundedBody(streamedBody([new Uint8Array(3), new Uint8Array(2)]), 5)).length, 5);
  await assert.rejects(readBoundedBody(streamedBody([new Uint8Array(3), new Uint8Array(3)]), 5), (error: unknown) => error instanceof RequestError && error.status === 413);
  const request = new Request("http://localhost", { method: "POST", body: "x", headers: { "Content-Length": "1000000" } });
  await assert.rejects(readBoundedBody(request, 10), (error: unknown) => error instanceof RequestError && error.status === 413);
});

test("invalid JSON, UTF-8, and content types are controlled client errors", async () => {
  for (const body of ["{", new Uint8Array([0xff])]) {
    await assert.rejects(readJsonBody(new Request("http://localhost", { method: "POST", body, headers: { "Content-Type": "application/json" } })), (error: unknown) => error instanceof RequestError && error.status === 400);
  }
  await assert.rejects(readJsonBody(new Request("http://localhost", { method: "POST", body: "{}" })), (error: unknown) => error instanceof RequestError && error.status === 415);
});

test("bounded multipart parsing preserves uploaded files and rejects oversized bodies", async () => {
  const data = new FormData(); data.set("tenantId", "fixture"); data.set("file", new File(["%PDF-1.4"], "fixture.pdf", { type: "application/pdf" }));
  const parsed = await readFormBody(new Request("http://localhost", { method: "POST", body: data }), 4096);
  assert.equal(parsed.get("tenantId"), "fixture");
  assert.equal((parsed.get("file") as File).size, 8);
  const encoded = new Request("http://localhost", { method: "POST", body: data });
  const bytes = await encoded.arrayBuffer();
  await assert.rejects(readFormBody(new Request("http://localhost", { method: "POST", body: bytes, headers: encoded.headers }), 10), (error: unknown) => error instanceof RequestError && error.status === 413);
});

test("upload signatures reject HTML disguised as permitted MIME types", () => {
  const html = Buffer.from("<html><script>alert(1)</script></html>");
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"]) assert.equal(validFileSignature(html, mime), false);
  assert.equal(validFileSignature(Buffer.from("%PDF-1.4\n%%EOF"), "application/pdf"), true);
  assert.equal(validFileSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), "image/png"), true);
});

test("valid Excel and CSV imports still parse, including UUID-based conditional formats", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tenants"); sheet.addRows([["Name", "Phone"], ["Test Tenant", "9876543210"]]);
  sheet.addConditionalFormatting({ ref: "A2:A2", rules: [{ type: "dataBar", priority: 1, minLength: 0, maxLength: 100, cfvo: [{ type: "min" }, { type: "max" }] }] });
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  validateWorkbookArchive(bytes);
  const parsed = await parseImportFile(new File([bytes], "fixture.xlsx"));
  assert.equal(parsed[0].rows[0][0], "Test Tenant");
  assert.equal(parseImportText("Name,Phone\nTest Tenant,9876543210")[0].rows[0][0], "Test Tenant");
  assert.equal(parseImportText("Name\nTest Tenant")[0].rows[0][0], "Test Tenant");
  assert.throws(() => parseImportText(Array.from({ length: 201 }, () => "column").join(",")), /too large/);
});

test("ZIP limits reject corrupt archives, declared bombs, and lying uncompressed sizes", async () => {
  assert.throws(() => validateWorkbookArchive(Buffer.from("not a zip")));
  const compressed = deflateRawSync(Buffer.alloc(9 * 1024 * 1024));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46, 12); end.writeUInt32LE(local.length + compressed.length, 16);
  central.writeUInt32LE(9 * 1024 * 1024, 24);
  assert.throws(() => validateWorkbookArchive(Buffer.concat([local, compressed, central, end])), /safe import limit/);
  central.writeUInt32LE(1, 24);
  assert.throws(() => validateWorkbookArchive(Buffer.concat([local, compressed, central, end])));
});

test("property creation cannot multiply a small request into hundreds of thousands of rows", () => {
  const result = createPropertySchema.safeParse({ name: "Test", city: "", address: "", phone: "", isFlat: false, hasBlocks: false,
    account: { email: "fixture@example.test", password: "TestPassword123" },
    sections: [{ name: "", roomsPerFloor: Array(40).fill(12), floors: Array.from({ length: 40 }, (_, i) => i) }],
  });
  assert.equal(result.success, false);
});

test("post-login redirects reject script URLs, external hosts, backslashes, and login loops", () => {
  for (const candidate of ["javascript:alert(1)", "https://evil.example", "//evil.example", "/\\evil.example", "/login", "/\n/evil.example"]) {
    assert.equal(safeCallbackPath(candidate), "/dashboard");
  }
  assert.equal(safeCallbackPath("/floor-manager?floor=1"), "/floor-manager?floor=1");
});
