/** Integration checks. Requires an isolated, migrated local database named mobile_api_test. */
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL ?? '';
const dbUrl = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || dbUrl.pathname !== '/mobile_api_test') {
  throw new Error('These checks run only against an isolated local mobile_api_test database.');
}
const api = process.env.TRIYA_MOBILE_TEST_URL ?? 'http://127.0.0.1:3109';
if (!['127.0.0.1', 'localhost'].includes(new URL(api).hostname)) throw new Error('Use a local test server.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const password = 'MobileTest@123';
let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
async function request(path: string, options: RequestInit = {}, token?: string, propertyId?: string) {
  const response = await fetch(`${api}/api/mobile/${path}`, { ...options, headers: {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(propertyId ? { 'X-Triya-Property': propertyId } : {}), ...options.headers,
  } });
  const data = await response.json();
  return { status: response.status, data };
}
async function login(email: string) {
  const result = await request('login', { method: 'POST', body: JSON.stringify({ email, password }) });
  check(result.status === 200 && result.data.token, 'Real account can sign in');
  return result.data.token as string;
}
async function action(token: string, property: string, name: string, ...args: unknown[]) {
  return request('actions', { method: 'POST', body: JSON.stringify({ action: name, args }) }, token, property);
}

async function main() {
  // Clear only the guarded disposable database so this script can be repeated.
  await prisma.session.deleteMany(); await prisma.user.deleteMany(); await prisma.property.deleteMany();
  const [a, b] = await Promise.all(['A', 'B'].map(name => prisma.property.create({ data: { name: `Test ${name}`, slug: `mobile-test-${name.toLowerCase()}` } })));
  const hash = await bcrypt.hash(password, 4);
  const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@mobile.test', passwordHash: hash, role: 'ADMIN' } });
  const manager = await prisma.user.create({ data: { name: 'Manager', email: 'manager@mobile.test', passwordHash: hash, role: 'MANAGER', propertyId: a.id } });
  await prisma.user.create({ data: { name: 'Staff', email: 'staff@mobile.test', passwordHash: hash, role: 'STAFF', propertyId: a.id } });
  const floor = await prisma.floor.create({ data: { propertyId: a.id, number: 1 } });
  const room = await prisma.room.create({ data: { propertyId: a.id, floorId: floor.id, number: '101', sharingType: 2 } });
  const bed = await prisma.bed.create({ data: { propertyId: a.id, roomId: room.id, label: 'A' } });
  const otherTenant = await prisma.tenant.create({ data: { propertyId: b.id, fullName: 'Other property tenant', phone: '9876543219' } });
  const accounts = await request('login');
  check(accounts.status === 200 && accounts.data.users.length === 3, 'Login picker uses real active accounts');
  check(accounts.data.users.every((u: Record<string, unknown>) => Object.keys(u).sort().join(',') === 'email,name,role'), 'Login picker exposes only public account labels');
  check((await request('snapshot')).status === 401, 'Anonymous snapshot denied');
  check((await request('login', { method: 'POST', body: JSON.stringify({ email: admin.email, password: 'wrong' }) })).status === 401, 'Wrong password denied');
  const adminToken = await login(admin.email), managerToken = await login(manager.email), staffToken = await login('staff@mobile.test');
  check((await request('session', {}, adminToken)).data.properties.length === 2, 'Admin sees all active properties');
  const managerSession = await request('session', {}, managerToken);
  check(managerSession.data.properties.length === 1 && managerSession.data.properties[0].id === a.id, 'Manager sees only own property');
  check(managerSession.data.storage.maxFileBytes === 2 * 1024 * 1024 && managerSession.data.storage.allowedMimeTypes.includes('application/pdf'), 'Session exposes configured upload limits and MIME types');
  const snapshot = await request('snapshot', {}, managerToken, a.id);
  check(snapshot.status === 200 && snapshot.data.beds.length === 1, 'Snapshot loads actual database rows');
  check(!JSON.stringify(snapshot.data).includes('passwordHash'), 'Snapshot never exposes password hashes');
  check((await request('snapshot', {}, managerToken, b.id)).status >= 400, 'Cross-property snapshot denied');
  check((await action(managerToken, b.id, 'createCategory', { name: 'Intrusion' })).status >= 400, 'Cross-property mutation denied');
  check(!(await action(staffToken, a.id, 'createCategory', { name: 'Intrusion' })).data.ok, 'Staff cannot manage categories');
  check((await action(managerToken, a.id, 'createCategory', { name: 'Repairs' })).data.ok, 'Manager creates real category');
  const category = await prisma.expenseCategory.findFirstOrThrow({ where: { propertyId: a.id } });
  check((await action(managerToken, a.id, 'createExpense', { propertyId: b.id, categoryId: category.id, amount: 12345, date: new Date().toISOString(), vendor: 'Vendor', notes: '' })).data.ok, 'Expense writes through existing business action');
  const expense = await prisma.expense.findFirstOrThrow();
  check(expense.propertyId === a.id && expense.amount === 12345 && expense.createdById === manager.id, 'Server controls property, actor, and paise conversion');
  check(!(await action(managerToken, a.id, 'deleteCategory', { id: category.id })).data.ok, 'Used category deletion blocked');
  check((await action(managerToken, a.id, 'setRoomRent', { roomId: room.id, rent: 850000, maintenance: 150000, applyToOccupants: false })).data.ok, 'Room defaults updated');
  check((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).defaultRent === 850000, 'Room defaults retain paise');
  const multipartExpense = new FormData();
  multipartExpense.set('payload', JSON.stringify({ action: 'createExpense', args: [{ categoryId: category.id, amount: 999, date: new Date().toISOString(), notes: 'Receipt test' }] }));
  multipartExpense.set('attachment', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'receipt.pdf');
  check((await request('actions', { method: 'POST', body: multipartExpense }, managerToken, a.id)).data.ok, 'Multipart expense with receipt is created');
  const withReceipt = await prisma.expense.findFirstOrThrow({ where: { notes: 'Receipt test' } });
  check(withReceipt.amount === 999 && !!withReceipt.receiptKey, 'Receipt and paise are persisted together');
  check((await action(managerToken, a.id, 'deleteExpense', withReceipt.id)).data.ok, 'Expense receipt can be deleted through existing action');
  check((await action(adminToken, a.id, 'updatePropertySettings', a.id, { name: 'Updated test property', address: null, city: null, phone: null, rulesText: null })).data.ok, 'Property settings normalize optional mobile fields');
  const month = new Date().toISOString().slice(0, 7);
  const checkIn = new FormData();
  checkIn.set('payload', JSON.stringify({ action: 'assignTenantToBed', args: [{ bedId: bed.id, fullName: 'Real Tenant', phone: '9876543210', monthlyRent: 850000, maintenanceCharge: 150000, securityDeposit: 500000, checkInDate: `${month}-01T12:00:00.000Z`, paymentStatus: 'PENDING' }] }));
  checkIn.set('attachment', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'kyc.png');
  const assigned = await request('actions', { method: 'POST', body: checkIn }, managerToken, a.id);
  check(assigned.data.ok && assigned.data.data.tenantId, 'Check-in returns the persisted tenant');
  const tenancy = await prisma.tenancy.findFirstOrThrow({ where: { bedId: bed.id, status: 'ACTIVE' } });
  check(!!(await prisma.tenant.findUniqueOrThrow({ where: { id: tenancy.tenantId } })).photoUrl, 'Check-in KYC photo saved');
  check(tenancy.securityDeposit === 500000, 'Net deposit is not reduced twice');
  check(!(await action(managerToken, a.id, 'assignTenantToBed', { bedId: bed.id })).data.ok, 'Occupied bed check-in rejected');
  const receipt = await action(managerToken, a.id, 'collectRent', { tenancyId: tenancy.id, forMonth: month, amount: 100001, method: 'SPLIT', cashAmount: 50000, onlineAmount: 50001, collectedAt: new Date().toISOString(), sendInvoice: false });
  check(receipt.data.ok && receipt.data.data.balancePaise === 899999, 'Part payment returns exact remaining paise');
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: receipt.data.data.paymentId } });
  check(payment.amount === 100001 && payment.cashAmount === 50000 && payment.onlineAmount === 50001, 'Split receipt preserves money exactly');
  check(!(await action(staffToken, a.id, 'deleteRentCollection', payment.id, 'ADMIN')).data.ok, 'Client-supplied admin role cannot bypass permissions');
  check(!(await action(managerToken, a.id, 'collectRent', { tenancyId: tenancy.id, forMonth: month, amount: 100001, method: 'SPLIT', cashAmount: 1, onlineAmount: 1, collectedAt: new Date().toISOString(), sendInvoice: false })).data.ok, 'Invalid split rejected before writing');
  check((await prisma.payment.count()) === 1, 'Invalid request creates no payment');
  const foreignDoc = new FormData(); foreignDoc.set('tenantId', otherTenant.id); foreignDoc.set('type', 'OTHER'); foreignDoc.set('file', new Blob(['test'], { type: 'application/pdf' }), 'test.pdf');
  check((await request('documents', { method: 'POST', body: foreignDoc }, managerToken, a.id)).status === 404, 'Cross-property upload denied');
  const document = new FormData(); document.set('tenantId', tenancy.tenantId); document.set('type', 'OTHER'); document.set('file', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'test.pdf');
  const uploaded = await request('documents', { method: 'POST', body: document }, managerToken, a.id);
  check(uploaded.data.ok, 'Document uploads into real storage');
  const key = uploaded.data.data.storageKey;
  const oversized = new FormData(); oversized.set('tenantId', tenancy.tenantId); oversized.set('type', 'OTHER'); oversized.set('file', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  check(!(await request('documents', { method: 'POST', body: oversized }, managerToken, a.id)).data.ok, 'Server enforces the same configured upload size');
  await prisma.property.update({ where: { id: a.id }, data: { logoKey: key } });
  const logo = await request(`file?key=${encodeURIComponent(key)}&logoPropertyId=${a.id}`, {}, managerToken);
  check(logo.status === 200 && (await fetch(`${api}${logo.data.path}`)).status === 200, 'Own property logo opens before selecting an active property');
  check((await request(`file?key=${encodeURIComponent(key)}&logoPropertyId=${a.id}`, {}, adminToken)).status === 200, 'Admin property picker can open property logos');
  await prisma.property.update({ where: { id: b.id }, data: { logoKey: 'private/foreign.png' } });
  check((await request(`file?key=private%2Fforeign.png&logoPropertyId=${b.id}`, {}, managerToken)).status === 404, 'Manager cannot open another property logo');
  const photo = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenancy.tenantId } })).photoUrl!;
  check((await request(`file?key=${encodeURIComponent(photo)}&logoPropertyId=${a.id}`, {}, managerToken)).status === 404, 'Logo route cannot expose a tenant photo before selection');
  check((await request(`file?key=${encodeURIComponent(key)}`, {}, adminToken, b.id)).status === 404, 'Foreign property cannot issue a file URL');
  const signed = await request(`file?key=${encodeURIComponent(key)}`, {}, managerToken, a.id);
  check((await fetch(`${api}/api/files/${key}`, { headers: { Authorization: `Bearer ${adminToken}`, 'X-Triya-Property': b.id } })).status === 401, 'Bearer tokens cannot bypass file property ownership');
  check(signed.status === 200 && (await fetch(`${api}${signed.data.path}`)).status === 200, 'Signed URL opens a stored document without exposing a session token');
  check((await action(managerToken, a.id, 'giveNotice', tenancy.id)).data.ok, 'Notice saved');
  check((await action(managerToken, a.id, 'vacateBed', tenancy.id)).data.data.depositStatus === 'FORFEITED', 'Vacating uses real 15-day deposit rule');
  check((await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } })).status === 'AVAILABLE', 'Vacating frees bed');
  check((await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancy.id } })).status === 'ENDED', 'Vacating preserves tenancy history');
  await prisma.user.update({ where: { id: manager.id }, data: { isActive: false } });
  check((await request('session', {}, managerToken)).status === 401, 'Deactivated accounts lose mobile sessions immediately');
  check((await request('session', { method: 'DELETE' }, adminToken)).data.ok, 'Sign-out revokes the session');
  check((await request('session', {}, adminToken)).status === 401, 'Revoked token cannot be replayed');
  console.log(`Mobile API integration: ${checks} checks passed.`);
}
main().finally(() => prisma.$disconnect());
