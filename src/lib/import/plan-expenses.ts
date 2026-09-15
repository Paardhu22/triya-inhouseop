import "server-only";

// The expenses importer. Categories and subcategories are property-scoped rows rather
// than a fixed enum, so a legacy sheet almost always names heads the property has not
// defined yet — hence the "create missing categories" option, on by default.
import { format } from "date-fns";

import type { Prisma } from "@/generated/prisma/client";

import { cleanCell } from "./coerce";
import type { ImportDb } from "./structure-map";
import type { ImportContext, ImportOptions, ResolvedRow } from "./types";
import { readDate, readNumber, readText, type CoercedRow } from "./validate";

type CategorySlot = {
  id: string | null;
  name: string;
  /** Subcategory name (normalised) -> id, or null when this import will create it. */
  subcategories: Map<string, { id: string | null; name: string }>;
};

type PlannedExpense = {
  categoryKey: string;
  subcategoryKey: string | null;
  amount: number;
  date: Date;
  vendor: string | null;
  notes: string | null;
};

export type ExpensesPlan = {
  rows: ResolvedRow[];
  blank: number;
  categories: Map<string, CategorySlot>;
  expenses: PlannedExpense[];
};

const normalizeName = (raw: string) => cleanCell(raw).toLowerCase();

/** Identifies one expense, so re-running the same sheet cannot post it twice. */
function expenseKey(date: Date, categoryKey: string, amount: number, vendor: string | null): string {
  return `${format(date, "yyyy-MM-dd")}|${categoryKey}|${amount}|${normalizeName(vendor ?? "")}`;
}

export async function planExpenses(
  db: ImportDb,
  ctx: ImportContext,
  coerced: CoercedRow[],
  options: ImportOptions,
): Promise<ExpensesPlan> {
  const existingCategories = await db.expenseCategory.findMany({
    where: { propertyId: ctx.propertyId },
    select: { id: true, name: true, subcategories: { select: { id: true, name: true } } },
  });

  const categories = new Map<string, CategorySlot>();
  for (const category of existingCategories) {
    categories.set(normalizeName(category.name), {
      id: category.id,
      name: category.name,
      subcategories: new Map(
        category.subcategories.map((sub) => [normalizeName(sub.name), { id: sub.id, name: sub.name }]),
      ),
    });
  }

  const existingExpenses = await db.expense.findMany({
    where: { propertyId: ctx.propertyId },
    select: { date: true, amount: true, vendor: true, category: { select: { name: true } } },
  });
  const alreadyRecorded = new Set(
    existingExpenses.map((expense) =>
      expenseKey(expense.date, normalizeName(expense.category.name), expense.amount, expense.vendor),
    ),
  );

  const rows: ResolvedRow[] = [];
  const expenses: PlannedExpense[] = [];
  let blank = 0;

  for (const row of coerced) {
    if (row.blank) {
      blank += 1;
      continue;
    }

    const date = readDate(row, "date");
    const categoryName = readText(row, "categoryName") ?? "";
    const amount = readNumber(row, "amount");
    const label = [date ? format(date, "dd MMM yyyy") : null, categoryName || "(no category)"]
      .filter(Boolean)
      .join(" · ");
    const push = (status: ResolvedRow["status"], message: string) =>
      rows.push({ rowNumber: row.rowNumber, status, message, label });

    if (row.errors.length) {
      push("error", row.errors.join("; "));
      continue;
    }
    if (!date || !categoryName || amount === null) {
      push("error", "Date, category and amount are all needed");
      continue;
    }
    if (amount <= 0) {
      push("error", "Amount must be more than zero");
      continue;
    }

    // --- Category ---
    const categoryKey = normalizeName(categoryName);
    let category = categories.get(categoryKey);
    let creating = false;
    if (!category) {
      if (!options.createMissingCategories) {
        push("error", `Category "${categoryName}" is not set up — tick "Create missing categories" to add it`);
        continue;
      }
      category = { id: null, name: cleanCell(categoryName), subcategories: new Map() };
      categories.set(categoryKey, category);
      creating = true;
    }

    // --- Subcategory ---
    const subcategoryName = readText(row, "subcategoryName");
    let subcategoryKey: string | null = null;
    if (subcategoryName) {
      subcategoryKey = normalizeName(subcategoryName);
      if (!category.subcategories.has(subcategoryKey)) {
        if (!options.createMissingCategories) {
          push("error", `Subcategory "${subcategoryName}" is not set up under ${category.name}`);
          continue;
        }
        category.subcategories.set(subcategoryKey, { id: null, name: cleanCell(subcategoryName) });
        creating = true;
      }
    } else if (category.subcategories.size > 0) {
      // Matches the rule createExpense enforces: a category that has subcategories
      // always needs one, otherwise the expense list ends up half-classified.
      push("error", `${category.name} expenses need a subcategory — map a Subcategory column`);
      continue;
    }

    const vendor = readText(row, "vendor");
    const key = expenseKey(date, categoryKey, amount, vendor);
    if (alreadyRecorded.has(key)) {
      push("skip", "An identical expense is already recorded");
      continue;
    }
    alreadyRecorded.add(key);

    expenses.push({
      categoryKey,
      subcategoryKey,
      amount,
      date,
      vendor,
      notes: readText(row, "notes"),
    });
    push(
      "ready",
      `₹${(amount / 100).toLocaleString("en-IN")} to ${category.name}${creating ? " (new category)" : ""}`,
    );
  }

  return { rows, blank, categories, expenses };
}

