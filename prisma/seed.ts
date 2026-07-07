import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { startOfMonth, subMonths } from "date-fns";

import { PrismaClient } from "../src/generated/prisma/client";
import type { PaymentMethod, PaymentStatus } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// Seeds three demo properties (2 PGs + 1 flat) fully populated with tenants,
// a month of payment/expense/complaint history, and one login per role so the
// whole app (App Owner console, Property Owner dashboard, Manager screens,
// Tenant portal) has real data to look at out of the box.
// ---------------------------------------------------------------------------

function bedLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)); // A, B, C, ...
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

/** A random day within `monthStart`'s month, never later than today. */
function randomDayIn(monthStart: Date): Date {
  const now = new Date();
  const isCurrentMonth =
    monthStart.getFullYear() === now.getFullYear() && monthStart.getMonth() === now.getMonth();
  const maxDay = isCurrentMonth ? now.getDate() : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), randInt(1, Math.max(1, maxDay)));
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Property configuration
// ---------------------------------------------------------------------------
type TemplateDef = { name: string; description: string; rooms: number[] };
type FloorDef = { number: number; name?: string };
type BlockDef = { name: string; template: TemplateDef; floors: FloorDef[] };
// Each property ships with one non-admin MANAGER account, scoped to that property
// (User.propertyId). These sign in from the login-page user dropdown.
type AccountDef = { email: string; password: string };
type PropertyConfig = {
  name: string;
  slug: string;
  address: string;
  city: string;
  isFlat?: boolean;
  account: AccountDef;
  rentRange: [number, number]; // rupees/month
  occupancyRate: number; // fraction of beds to fill with demo tenants
} & (
  | { hasBlocks: false; template: TemplateDef; floors: FloorDef[] }
  | { hasBlocks: true; blocks: BlockDef[] }
);

