import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// This seed creates ONLY the admin account and the empty property structure
// (floors, rooms and beds — all available). No tenants, occupancy, payments,
// complaints or expenses are created: the app starts from a clean, empty state
// and staff add tenants by clicking a bed in the Floor Manager.
//
// The admin's credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (.env).
// Property manager accounts are created afterwards from the Admin page.
//
// It refuses to run against a database that already holds properties, so it can
// never wipe real data. Use `npm run db:reset` to deliberately start over.
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
  isFlat?: boolean;
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
        floors: [1, 2, 3, 4, 5, 6].map((number) => ({ number, name: `Floor ${number}` })),
      },
      {
        name: "B",
        template: {
          name: "Block B Floor",
          description: "Block B: 10 rooms per floor.",
          rooms: [2, 2, 2, 3, 3, 3, 3, 2, 3, 2],
        },
        floors: [1, 2, 3, 4, 5, 6].map((number) => ({ number, name: `Floor ${number}` })),
      },
    ],
  },
  {
    name: "Cozy Gowlidoddy",
    slug: "cozy-gowlidoddy",
    address: "Survey 88, Gowlidoddy",
    city: "Hyderabad",
    isFlat: true,
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
function adminCredentials() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding.");
  }
  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  }
  return { email, password };
}

// A sensible, fully-editable starter set so the Expense Tracker isn't empty on
// first run. These are DB rows (managed via the in-app Category Manager), not
// hardcoded application constants.
const STARTER_CATEGORIES: { name: string; subs: string[] }[] = [
  { name: "Utilities", subs: ["Electricity", "Water", "Internet"] },
  { name: "Maintenance", subs: ["Plumbing", "Electrical", "Carpentry", "Painting"] },
  { name: "Food & Groceries", subs: ["Rice", "Vegetables", "Milk", "Groceries"] },
  { name: "Staff Salary", subs: [] },
  { name: "Cleaning", subs: [] },
  { name: "Miscellaneous", subs: [] },
];

async function seedExpenseCategories() {
  const properties = await prisma.property.findMany({ select: { id: true } });
  for (const property of properties) {
    for (const cat of STARTER_CATEGORIES) {
      await prisma.expenseCategory.create({
        data: {
          propertyId: property.id,
          name: cat.name,
          subcategories: { create: cat.subs.map((name) => ({ propertyId: property.id, name })) },
        },
      });
    }
  }
}

// The global ADMIN account (propertyId null → access to every property).
async function seedAdmin(email: string, password: string) {
  await prisma.user.create({
    data: { name: "Triya Admin", email, passwordHash: bcrypt.hashSync(password, 10), role: "ADMIN" },
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
        isFlat: config.isFlat ?? false,
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
  const admin = adminCredentials();
  if ((await prisma.property.count()) > 0 || (await prisma.user.count()) > 0) {
    throw new Error("Database is not empty — refusing to seed over existing data.");
  }

  console.log("Seeding admin...");
  await seedAdmin(admin.email, admin.password);

  console.log("Seeding properties, floors, rooms and beds (all available)...");
  await seedProperties();

  console.log("Seeding starter expense categories...");
  await seedExpenseCategories();

  const [propertyCount, roomCount, bedCount] = await Promise.all([
    prisma.property.count(),
    prisma.room.count(),
    prisma.bed.count(),
  ]);

  console.log("\nSeed complete:");
  console.log(`  Properties: ${propertyCount}`);
  console.log(`  Rooms:      ${roomCount}`);
  console.log(`  Beds:       ${bedCount}`);
  console.log(`\nAdmin login: ${admin.email} (password from SEED_ADMIN_PASSWORD)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
