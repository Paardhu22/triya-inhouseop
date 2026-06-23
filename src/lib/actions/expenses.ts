"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { rupeesToPaise } from "@/lib/money";
import { storage } from "@/lib/storage";
import { expenseServerSchema } from "@/lib/validations/expense";

async function requireContext() {
  const session = await auth();
  if (!session?.user) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId, userId: session.user.id };
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const parsed = expenseServerSchema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    vendor: (formData.get("vendor") as string | null) ?? "",
    notes: (formData.get("notes") as string | null) ?? "",
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  }
  const data = parsed.data;

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
      category: data.category,
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
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

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
