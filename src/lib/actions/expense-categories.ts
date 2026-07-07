"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import {
  categoryCreateSchema,
  categoryDeleteSchema,
  categoryRenameSchema,
  subcategoryCreateSchema,
  subcategoryDeleteSchema,
  subcategoryRenameSchema,
} from "@/lib/validations/expense-category";

// Category management is configuration, so it is limited to PROPERTY_OWNER + MANAGER
// + APP_OWNER (browsing a property with full manager-level access) — logging an
// expense stays open to any authenticated staff.
async function requireManagerContext() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "PROPERTY_OWNER" && role !== "MANAGER" && role !== "APP_OWNER"))
    return null;
  const propertyId = await getSelectedPropertyId();
  return propertyId ? { propertyId } : null;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function createCategory(input: unknown): Promise<ActionResult> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Manager access required");
  const parsed = categoryCreateSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid name");

  try {
    await prisma.expenseCategory.create({
      data: { propertyId: ctx.propertyId, name: parsed.data.name },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return actionError("A category with this name already exists");
    return actionError("Could not create the category");
  }
  revalidatePath("/expenses");
  return actionOk();
}

export async function renameCategory(input: unknown): Promise<ActionResult> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Manager access required");
  const parsed = categoryRenameSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid name");

  try {
    const res = await prisma.expenseCategory.updateMany({
      where: { id: parsed.data.id, propertyId: ctx.propertyId },
      data: { name: parsed.data.name },
    });
    if (res.count === 0) return actionError("Category not found");
  } catch (e) {
    if (isUniqueViolation(e)) return actionError("A category with this name already exists");
    return actionError("Could not rename the category");
  }
  revalidatePath("/expenses");
  return actionOk();
}

export async function deleteCategory(input: unknown): Promise<ActionResult> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Manager access required");
  const parsed = categoryDeleteSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid category");

  // Guard the FK (onDelete: Restrict) with a friendly, specific message.
  const used = await prisma.expense.count({
    where: { categoryId: parsed.data.id, propertyId: ctx.propertyId },
  });
  if (used > 0) {
    return actionError(
      `This category has ${used} expense${used === 1 ? "" : "s"}. Reassign or delete them first.`,
    );
  }

  const res = await prisma.expenseCategory.deleteMany({
    where: { id: parsed.data.id, propertyId: ctx.propertyId },
  });
  if (res.count === 0) return actionError("Category not found");
  revalidatePath("/expenses");
  return actionOk();
}

export async function createSubcategory(input: unknown): Promise<ActionResult> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Manager access required");
  const parsed = subcategoryCreateSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid name");

  const category = await prisma.expenseCategory.findFirst({
    where: { id: parsed.data.categoryId, propertyId: ctx.propertyId },
    select: { id: true },
  });
  if (!category) return actionError("Category not found");

  try {
    await prisma.expenseSubcategory.create({
      data: { propertyId: ctx.propertyId, categoryId: category.id, name: parsed.data.name },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return actionError("A subcategory with this name already exists here");
    return actionError("Could not create the subcategory");
  }
  revalidatePath("/expenses");
  return actionOk();
}

export async function renameSubcategory(input: unknown): Promise<ActionResult> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Manager access required");
  const parsed = subcategoryRenameSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid name");

  try {
    const res = await prisma.expenseSubcategory.updateMany({
      where: { id: parsed.data.id, propertyId: ctx.propertyId },
      data: { name: parsed.data.name },
    });
    if (res.count === 0) return actionError("Subcategory not found");
  } catch (e) {
    if (isUniqueViolation(e)) return actionError("A subcategory with this name already exists here");
    return actionError("Could not rename the subcategory");
  }
  revalidatePath("/expenses");
  return actionOk();
}

export async function deleteSubcategory(input: unknown): Promise<ActionResult> {
  const ctx = await requireManagerContext();
  if (!ctx) return actionError("Manager access required");
  const parsed = subcategoryDeleteSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid subcategory");

  const used = await prisma.expense.count({
    where: { subcategoryId: parsed.data.id, propertyId: ctx.propertyId },
  });
  if (used > 0) {
    return actionError(
      `This subcategory has ${used} expense${used === 1 ? "" : "s"}. Reassign or delete them first.`,
    );
  }

  const res = await prisma.expenseSubcategory.deleteMany({
    where: { id: parsed.data.id, propertyId: ctx.propertyId },
  });
  if (res.count === 0) return actionError("Subcategory not found");
  revalidatePath("/expenses");
  return actionOk();
}
