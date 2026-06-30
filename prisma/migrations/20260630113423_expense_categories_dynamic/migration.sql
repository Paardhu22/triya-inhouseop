-- Replace the hardcoded `ExpenseCategory` enum with property-scoped
-- ExpenseCategory + ExpenseSubcategory tables, preserving existing Expense rows.
--
-- A Postgres table implicitly creates a composite type of the same name, so the
-- old enum type must be renamed out of the way before the new table is created.
-- We backfill categories from the existing enum values, then drop the old type.

-- 1. Move the old enum aside so the new table name is free, and read from it.
ALTER TYPE "ExpenseCategory" RENAME TO "ExpenseCategory_old";

-- 2. New tables.
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseSubcategory" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseSubcategory_pkey" PRIMARY KEY ("id")
);

-- 3. Backfill one category per (property, distinct old enum value), Title-cased.
INSERT INTO "ExpenseCategory" ("id", "propertyId", "name", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text || "propertyId" || "category"::text),
    "propertyId",
    CASE "category"::text
        WHEN 'ELECTRICITY' THEN 'Electricity'
        WHEN 'WATER' THEN 'Water'
        WHEN 'MAINTENANCE' THEN 'Maintenance'
        WHEN 'SALARY' THEN 'Salary'
        WHEN 'INTERNET' THEN 'Internet'
        WHEN 'CLEANING' THEN 'Cleaning'
        WHEN 'MISCELLANEOUS' THEN 'Miscellaneous'
        ELSE initcap("category"::text)
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "propertyId", "category" FROM "Expense") AS distinct_cats;

-- 4. Add the new FK columns to Expense (nullable for backfill).
ALTER TABLE "Expense" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "subcategoryId" TEXT;

-- 5. Point each expense at its newly-created category.
UPDATE "Expense" e
SET "categoryId" = c."id"
FROM "ExpenseCategory" c
WHERE c."propertyId" = e."propertyId"
  AND c."name" = CASE e."category"::text
        WHEN 'ELECTRICITY' THEN 'Electricity'
        WHEN 'WATER' THEN 'Water'
        WHEN 'MAINTENANCE' THEN 'Maintenance'
        WHEN 'SALARY' THEN 'Salary'
        WHEN 'INTERNET' THEN 'Internet'
        WHEN 'CLEANING' THEN 'Cleaning'
        WHEN 'MISCELLANEOUS' THEN 'Miscellaneous'
        ELSE initcap(e."category"::text)
    END;

-- 6. Now every row has a category; enforce it and drop the old column + type.
ALTER TABLE "Expense" ALTER COLUMN "categoryId" SET NOT NULL;
DROP INDEX IF EXISTS "Expense_category_idx";
ALTER TABLE "Expense" DROP COLUMN "category";
DROP TYPE "ExpenseCategory_old";

-- 7. Indexes + unique constraints.
CREATE UNIQUE INDEX "ExpenseCategory_propertyId_name_key" ON "ExpenseCategory"("propertyId", "name");
CREATE INDEX "ExpenseCategory_propertyId_idx" ON "ExpenseCategory"("propertyId");
CREATE UNIQUE INDEX "ExpenseSubcategory_categoryId_name_key" ON "ExpenseSubcategory"("categoryId", "name");
CREATE INDEX "ExpenseSubcategory_categoryId_idx" ON "ExpenseSubcategory"("categoryId");
CREATE INDEX "ExpenseSubcategory_propertyId_idx" ON "ExpenseSubcategory"("propertyId");
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
CREATE INDEX "Expense_subcategoryId_idx" ON "Expense"("subcategoryId");

-- 8. Foreign keys.
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseSubcategory" ADD CONSTRAINT "ExpenseSubcategory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseSubcategory" ADD CONSTRAINT "ExpenseSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ExpenseSubcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
