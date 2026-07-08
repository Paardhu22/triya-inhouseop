-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('CALLING', 'CONNECTED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "callSid" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'CALLING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Call_callSid_key" ON "Call"("callSid");

-- CreateIndex
CREATE INDEX "Call_propertyId_idx" ON "Call"("propertyId");

-- CreateIndex
CREATE INDEX "Call_tenantId_idx" ON "Call"("tenantId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
