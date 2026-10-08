-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'ONLINE', 'SPLIT');
ALTER TABLE "public"."Payment" ALTER COLUMN "method" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
ALTER TABLE "Payment" ALTER COLUMN "method" SET DEFAULT 'CASH';
COMMIT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "paidPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "receivedPaise" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cashAmount" INTEGER,
ADD COLUMN     "onlineAmount" INTEGER,
ADD COLUMN     "recordedById" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "rulesText" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "defaultMaintenance" INTEGER,
ADD COLUMN     "defaultRent" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE INDEX "User_propertyId_idx" ON "User"("propertyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

