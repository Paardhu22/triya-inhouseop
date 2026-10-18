import { format, parseISO } from "date-fns";
import { defaultDueDate } from "@/lib/invoice-compute";
import { z } from "zod";
import { mobileContext, getMobileSession } from "@/lib/mobile/session";
import { prisma } from "@/lib/prisma";
import * as collections from "@/lib/actions/collections";
import * as floor from "@/lib/actions/floor";
import * as tenants from "@/lib/actions/tenants";
import * as complaints from "@/lib/actions/complaints";
import * as expenses from "@/lib/actions/expenses";
import * as settings from "@/lib/actions/settings";
import { collectRentSchema } from "@/lib/validations/collections";
import * as categories from "@/lib/actions/expense-categories";
import { setRoomRent } from "@/lib/actions/rooms";

const id = z.string().min(1).max(200);
const paise = z.number().int().nonnegative().max(10_000_000_000);
const object = z.record(z.string(), z.unknown());
const form = (values: Record<string, unknown>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value != null) data.set(key, String(value));
  return data;
};
const rupees = (value: unknown) => paise.parse(value) / 100;

export async function POST(request: Request) {
  const ctx = await mobileContext();
  if (!ctx) return Response.json({ error: "Sign in and select an accessible property" }, { status: (await getMobileSession()) ? 403 : 401 });
  try {
    const upload = request.headers.get("content-type")?.includes("multipart/form-data") ? await request.formData() : null;
    const payload = upload ? JSON.parse(z.string().parse(upload.get("payload"))) : await request.json();
    const { action, args } = z.object({ action: z.string(), args: z.array(z.unknown()).max(4) }).parse(payload);
    let result;
    switch (action) {
      case "collectRent": {
        const input = object.parse(args[0]);
        result = await collections.collectRent(collectRentSchema.parse({ ...input, amount: rupees(input.amount),
          cashAmount: input.cashAmount == null ? undefined : rupees(input.cashAmount),
          onlineAmount: input.onlineAmount == null ? undefined : rupees(input.onlineAmount),
          notes: input.notes == null ? undefined : z.string().parse(input.notes) }));
        break;
      }
      case "deleteRentCollection": result = await collections.deleteRentCollection(id.parse(args[0])); break;
      case "sendRentReminder": {
        const tenancyId = id.parse(args[0]);
        result = await collections.sendRentReminder(tenancyId);
        if (result.ok) {
          const tenancy = await prisma.tenancy.findFirstOrThrow({ where: { id: tenancyId, propertyId: ctx.property.id }, include: { tenant: true } });
          result = { ok: true, data: { tenantName: tenancy.tenant.fullName } };
        }
        break;
      }
      case "remindAllTenants": {
        result = await collections.remindAllTenants();
        if (result.ok) result = { ok: true, data: { ...result.data, eligible: result.data.sent + result.data.failed + result.data.skipped } };
        break;
      }
      case "remindPendingTenants": result = await collections.remindPendingTenants(); break;
      case "sendInvoice": {
        const v = object.parse(args[0]);
        const tenancyId = id.parse(v.tenancyId);
        const billingMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(v.billingMonth ?? new Date().toISOString().slice(0, 7));
        const tenancy = await prisma.tenancy.findFirst({ where: { id: tenancyId, propertyId: ctx.property.id, status: "ACTIVE" }, select: { paymentDueDay: true } });
        if (!tenancy) return Response.json({ ok: false, error: "Active tenancy not found" });
        result = await collections.sendInvoice({ tenancyId, billingMonth,
          dueDate: format(defaultDueDate(tenancy.paymentDueDay, parseISO(`${billingMonth}-01`)), 'yyyy-MM-dd'),
          previousDue: String(rupees(v.previousDuePaise ?? 0)), extraCharges: String(rupees(v.extraChargesPaise ?? 0)),
          discount: String(rupees(v.discountPaise ?? 0)), extraChargesLabel: z.string().parse(v.extraChargesLabel ?? ""),
          notes: z.string().parse(v.notes ?? "") });
        if (result.ok) {
          const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: result.data.invoiceId, propertyId: ctx.property.id } });
          result = { ok: true, data: { number: invoice.number } };
        }
        break;
      }
      case "resendInvoice": result = await collections.resendInvoice(id.parse(args[0])); break;
      case "setRoomRent": {
        const v = object.parse(args[0]);
        result = await setRoomRent({ roomId: id.parse(v.roomId), rent: v.rent === null ? null : rupees(v.rent),
          maintenance: v.maintenance === null ? null : rupees(v.maintenance), applyToOccupants: z.boolean().parse(v.applyToOccupants) });
        break;
      }
      case "createComplaint": {
        const v = object.parse(args[0]);
        result = await complaints.createComplaint({ ...v, description: v.description ?? "", assignedToId: v.assignedToId ?? "" });
        break;
      }
      case "updateComplaint": result = await complaints.updateComplaint(id.parse(args[0]), args[1]); break;
      case "createExpense": {
        const v = object.parse(args[0]);
        const data = form({ ...v, amount: rupees(v.amount) });
        const receipt = upload?.get("attachment");
        if (receipt instanceof File) data.set("receipt", receipt);
        result = await expenses.createExpense(data);
        break;
      }
      case "deleteExpense": result = await expenses.deleteExpense(id.parse(args[0])); break;
      case "assignTenantToBed": {
        const v = object.parse(args[0]);
        const bedId = id.parse(v.bedId);
        const bed = await prisma.bed.findFirst({ where: { id: bedId, propertyId: ctx.property.id }, include: { tenancies: { where: { status: "ACTIVE" }, take: 1 } } });
        if (!bed || bed.tenancies.length) return Response.json({ ok: false, error: "This bed is unavailable. Refresh and try again." });
        const data = form({ ...v, bedId, occupancyStatus: "OCCUPIED", rentAmount: rupees(v.monthlyRent),
          maintenanceCharge: rupees(v.maintenanceCharge ?? 0),
          // Mobile's deposit field is already net of the maintenance reserve; the web action subtracts it.
          securityDeposit: v.securityDeposit == null ? undefined : rupees(v.securityDeposit) + 1000,
          cashAmount: v.cashAmount == null ? undefined : rupees(v.cashAmount),
          onlineAmount: v.onlineAmount == null ? undefined : rupees(v.onlineAmount) });
        const photo = upload?.get("attachment");
        if (photo instanceof File) data.set("photo", photo);
        result = await floor.saveBed(data);
        if (result.ok) {
          const tenancy = await prisma.tenancy.findFirstOrThrow({ where: { bedId, propertyId: ctx.property.id, status: "ACTIVE" } });
          result = { ok: true, data: { tenantId: tenancy.tenantId, invoice: result.data.invoice } };
        }
        break;
      }
      case "giveNotice": {
        const tenancyId = id.parse(args[0]);
        result = await floor.giveNotice(tenancyId);
        if (result.ok) {
          const tenancy = await prisma.tenancy.findFirstOrThrow({ where: { id: tenancyId, propertyId: ctx.property.id } });
          const until = new Date(tenancy.noticeGivenDate!); until.setDate(until.getDate() + 15);
          result = { ok: true, data: { vacateBy: until.toISOString() } };
        }
        break;
      }
      case "vacateBed": {
        const tenancy = await prisma.tenancy.findFirst({ where: { id: id.parse(args[0]), propertyId: ctx.property.id, status: "ACTIVE" } });
        if (!tenancy) return Response.json({ ok: false, error: "Active tenancy not found" });
        result = await floor.saveBed(form({ bedId: tenancy.bedId, occupancyStatus: "AVAILABLE" }));
        if (result.ok) {
          const ended = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancy.id } });
          result = { ok: true, data: { depositStatus: ended.depositStatus } };
        }
        break;
      }
      case "deleteTenant": result = await tenants.deleteTenant(id.parse(args[0])); break;
      case "sendRules": {
        const tenantId = id.parse(args[0]);
        result = await tenants.sendPgRules(tenantId);
        if (result.ok) {
          const tenant = await prisma.tenant.findFirstOrThrow({ where: { id: tenantId, propertyId: ctx.property.id } });
          result = { ok: true, data: { tenantName: tenant.fullName } };
        }
        break;
      }
      case "updatePropertySettings": {
        const v = object.parse(args[1]);
        result = await settings.updatePropertySettings({ ...v, address: v.address ?? "", city: v.city ?? "", phone: v.phone ?? "", rulesText: v.rulesText ?? "" }); break;
      }
      case "createCategory": result = await categories.createCategory(args[0]); break;
      case "renameCategory": result = await categories.renameCategory(args[0]); break;
      case "deleteCategory": result = await categories.deleteCategory(args[0]); break;
      case "createSubcategory": result = await categories.createSubcategory(args[0]); break;
      case "renameSubcategory": result = await categories.renameSubcategory(args[0]); break;
      case "deleteSubcategory": result = await categories.deleteSubcategory(args[0]); break;
      case "changePassword": result = await settings.changePassword({ currentPassword: args[1], newPassword: args[2], confirmPassword: args[2] }); break;
      default: return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ ok: false, error: "Invalid request details" }, { status: 400 });
    }
    console.error("Mobile action failed", error);
    return Response.json({ ok: false, error: "Could not complete the action. Refresh before trying again." }, { status: 500 });
  }
}
