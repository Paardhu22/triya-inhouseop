import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// This seed creates ONLY the staff accounts and the empty property structure
// (floors, rooms and beds — all available). No tenants, occupancy, payments,
// complaints or expenses are created: the app starts from a clean, empty state
// and staff add tenants by clicking a bed in the Floor Manager.
// ---------------------------------------------------------------------------

function bedLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)); // A, B, C, ...
}

// ---------------------------------------------------------------------------
// Property configuration
// ---------------------------------------------------------------------------
type TemplateDef = { name: string; description: string; rooms: number[] };
type FloorDef = { number: number; name?: string };
type BlockDef = { name: string; template: TemplateDef; floors: FloorDef[] };
type PropertyConfig = {
  name: string;
  slug: string;
  address: string;
  city: string;
} & (
  | { hasBlocks: false; template: TemplateDef; floors: FloorDef[] }
  | { hasBlocks: true; blocks: BlockDef[] }
);

const JOYSTAYZ_FLOOR: TemplateDef = {
  name: "Standard Residential Floor",
  description: "14 rooms per floor: configured sharing types.",
  rooms: [3, 3, 2, 2, 3, 2, 3, 3, 3, 2, 2, 3, 3, 2],
};

const PROPERTIES: PropertyConfig[] = [
  {
    name: "Joystayz",
    slug: "joystayz",
    address: "Plot 42, Gachibowli",
    city: "Hyderabad",
    hasBlocks: false,
    template: JOYSTAYZ_FLOOR,
    floors: [3, 4, 5, 6, 7].map((number) => ({ number, name: `Floor ${number}` })),
  },
  {
    name: "Frieden Co-Living",
    slug: "frieden",
    address: "Road No. 12, Banjara Hills",
    city: "Hyderabad",
    hasBlocks: true,
    blocks: [
      {
        name: "A",
        template: {
          name: "Block A Floor",
          description: "Block A: 10 rooms per floor.",
          rooms: [2, 2, 2, 3, 2, 2, 3, 2, 3, 3],
        },
        floors: [1, 2].map((number) => ({ number, name: `Floor ${number}` })),
      },
      {
        name: "B",
        template: {
          name: "Block B Floor",
          description: "Block B: 10 rooms per floor.",
          rooms: [2, 2, 2, 3, 3, 3, 3, 2, 3, 2],
        },
        floors: [1, 2].map((number) => ({ number, name: `Floor ${number}` })),
      },
    ],
  },
  {
    name: "Cozy Gowlidoddy",
    slug: "cozy-gowlidoddy",
    address: "Survey 88, Gowlidoddy",
    city: "Hyderabad",
    hasBlocks: true,
    blocks: [
      {
        name: "A",
        template: {
          name: "STUDIO",
          description: "Studio Flat Block",
          rooms: [1, 1, 1, 1, 1],
        },
        floors: [1, 2, 3, 4, 5].map((number) => ({ number, name: `Floor ${number}` })),
      },
      {
        name: "B",
        template: {
          name: "Premium",
          description: "Premium Flat Block",
          rooms: [1, 1, 1, 1, 1],
        },
        floors: [1, 2, 3, 4, 5].map((number) => ({ number, name: `Floor ${number}` })),
      },
      {
        name: "C",
        template: {
          name: "Hotel",
          description: "Hotel Flat Block",
          rooms: [1, 1, 1, 1, 1],
        },
        floors: [1, 2, 3, 4, 5].map((number) => ({ number, name: `Floor ${number}` })),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------
async function clearAll() {
  // FK-safe order (cascades would cover most, but be explicit and idempotent).
  await prisma.payment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.tenancy.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.bed.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomTemplate.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.floorTemplate.deleteMany();
  await prisma.block.deleteMany();
  await prisma.property.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUsers() {
  const passwordHash = bcrypt.hashSync("Admin@12345", 10);
  const staffHash = bcrypt.hashSync("Staff@12345", 10);

  await prisma.user.create({
    data: { name: "Triya Admin", email: "admin@triya.local", passwordHash, role: "ADMIN" },
  });
  await prisma.user.create({
    data: { name: "Ravi Teja", email: "ravi@triya.local", passwordHash: staffHash, role: "MANAGER" },
  });
  await prisma.user.create({
    data: { name: "Priya Menon", email: "priya@triya.local", passwordHash: staffHash, role: "STAFF" },
  });
}

async function seedFloorRooms(opts: {
  propertyId: string;
  floorId: string;
  floorNumber: number;
  roomPrefix?: string;
  rooms: number[];
}) {
  for (let i = 0; i < opts.rooms.length; i++) {
    const sharing = opts.rooms[i];
    const seq = i + 1;
    const number = `${opts.roomPrefix ?? ""}${opts.floorNumber}${String(seq).padStart(2, "0")}`;
    await prisma.room.create({
      data: {
        propertyId: opts.propertyId,
        floorId: opts.floorId,
        number,
        sharingType: sharing,
        order: seq,
        beds: {
          create: bedLabels(sharing).map((label, idx) => ({
            propertyId: opts.propertyId,
            label,
            order: idx,
          })),
        },
      },
    });
  }
}

async function seedProperties() {
  for (const config of PROPERTIES) {
    const property = await prisma.property.create({
      data: {
        name: config.name,
        slug: config.slug,
        address: config.address,
        city: config.city,
        hasBlocks: config.hasBlocks,
      },
    });

    const makeTemplate = (def: TemplateDef) =>
      prisma.floorTemplate.create({
        data: {
          propertyId: property.id,
          name: def.name,
          description: def.description,
          roomTemplates: {
            create: def.rooms.map((sharing, idx) => ({
              sequence: idx + 1,
              sharingType: sharing,
            })),
          },
        },
      });

    if (config.hasBlocks) {
      for (let b = 0; b < config.blocks.length; b++) {
        const blockDef = config.blocks[b];
        const block = await prisma.block.create({
          data: { propertyId: property.id, name: blockDef.name, order: b },
        });
        const template = await makeTemplate(blockDef.template);
        for (const floorDef of blockDef.floors) {
          const floor = await prisma.floor.create({
            data: {
              propertyId: property.id,
              blockId: block.id,
              templateId: template.id,
              number: floorDef.number,
              name: floorDef.name,
              order: floorDef.number,
            },
          });
          await seedFloorRooms({
            propertyId: property.id,
            floorId: floor.id,
            floorNumber: floorDef.number,
            roomPrefix: blockDef.name,
            rooms: blockDef.template.rooms,
          });
        }
      }
    } else {
      const template = await makeTemplate(config.template);
      for (const floorDef of config.floors) {
        const floor = await prisma.floor.create({
          data: {
            propertyId: property.id,
            templateId: template.id,
            number: floorDef.number,
            name: floorDef.name,
            order: floorDef.number,
          },
        });
        await seedFloorRooms({
          propertyId: property.id,
          floorId: floor.id,
          floorNumber: floorDef.number,
          rooms: config.template.rooms,
        });
      }
    }

    console.log(`  - ${config.name}`);
  }
}

async function main() {
  console.log("Clearing existing data...");
  await clearAll();

  console.log("Seeding users...");
  await seedUsers();

  console.log("Seeding properties, floors, rooms and beds (all available)...");
  await seedProperties();

  const [propertyCount, roomCount, bedCount] = await Promise.all([
    prisma.property.count(),
    prisma.room.count(),
    prisma.bed.count(),
  ]);

  console.log("\nSeed complete:");
  console.log(`  Properties: ${propertyCount}`);
  console.log(`  Rooms:      ${roomCount}`);
  console.log(`  Beds:       ${bedCount}`);
  console.log("\nLogin: admin@triya.local / Admin@12345 (staff users use Staff@12345)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
