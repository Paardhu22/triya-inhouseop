import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { TEST_TENANT_MARKER } from "../src/lib/tenancy";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Idempotent: seeds (or re-seeds) the fixed "Harshith Reddy" test tenant used to
// exercise the AI Call / Exotel integration, in Room 999 · T of Varnav Living
// Spaces Colive. Safe to re-run — it reuses the existing room/tenant if present.
const PROPERTY_SLUG = "varnav-colive";
const ROOM_NUMBER = "999";
const BED_LABEL = "T";
const TENANT_NAME = "Harshith Reddy";
const TENANT_PHONE = "+917207082405";

async function main() {
  const property = await prisma.property.findUnique({ where: { slug: PROPERTY_SLUG } });
  if (!property) throw new Error(`Property with slug "${PROPERTY_SLUG}" not found. Run npm run db:seed first.`);

  let room = await prisma.room.findFirst({
    where: { propertyId: property.id, number: ROOM_NUMBER },
    include: { beds: true },
  });

  if (!room) {
    const floor = await prisma.floor.create({
      data: { propertyId: property.id, number: 999, name: "Test", order: 999 },
    });
    room = await prisma.room.create({
      data: {
        propertyId: property.id,
        floorId: floor.id,
        number: ROOM_NUMBER,
        sharingType: 1,
        order: 999,
        beds: { create: [{ propertyId: property.id, label: BED_LABEL, status: "OCCUPIED" }] },
      },
      include: { beds: true },
    });
  }

  const bed = room.beds.find((b) => b.label === BED_LABEL) ?? room.beds[0];
  if (!bed) throw new Error("Room 999 has no bed to attach the test tenant to.");

  let tenant = await prisma.tenant.findFirst({
    where: { propertyId: property.id, notes: TEST_TENANT_MARKER },
  });
  if (tenant) {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { fullName: TENANT_NAME, phone: TENANT_PHONE },
    });
  } else {
    tenant = await prisma.tenant.create({
      data: {
        propertyId: property.id,
        fullName: TENANT_NAME,
        phone: TENANT_PHONE,
        notes: TEST_TENANT_MARKER,
      },
    });
  }

  const existingTenancy = await prisma.tenancy.findFirst({
    where: { tenantId: tenant.id, status: "ACTIVE" },
  });
  if (existingTenancy) {
    await prisma.tenancy.update({
      where: { id: existingTenancy.id },
      data: { monthlyRent: 0, maintenanceCharge: 0, paymentStatus: "PENDING" },
    });
  } else {
    await prisma.tenancy.create({
      data: {
        propertyId: property.id,
        tenantId: tenant.id,
        bedId: bed.id,
        roomId: room.id,
        status: "ACTIVE",
        monthlyRent: 0,
        maintenanceCharge: 0,
        paymentStatus: "PENDING",
        checkInDate: new Date(),
      },
    });
  }

  console.log(`Seeded test tenant "${TENANT_NAME}" (${TENANT_PHONE}) in Room ${ROOM_NUMBER} · ${BED_LABEL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
