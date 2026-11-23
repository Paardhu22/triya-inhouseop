-- Additive only: no existing table, column, index or policy is dropped or altered
-- except for ADDING a nullable column to "Property".

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable (nullable, so existing rows are unaffected)
ALTER TABLE "Property" ADD COLUMN "websiteSlug" TEXT;
CREATE UNIQUE INDEX "Property_websiteSlug_key" ON "Property"("websiteSlug");

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "preferredCheckIn" TIMESTAMP(3),
    "kycKey" TEXT,
    "kycFilename" TEXT,
    "kycMimeType" TEXT,
    "kycSize" INTEGER,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "tenantId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationRequest_propertyId_status_createdAt_idx" ON "RegistrationRequest"("propertyId", "status", "createdAt");
CREATE INDEX "RegistrationRequest_status_createdAt_idx" ON "RegistrationRequest"("status", "createdAt");
CREATE INDEX "RegistrationRequest_kycKey_idx" ON "RegistrationRequest"("kycKey");
CREATE INDEX "RegistrationRequest_tenantId_idx" ON "RegistrationRequest"("tenantId");

ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defence in depth: the app connects as the table owner (RLS bypass), but if the
-- Supabase Data API (anon/authenticated roles) is enabled, deny it any access.
ALTER TABLE "RegistrationRequest" ENABLE ROW LEVEL SECURITY;