const PROPERTIES: PropertyConfig[] = [
  {
    name: "Varnav Living Spaces Colive",
    slug: "varnav-colive",
    address: "Plot 14, Kondapur",
    city: "Hyderabad",
    account: { email: "varnav@dazz.local", password: "varnav@12345" },
    rentRange: [8000, 13000],
    occupancyRate: 0.6,
    hasBlocks: false,
    template: {
      name: "Standard Residential Floor",
      description: "5 rooms per floor: mixed sharing.",
      rooms: [2, 2, 3, 3, 2],
    },
    floors: [1, 2, 3].map((number) => ({ number, name: `Floor ${number}` })),
  },
  {
    name: "Maple PG",
    slug: "maple-pg",
    address: "Street 7, Madhapur",
    city: "Hyderabad",
    account: { email: "maple@dazz.local", password: "maple@12345" },
    rentRange: [9000, 14000],
    occupancyRate: 0.55,
    hasBlocks: true,
    blocks: [
      {
        name: "A",
        template: { name: "Block A Floor", description: "3 rooms per floor.", rooms: [2, 3, 2] },
        floors: [1, 2].map((number) => ({ number, name: `Floor ${number}` })),
      },
      {
        name: "B",
        template: { name: "Block B Floor", description: "3 rooms per floor.", rooms: [3, 2, 3] },
        floors: [1, 2].map((number) => ({ number, name: `Floor ${number}` })),
      },
    ],
  },
  {
    name: "Balaji Homes",
    slug: "balaji-homes",
    address: "Main Road, Miyapur",
    city: "Hyderabad",
    account: { email: "balaji@dazz.local", password: "balaji@12345" },
    rentRange: [15000, 24000],
    occupancyRate: 0.65,
    isFlat: true,
    hasBlocks: true,
    blocks: [
      {
        name: "A",
        template: { name: "STUDIO", description: "Studio flat block", rooms: [1, 1, 1] },
        floors: [1, 2, 3].map((number) => ({ number, name: `Floor ${number}` })),
      },
      {
        name: "B",
        template: { name: "Premium", description: "Premium flat block", rooms: [1, 1, 1] },
        floors: [1, 2, 3].map((number) => ({ number, name: `Floor ${number}` })),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Demo data pools
// ---------------------------------------------------------------------------
const TENANT_NAMES = [
  "Aarav Sharma", "Vivaan Reddy", "Aditya Rao", "Vihaan Kumar", "Arjun Nair",
  "Sai Krishna", "Rohan Gupta", "Kabir Iyer", "Ishaan Menon", "Aryan Pillai",
  "Ananya Verma", "Diya Patel", "Saanvi Joshi", "Myra Desai", "Aadhya Bhat",
  "Kiara Shetty", "Riya Kapoor", "Priya Chawla", "Neha Malhotra", "Pooja Bose",
  "Karthik Iyengar", "Rahul Chowdary", "Siddharth Rana", "Naveen Achar", "Varun Prasad",
  "Meera Krishnan", "Sneha Reddy", "Divya Bhatt", "Lakshmi Menon", "Deepika Nair",
  "Akhil Varma", "Harsha Vardhan", "Praveen Yadav", "Suresh Naidu", "Manoj Tiwari",
  "Sanjana Rao", "Nikitha Reddy", "Swathi Kumar", "Bhavana Rao", "Chitra Iyer",
];
let nameIndex = 0;
function nextName(): string {
  return TENANT_NAMES[nameIndex++ % TENANT_NAMES.length];
}

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter += 1;
  return String(9100000000 + phoneCounter);
}

const COMPLAINT_POOL: { title: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH" }[] = [
  { title: "Leaking tap in bathroom", description: "Water keeps dripping from the wash basin tap.", priority: "MEDIUM" },
  { title: "WiFi not working", description: "No internet connectivity since yesterday evening.", priority: "HIGH" },
  { title: "AC not cooling", description: "The air conditioner is running but not cooling the room.", priority: "HIGH" },
  { title: "Room needs cleaning", description: "Common area wasn't cleaned this week.", priority: "LOW" },
  { title: "Broken cupboard door", description: "The wardrobe door hinge is broken.", priority: "LOW" },
  { title: "Geyser not heating", description: "No hot water in the mornings.", priority: "MEDIUM" },
  { title: "Noisy water pump", description: "The motor makes a loud noise at night.", priority: "MEDIUM" },
  { title: "Pest issue", description: "Saw cockroaches near the kitchen area.", priority: "HIGH" },
  { title: "Streetlight outside not working", description: "It's dark near the entrance at night.", priority: "LOW" },
  { title: "Food quality complaint", description: "Dinner was cold and undercooked yesterday.", priority: "MEDIUM" },
];

const VENDOR_POOL = [
  "Sri Balaji Electricals", "Hyderabad Plumbing Works", "FreshMart Groceries", "CleanPro Services",
  "TSSPDCL", "ACT Fibernet", "Metro Water Board", "Om Sai Maintenance", "Local Kirana Store",
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
  await prisma.expenseSubcategory.deleteMany();
  await prisma.expenseCategory.deleteMany();
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
  const result = new Map<string, { id: string; subIds: string[] }[]>();
  for (const property of properties) {
    const cats: { id: string; subIds: string[] }[] = [];
    for (const cat of STARTER_CATEGORIES) {
      const created = await prisma.expenseCategory.create({
        data: {
          propertyId: property.id,
          name: cat.name,
          subcategories: { create: cat.subs.map((name) => ({ propertyId: property.id, name })) },
        },
        select: { id: true, subcategories: { select: { id: true } } },
      });
      cats.push({ id: created.id, subIds: created.subcategories.map((s) => s.id) });
    }
    result.set(property.id, cats);
  }
  return result;
}

// The global APP_OWNER account (propertyId null → access to every property). Each
// property's own MANAGER account is created alongside the property in seedProperties.
async function seedUsers() {
  const passwordHash = bcrypt.hashSync("Admin@12345", 10);
  await prisma.user.create({
    data: { name: "DAZZ Admin", email: "admin@dazz.local", passwordHash, role: "APP_OWNER" },
  });
}

// One demo PROPERTY_OWNER, owning all three seeded properties (propertyId null →
// scoped instead via PropertyOwnership).
async function seedPropertyOwner() {
  const properties = await prisma.property.findMany({ select: { id: true } });
  const passwordHash = bcrypt.hashSync("Owner@12345", 10);
  await prisma.user.create({
    data: {
      name: "Demo Property Owner",
      email: "owner@dazz.local",
      passwordHash,
      role: "PROPERTY_OWNER",
      ownedProperties: { create: properties.map((p) => ({ propertyId: p.id })) },
    },
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
  const created: { config: PropertyConfig; propertyId: string; managerId: string }[] = [];

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

    // The property's scoped MANAGER account.
    const manager = await prisma.user.create({
      data: {
        name: `${config.name} Manager`,
        email: config.account.email,
        passwordHash: bcrypt.hashSync(config.account.password, 10),
        role: "MANAGER",
        propertyId: property.id,
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
    created.push({ config, propertyId: property.id, managerId: manager.id });
  }

  return created;
}

/**
 * Occupies a share of a property's beds with demo tenants, and generates a
 * month of history: last month's rent already paid, this month a mix of
 * paid/pending/overdue, a handful of complaints (open/in-progress/resolved),
 * and expenses across categories for both months. Returns the one tenant
 * login created for this property (for the credentials summary).
 */
async function seedDemoDataForProperty(opts: {
  propertyId: string;
  managerId: string;
  config: PropertyConfig;
  categories: { id: string; subIds: string[] }[];
}): Promise<{ email: string; password: string; name: string } | null> {
  const thisMonthStart = startOfMonth(new Date());
  const lastMonthStart = startOfMonth(subMonths(new Date(), 1));

  const beds = await prisma.bed.findMany({
    where: { propertyId: opts.propertyId },
    select: { id: true, roomId: true },
  });
  const occupyCount = Math.max(1, Math.round(beds.length * opts.config.occupancyRate));
  const shuffled = [...beds].sort(() => Math.random() - 0.5).slice(0, occupyCount);

  let tenantLogin: { email: string; password: string; name: string } | null = null;

  for (const [index, bed] of shuffled.entries()) {
    const name = nextName();
    const phone = nextPhone();
    const rentPaise = randInt(...opts.config.rentRange) * 100;
    const maintenancePaise = opts.config.isFlat ? 0 : randInt(5, 15) * 100;
    const roll = Math.random();
    const paymentStatus: PaymentStatus = roll < 0.6 ? "PAID" : roll < 0.85 ? "PENDING" : "OVERDUE";

    let tenantUserId: string | undefined;
    if (index === 0) {
      const email = `tenant.${opts.config.slug}@dazz.local`;
      const password = "Tenant@12345";
      const tenantUser = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: bcrypt.hashSync(password, 10),
          role: "TENANT",
          propertyId: opts.propertyId,
        },
      });
      tenantUserId = tenantUser.id;
      tenantLogin = { email, password, name };
    }

    const tenant = await prisma.tenant.create({
      data: {
        propertyId: opts.propertyId,
        userId: tenantUserId,
        fullName: name,
        phone,
      },
    });
    const tenancy = await prisma.tenancy.create({
      data: {
        propertyId: opts.propertyId,
        tenantId: tenant.id,
        bedId: bed.id,
        roomId: bed.roomId,
        status: "ACTIVE",
        monthlyRent: rentPaise,
        maintenanceCharge: maintenancePaise,
        paymentStatus,
        paymentDueDay: randInt(1, 10),
        checkInDate: monthsAgo(randInt(1, 6)),
      },
    });
    await prisma.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });

    // Everyone paid last month (history), this month follows their paymentStatus.
    const method: PaymentMethod = Math.random() < 0.5 ? "CASH" : "ONLINE";
    await prisma.payment.create({
      data: {
        propertyId: opts.propertyId,
        tenancyId: tenancy.id,
        tenantId: tenant.id,
        amount: rentPaise + maintenancePaise,
        forMonth: lastMonthStart,
        status: "PAID",
        method,
        paidAt: randomDayIn(lastMonthStart),
        recordedById: opts.managerId,
      },
    });
    if (paymentStatus === "PAID") {
      await prisma.payment.create({
        data: {
          propertyId: opts.propertyId,
          tenancyId: tenancy.id,
          tenantId: tenant.id,
          amount: rentPaise + maintenancePaise,
          forMonth: thisMonthStart,
          status: "PAID",
          method: Math.random() < 0.5 ? "CASH" : "ONLINE",
          paidAt: randomDayIn(thisMonthStart),
          recordedById: opts.managerId,
        },
      });
    }
  }

  // Complaints: a handful per property, mixed statuses, spread across this month.
  const tenants = await prisma.tenant.findMany({
    where: { propertyId: opts.propertyId },
    select: { id: true, tenancies: { where: { status: "ACTIVE" }, select: { roomId: true }, take: 1 } },
  });
  const complaintCount = randInt(5, 8);
  for (let i = 0; i < complaintCount; i++) {
    const tenant = tenants.length ? pick(tenants) : null;
    const complaint = COMPLAINT_POOL[i % COMPLAINT_POOL.length];
    const createdAt = randomDayIn(thisMonthStart);
    const outcome = Math.random();
    const status = outcome < 0.45 ? "RESOLVED" : outcome < 0.75 ? "IN_PROGRESS" : "OPEN";
    await prisma.complaint.create({
      data: {
        propertyId: opts.propertyId,
        title: complaint.title,
        description: complaint.description,
        priority: complaint.priority,
        tenantId: tenant?.id,
        roomId: tenant?.tenancies[0]?.roomId,
        assignedToId: opts.managerId,
        status,
        createdAt,
        resolvedAt: status === "RESOLVED" ? new Date(createdAt.getTime() + randInt(1, 3) * 86_400_000) : null,
      },
    });
  }

  // Expenses: several per category across last month + this month.
  for (const monthStart of [lastMonthStart, thisMonthStart]) {
    const count = randInt(6, 10);
    for (let i = 0; i < count; i++) {
      const category = pick(opts.categories);
      const subcategoryId = category.subIds.length && Math.random() < 0.7 ? pick(category.subIds) : null;
      await prisma.expense.create({
        data: {
          propertyId: opts.propertyId,
          categoryId: category.id,
          subcategoryId,
          amount: randInt(500, 8000) * 100,
          date: randomDayIn(monthStart),
          vendor: pick(VENDOR_POOL),
          createdById: opts.managerId,
        },
      });
    }
  }

  return tenantLogin;
}

async function main() {
  console.log("Clearing existing data...");
  await clearAll();

  console.log("Seeding users...");
  await seedUsers();

  console.log("Seeding properties, floors, rooms and beds...");
  const properties = await seedProperties();

  console.log("Seeding starter expense categories...");
  const categoriesByProperty = await seedExpenseCategories();

  console.log("Seeding a demo property owner...");
  await seedPropertyOwner();

  console.log("Seeding tenants, a month of payments/expenses, and complaints...");
  const tenantLogins: { email: string; password: string; name: string; property: string }[] = [];
  for (const p of properties) {
    const login = await seedDemoDataForProperty({
      propertyId: p.propertyId,
      managerId: p.managerId,
      config: p.config,
      categories: categoriesByProperty.get(p.propertyId) ?? [],
    });
    if (login) tenantLogins.push({ ...login, property: p.config.name });
  }

  const [propertyCount, roomCount, bedCount, tenantCount, paymentCount, complaintCount, expenseCount] =
    await Promise.all([
      prisma.property.count(),
      prisma.room.count(),
      prisma.bed.count(),
      prisma.tenant.count(),
      prisma.payment.count(),
      prisma.complaint.count(),
      prisma.expense.count(),
    ]);

  console.log("\nSeed complete:");
  console.log(`  Properties: ${propertyCount}`);
  console.log(`  Rooms:      ${roomCount}`);
  console.log(`  Beds:       ${bedCount}`);
  console.log(`  Tenants:    ${tenantCount}`);
  console.log(`  Payments:   ${paymentCount}`);
  console.log(`  Complaints: ${complaintCount}`);
  console.log(`  Expenses:   ${expenseCount}`);

  console.log("\n=== Credentials ===");
  console.log("App Owner (full access, all properties):");
  console.log("  admin@dazz.local / Admin@12345");
  console.log("\nProperty Owner (owns all 3 properties):");
  console.log("  owner@dazz.local / Owner@12345");
  console.log("\nManagers (one per property):");
  for (const config of PROPERTIES) {
    console.log(`  ${config.account.email} / ${config.account.password}   (${config.name})`);
  }
  console.log("\nTenants (portal login — dues/payments/complaints):");
  for (const t of tenantLogins) {
    console.log(`  ${t.email} / ${t.password}   (${t.name} — ${t.property})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