export async function applyExpenses(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  plan: ExpensesPlan,
): Promise<{ label: string; count: number }[]> {
  if (plan.expenses.length === 0) return [];

  // Only bring into existence what an importable row actually refers to: a row that
  // named a new category and then failed validation must not leave one behind.
  const wantedSubs = new Map<string, Set<string>>();
  for (const expense of plan.expenses) {
    const subs = wantedSubs.get(expense.categoryKey) ?? new Set<string>();
    if (expense.subcategoryKey) subs.add(expense.subcategoryKey);
    wantedSubs.set(expense.categoryKey, subs);
  }

  let newCategories = 0;
  let newSubcategories = 0;

  for (const [categoryKey, subKeys] of wantedSubs) {
    const category = plan.categories.get(categoryKey);
    if (!category) throw new Error(`Import plan is missing category ${categoryKey}`);

    if (category.id === null) {
      const created = await tx.expenseCategory.create({
        data: { propertyId: ctx.propertyId, name: category.name },
        select: { id: true },
      });
      category.id = created.id;
      newCategories += 1;
    }
    for (const subKey of subKeys) {
      const sub = category.subcategories.get(subKey);
      if (!sub || sub.id !== null) continue;
      const created = await tx.expenseSubcategory.create({
        data: { propertyId: ctx.propertyId, categoryId: category.id, name: sub.name },
        select: { id: true },
      });
      sub.id = created.id;
      newSubcategories += 1;
    }
  }

  await tx.expense.createMany({
    data: plan.expenses.map((expense) => {
      const category = plan.categories.get(expense.categoryKey);
      if (!category?.id) throw new Error(`Import plan is missing category ${expense.categoryKey}`);
      return {
        propertyId: ctx.propertyId,
        categoryId: category.id,
        subcategoryId: expense.subcategoryKey
          ? (category.subcategories.get(expense.subcategoryKey)?.id ?? null)
          : null,
        amount: expense.amount,
        date: expense.date,
        vendor: expense.vendor,
        notes: expense.notes,
        createdById: ctx.userId,
      };
    }),
  });

  return [
    { label: "Expenses recorded", count: plan.expenses.length },
    { label: "Categories created", count: newCategories },
    { label: "Subcategories created", count: newSubcategories },
  ].filter((entry) => entry.count > 0);
}
