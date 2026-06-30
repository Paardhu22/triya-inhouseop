"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { rupeesToPaise } from "@/lib/money";
import { storage } from "@/lib/storage";
import { expenseServerSchema } from "@/lib/validations/expense";

type Ctx = { propertyId: string; userId: string; role: Role };
type CtxResult = { ok: true; ctx: Ctx } | { ok: false; error: string };

// Resolve the request context AND a *real* acting user row. The app uses JWT
// sessions, which outlive a `db:reset`/`db:seed` (that recreates users with fresh
// ids). A stale token id would make `Expense.createdById` violate its FK (P2003),
// so we look the user up by id and fall back to the session email to self-heal
// before any write — never by weakening the constraint.
async function requireContext(): Promise<CtxResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return { ok: false, error: "No active property selected" };

  const { id, email } = session.user;
  let user = id
    ? await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
    : null;
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  }
  if (!user) {
    return { ok: false, error: "Your session is out of date. Please sign out and sign in again." };
  }

  return { ok: true, ctx: { propertyId, userId: user.id, role: user.role } };
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const result = await requireContext();
  if (!result.ok) return actionError(result.error);
  const { ctx } = result;

  const parsed = expenseServerSchema.safeParse({
    categoryId: formData.get("categoryId"),
    subcategoryId: (formData.get("subcategoryId") as string | null) ?? "",
    amount: formData.get("amount"),
    date: formData.get("date"),
    vendor: (formData.get("vendor") as string | null) ?? "",
    notes: (formData.get("notes") as string | null) ?? "",
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  }
  const data = parsed.data;

  // The category must belong to the active property; a provided subcategory must
  // belong to that category; and a subcategory is required when the category has
  // any (it is optional only for categories with no subcategories).
  const category = await prisma.expenseCategory.findFirst({
    where: { id: data.categoryId, propertyId: ctx.propertyId },
    select: { id: true, subcategories: { select: { id: true } } },
  });
  if (!category) return actionError("Selected category no longer exists");

  const subIds = new Set(category.subcategories.map((s) => s.id));
  if (data.subcategoryId && !subIds.has(data.subcategoryId)) {
    return actionError("Selected subcategory does not belong to this category");
  }
  if (!data.subcategoryId && subIds.size > 0) {
    return actionError("Select a subcategory");
  }

  const receipt = formData.get("receipt");
  let saved: Awaited<ReturnType<typeof storage.save>> | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    try {
      saved = await storage.save(receipt, "receipts");
    } catch (e) {
      return actionError(e instanceof Error ? e.message : "Receipt upload failed");
    }
  }

  await prisma.expense.create({
    data: {
      propertyId: ctx.propertyId,
      categoryId: category.id,
      subcategoryId: data.subcategoryId,
      amount: rupeesToPaise(data.amount),
      date: data.date,
      vendor: data.vendor || null,
      notes: data.notes || null,
      receiptKey: saved?.key ?? null,
      createdById: ctx.userId,
    },
  });

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return actionOk();
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const result = await requireContext();
  if (!result.ok) return actionError(result.error);
  const { ctx } = result;

  const expense = await prisma.expense.findFirst({
    where: { id, propertyId: ctx.propertyId },
    select: { id: true, receiptKey: true },
  });
  if (!expense) return actionError("Expense not found");

  await prisma.expense.delete({ where: { id } });
  if (expense.receiptKey) await storage.remove(expense.receiptKey);

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return actionOk();
}
