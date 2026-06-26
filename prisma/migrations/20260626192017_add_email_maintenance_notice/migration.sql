-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'REFUNDABLE', 'FORFEITED', 'ADJUSTED');

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN     "depositStatus" "DepositStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "maintenanceCharge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noticeGivenDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "email" TEXT;
