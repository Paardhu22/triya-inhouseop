import "dotenv/config";

import { addDays, setDate, startOfMonth, subDays, subMonths } from "date-fns";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type PaymentMethod, type PaymentStatus } from "../src/generated/prisma/client";
import { MAINTENANCE_RESERVE_PAISE, vacateByDate } from "../src/lib/tenancy";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// Mock data for the Frieden Co-Living property, for TESTING ONLY.
//
// Fills the property to ~50% occupancy with realistic tenants, staggered
// check-in dates, per-month payment history, a few tenants on notice, a few
// ended tenancies (history), plus complaints and expenses. Additive: it only
// occupies beds that are AVAILABLE and exits early if occupancy is already at
// or above the target, so re-running it will not duplicate data.
//
// Run with: npm run db:mock   (or: npx tsx prisma/mock-frieden.ts)
// ---------------------------------------------------------------------------

const TARGET_OCCUPANCY = 0.5;

// Deterministic PRNG so successive runs on a fresh DB produce the same dataset.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260713);

const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// People pools (Hyderabad-flavoured)
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Aarav", "Aditya", "Akash", "Amit", "Ananya", "Anil", "Anjali", "Anusha",
  "Arjun", "Bhavana", "Chaitanya", "Charan", "Deepak", "Deepika", "Divya",
  "Ganesh", "Harika", "Harish", "Hemanth", "Ishaan", "Jyothi", "Karthik",
  "Kavya", "Keerthi", "Kiran", "Krishna", "Lakshmi", "Lavanya", "Madhav",
  "Mahesh", "Manasa", "Manoj", "Meghana", "Mohan", "Mounika", "Naveen",
  "Neha", "Nikhil", "Nithya", "Pavan", "Pooja", "Pradeep", "Prakash",
  "Pranav", "Prasad", "Praveen", "Priya", "Rahul", "Rajesh", "Rakesh",
  "Ramya", "Ravi", "Rohan", "Rohit", "Sandeep", "Sanjay", "Santosh",
  "Shalini", "Shiva", "Shreya", "Siddharth", "Sneha", "Soumya", "Sravani",
  "Sridhar", "Srinivas", "Suman", "Suresh", "Swathi", "Tarun", "Teja",
  "Uday", "Varun", "Venkatesh", "Vijay", "Vikram", "Vinay", "Vishal",
  "Yaswanth", "Sai Kumar",
];

const LAST_NAMES = [
  "Reddy", "Rao", "Kumar", "Sharma", "Naidu", "Chowdary", "Varma", "Goud",
  "Yadav", "Patel", "Gupta", "Agarwal", "Iyer", "Nair", "Menon", "Pillai",
  "Das", "Banerjee", "Singh", "Verma", "Mishra", "Joshi", "Kulkarni",
  "Deshmukh", "Patil", "Shetty", "Hegde", "Prasad", "Murthy", "Sastry",
  "Vemula", "Kancharla", "Gadde", "Mandava", "Chinta", "Bandi",
];

const COMPANIES = [
  "Infosys", "TCS", "Wipro", "Accenture", "Deloitte", "Amazon", "Cognizant",
  "Capgemini", "Tech Mahindra", "HCLTech", "Genpact", "EY GDS", "Micron",
  "ServiceNow", "Salesforce", "Qualcomm", "Novartis", "Franklin Templeton",
];

const JOB_TITLES = [
  "Software Engineer", "Senior Software Engineer", "Data Analyst",
  "Business Analyst", "QA Engineer", "DevOps Engineer", "UI/UX Designer",
  "HR Executive", "Accountant", "Consultant", "Sales Executive",
  "Process Associate", "Technical Support Engineer",
];

const COLLEGES = [
  "JNTU Hyderabad", "Osmania University", "CBIT", "VNR VJIET",
  "IIIT Hyderabad", "St. Francis College", "Nizam College",
  "Aurora Degree College", "Vasavi College of Engineering", "MGIT",
];

const HOME_TOWNS = [
  "Warangal, Telangana", "Karimnagar, Telangana", "Nizamabad, Telangana",
  "Khammam, Telangana", "Vijayawada, Andhra Pradesh", "Guntur, Andhra Pradesh",
  "Visakhapatnam, Andhra Pradesh", "Tirupati, Andhra Pradesh",
  "Nellore, Andhra Pradesh", "Kurnool, Andhra Pradesh", "Nagpur, Maharashtra",
  "Bengaluru, Karnataka", "Bhubaneswar, Odisha", "Raipur, Chhattisgarh",
];

const EMAIL_DOMAINS = ["gmail.com", "gmail.com", "gmail.com", "outlook.com", "yahoo.in"];

const usedNames = new Set<string>();
const usedPhones = new Set<string>();

function makeName(): string {
  for (let i = 0; i < 100; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  throw new Error("Ran out of unique names");
}

function makePhone(): string {
  for (let i = 0; i < 100; i++) {
    const phone = `${pick(["9", "9", "8", "7"])}${String(randInt(0, 999999999)).padStart(9, "0")}`;
    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
  throw new Error("Ran out of unique phones");
}

function makeEmail(fullName: string): string {
  const slug = fullName.toLowerCase().replace(/[^a-z]+/g, ".");
  return `${slug}${randInt(1, 99)}@${pick(EMAIL_DOMAINS)}`;
}

type TenantProfile = {
  fullName: string;
  phone: string;
  email: string | null;
  emergencyContact: string;
  fatherName: string | null;
  address: string | null;
  college: string | null;
  company: string | null;
  occupation: string | null;
};

function makeTenantProfile(): TenantProfile {
  const fullName = makeName();
  const lastName = fullName.split(" ").pop() ?? "";
  const isStudent = chance(0.35);
  return {
    fullName,
    phone: makePhone(),
    email: chance(0.7) ? makeEmail(fullName) : null,
    emergencyContact: makePhone(),
    fatherName: chance(0.6) ? `${pick(FIRST_NAMES)} ${lastName}` : null,
    address: chance(0.5) ? pick(HOME_TOWNS) : null,
    college: isStudent ? pick(COLLEGES) : null,
    company: isStudent ? null : pick(COMPANIES),
    occupation: isStudent ? "Student" : pick(JOB_TITLES),
  };
}

// ---------------------------------------------------------------------------
// Money helpers (all integer paise)
// ---------------------------------------------------------------------------

/** Monthly rent by sharing type, in paise, rounded to ₹500 steps. */
function rentFor(sharingType: number): number {
  const rupees =
    sharingType <= 2
      ? pick([9500, 10000, 10500, 11000, 11500, 12000])
      : pick([7500, 8000, 8500, 9000]);
  return rupees * 100;
}

function paymentMethod(): { method: PaymentMethod; cash: number | null; online: number | null } {
  const r = rand();
  if (r < 0.55) return { method: "ONLINE", cash: null, online: null };
  if (r < 0.85) return { method: "CASH", cash: null, online: null };
  return { method: "SPLIT", cash: 0, online: 0 }; // amounts filled in by caller
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function main() {
  const property = await prisma.property.findUnique({
    where: { slug: "frieden" },
    select: { id: true, name: true },
  });
  if (!property) {
    throw new Error('Property with slug "frieden" not found. Run `npm run db:seed` first.');
  }
  const manager = await prisma.user.findUnique({
    where: { email: "frieden@triya.local" },
    select: { id: true },
  });

  const now = new Date();
  const currentMonth = startOfMonth(now);

  const [totalBeds, occupiedBeds] = await Promise.all([
    prisma.bed.count({ where: { propertyId: property.id } }),
    prisma.bed.count({ where: { propertyId: property.id, status: "OCCUPIED" } }),
  ]);
  const targetOccupied = Math.ceil(totalBeds * TARGET_OCCUPANCY);
  const toFill = targetOccupied - occupiedBeds;
  if (toFill <= 0) {
    console.log(
      `${property.name} is already at ${occupiedBeds}/${totalBeds} occupied (target ${targetOccupied}). Nothing to do.`,
    );
    return;
  }

  const availableBeds = await prisma.bed.findMany({
    where: { propertyId: property.id, status: "AVAILABLE" },
    select: {
      id: true,
      roomId: true,
      room: { select: { number: true, sharingType: true } },
    },
  });
  const shuffled = shuffle(availableBeds);
  const bedsToOccupy = shuffled.slice(0, toFill);
  // A handful of beds that stay AVAILABLE host ended tenancies (move-out history).
  const bedsForHistory = shuffled.slice(toFill, toFill + 8);

  console.log(`Filling ${property.name}: ${bedsToOccupy.length} move-ins (${occupiedBeds} already occupied, ${totalBeds} beds total)...`);

  // --- Active tenancies -----------------------------------------------------
  let noticeCount = 0;
  const statusCounts: Record<PaymentStatus, number> = { PAID: 0, PENDING: 0, OVERDUE: 0 };
  let paymentRows = 0;

  for (const bed of bedsToOccupy) {
    const profile = makeTenantProfile();
    const rent = rentFor(bed.room.sharingType);
    const maintenance = chance(0.7) ? 50000 : 0; // ₹500 or none
    const grossDeposit = pick([rent, 1000000, 1500000]); // one month's rent, ₹10k or ₹15k
    const paymentDueDay = randInt(1, 10);
    // Check-ins staggered over the ~17 months before today.
    const checkInDate = subDays(now, randInt(3, 520));

    // ~6% of long-enough stayers are serving notice right now.
    const eligibleForNotice = checkInDate < subMonths(now, 2) && noticeCount < 9 && chance(0.06);
    const noticeGivenDate = eligibleForNotice ? subDays(now, randInt(1, 12)) : null;

    // Current-cycle snapshot: mostly paid; overdue only makes sense past the due day.
    let paymentStatus: PaymentStatus;
    if (checkInDate >= currentMonth) {
      paymentStatus = "PAID"; // moved in this month → paid at move-in
    } else {
      const r = rand();
      if (r < 0.62) paymentStatus = "PAID";
      else if (r < 0.85 || now.getDate() <= paymentDueDay) paymentStatus = "PENDING";
      else paymentStatus = "OVERDUE";
    }
    statusCounts[paymentStatus]++;
    if (noticeGivenDate) noticeCount++;

    const tenant = await prisma.tenant.create({
      data: {
        propertyId: property.id,
        ...profile,
        notes: chance(0.12) ? pick([
          "Prefers ground/lower floor.",
          "Vegetarian meals only.",
          "Referred by an existing tenant.",
          "Works night shifts.",
          "Asked about long-term stay discount.",
        ]) : null,
      },
    });

    const tenancy = await prisma.tenancy.create({
      data: {
        propertyId: property.id,
        tenantId: tenant.id,
        bedId: bed.id,
        roomId: bed.roomId,
        status: "ACTIVE",
        monthlyRent: rent,
        maintenanceCharge: maintenance,
        securityDeposit: Math.max(0, grossDeposit - MAINTENANCE_RESERVE_PAISE),
        paymentStatus,
        paymentDueDay,
        checkInDate,
        noticeGivenDate,
        expectedLeavingDate: noticeGivenDate ? vacateByDate(noticeGivenDate) : null,
      },
    });

    await prisma.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });

    // Paid ledger rows for past months (capped at the last 6) + current month if paid.
    // Pending/overdue cycles have no row, matching how the app records payments.
    const amount = rent + maintenance;
    const rows: {
      propertyId: string; tenancyId: string; tenantId: string; amount: number;
      forMonth: Date; status: PaymentStatus; method: PaymentMethod;
      cashAmount: number | null; onlineAmount: number | null; paidAt: Date;
      recordedById: string | null;
    }[] = [];
    for (let back = 6; back >= 0; back--) {
      const forMonth = subMonths(currentMonth, back);
      if (forMonth < startOfMonth(checkInDate)) continue;
      if (forMonth.getTime() === currentMonth.getTime() && paymentStatus !== "PAID") continue;
      const { method, cash } = paymentMethod();
      const cashPart = cash !== null ? Math.round(amount * pick([0.25, 0.4, 0.5]) / 100) * 100 : null;
      let paidAt = setDate(forMonth, Math.min(paymentDueDay + randInt(0, 4), 28));
      if (paidAt < checkInDate) paidAt = checkInDate;
      if (paidAt > now) paidAt = subDays(now, randInt(0, 3));
      rows.push({
        propertyId: property.id,
        tenancyId: tenancy.id,
        tenantId: tenant.id,
        amount,
        forMonth,
        status: "PAID",
        method,
        cashAmount: cashPart,
        onlineAmount: cashPart !== null ? amount - cashPart : null,
        paidAt,
        recordedById: manager?.id ?? null,
      });
    }
    if (rows.length > 0) {
      await prisma.payment.createMany({ data: rows });
      paymentRows += rows.length;
    }
  }

  // --- Ended tenancies (move-out history on beds that are free again) --------
  let endedCount = 0;
  for (const bed of bedsForHistory) {
    const profile = makeTenantProfile();
    const rent = rentFor(bed.room.sharingType);
    const checkOutDate = subDays(now, randInt(30, 300));
    const checkInDate = subDays(checkOutDate, randInt(90, 400));
    const servedNotice = chance(0.7);
    const noticeGivenDate = servedNotice ? subDays(checkOutDate, randInt(16, 30)) : null;

    const tenant = await prisma.tenant.create({ data: { propertyId: property.id, ...profile } });
    await prisma.tenancy.create({
      data: {
        propertyId: property.id,
        tenantId: tenant.id,
        bedId: bed.id,
        roomId: bed.roomId,
        status: "ENDED",
        monthlyRent: rent,
        maintenanceCharge: 50000,
        securityDeposit: Math.max(0, pick([rent, 1000000]) - MAINTENANCE_RESERVE_PAISE),
        paymentStatus: "PAID",
        paymentDueDay: randInt(1, 10),
        checkInDate,
        noticeGivenDate,
        expectedLeavingDate: noticeGivenDate ? vacateByDate(noticeGivenDate) : null,
        checkOutDate,
        depositStatus: servedNotice ? "REFUNDABLE" : "FORFEITED",
      },
    });
    endedCount++;
  }

  // --- Complaints -------------------------------------------------------------
  const occupiedTenancies = await prisma.tenancy.findMany({
    where: { propertyId: property.id, status: "ACTIVE" },
    select: { tenantId: true, roomId: true },
  });
  const COMPLAINTS: { title: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH" }[] = [
    { title: "Wi-Fi not working on Floor 3", description: "Router keeps dropping connection since yesterday evening.", priority: "HIGH" },
    { title: "Geyser not heating", description: "Bathroom geyser takes 30+ minutes and water is still lukewarm.", priority: "MEDIUM" },
    { title: "Washing machine out of order", description: "Block B washing machine stops mid-cycle and shows error E3.", priority: "MEDIUM" },
    { title: "Cockroaches in kitchen area", description: "Requesting pest control on the shared pantry this week.", priority: "HIGH" },
    { title: "Ceiling fan making noise", description: "Fan wobbles and makes a clicking sound at higher speeds.", priority: "LOW" },
    { title: "Low water pressure in shower", description: "Barely any pressure in the mornings between 7 and 9 AM.", priority: "MEDIUM" },
    { title: "Tube light flickering in corridor", description: "Corridor light near the stairs flickers constantly.", priority: "LOW" },
    { title: "Food quality declining", description: "Rice was undercooked twice this week; requesting a menu review.", priority: "MEDIUM" },
    { title: "AC not cooling", description: "AC runs but the room stays warm; possibly needs a gas refill.", priority: "HIGH" },
    { title: "Door lock jammed", description: "Room door lock sticks; takes several tries to open.", priority: "MEDIUM" },
    { title: "Water leakage under wash basin", description: "Slow leak collecting into a puddle near the basin.", priority: "MEDIUM" },
    { title: "Dustbins not cleared", description: "Floor dustbins were not cleared for two days over the weekend.", priority: "LOW" },
    { title: "Power socket sparking", description: "Socket near the study table sparked while plugging in a laptop.", priority: "HIGH" },
    { title: "Mattress needs replacement", description: "Mattress has sagged badly and causes back pain.", priority: "LOW" },
  ];
  for (const c of COMPLAINTS) {
    const linked = chance(0.8) ? pick(occupiedTenancies) : null;
    const r = rand();
    const status = r < 0.4 ? "RESOLVED" : r < 0.7 ? "IN_PROGRESS" : "OPEN";
    const createdAt = subDays(now, randInt(0, 45));
    await prisma.complaint.create({
      data: {
        propertyId: property.id,
        title: c.title,
        description: c.description,
        priority: c.priority,
        status,
        tenantId: linked?.tenantId ?? null,
        roomId: linked?.roomId ?? null,
        assignedToId: status !== "OPEN" ? manager?.id ?? null : null,
        createdAt,
        resolvedAt: status === "RESOLVED" ? addDays(createdAt, randInt(1, 7)) : null,
      },
    });
  }

  // --- Expenses (last 4 months) ----------------------------------------------
  const categories = await prisma.expenseCategory.findMany({
    where: { propertyId: property.id },
    select: { id: true, name: true, subcategories: { select: { id: true, name: true } } },
  });
  const cat = (name: string) => categories.find((c) => c.name === name);
  const sub = (catName: string, subName: string) =>
    cat(catName)?.subcategories.find((s) => s.name === subName);

  let expenseCount = 0;
  const addExpense = async (opts: {
    category: string; subcategory?: string; rupees: number; date: Date; vendor?: string; notes?: string;
  }) => {
    const category = cat(opts.category);
    if (!category || opts.date > now) return;
    await prisma.expense.create({
      data: {
        propertyId: property.id,
        categoryId: category.id,
        subcategoryId: opts.subcategory ? sub(opts.category, opts.subcategory)?.id ?? null : null,
        amount: opts.rupees * 100,
        date: opts.date,
        vendor: opts.vendor ?? null,
        notes: opts.notes ?? null,
        createdById: manager?.id ?? null,
      },
    });
    expenseCount++;
  };

  for (let back = 3; back >= 0; back--) {
    const month = subMonths(currentMonth, back);
    await addExpense({ category: "Utilities", subcategory: "Electricity", rupees: randInt(42000, 68000), date: setDate(month, randInt(5, 10)), vendor: "TSSPDCL", notes: "Monthly electricity bill" });
    await addExpense({ category: "Utilities", subcategory: "Water", rupees: randInt(8000, 14000), date: setDate(month, randInt(5, 12)), vendor: "HMWSSB" });
    await addExpense({ category: "Utilities", subcategory: "Internet", rupees: 5999, date: setDate(month, randInt(1, 5)), vendor: "ACT Fibernet", notes: "Both blocks" });
    await addExpense({ category: "Staff Salary", rupees: randInt(58000, 62000), date: setDate(month, 1), notes: "Cook, cleaning and security staff" });
    await addExpense({ category: "Cleaning", rupees: randInt(3000, 6000), date: setDate(month, randInt(10, 20)), vendor: "UrbanKleen Services" });
    for (let i = 0; i < 3; i++) {
      await addExpense({
        category: "Food & Groceries",
        subcategory: pick(["Rice", "Vegetables", "Milk", "Groceries"]),
        rupees: randInt(4000, 18000),
        date: setDate(month, randInt(2, 27)),
        vendor: pick(["Metro Cash & Carry", "Ratnadeep Wholesale", "Local vendor", "Heritage Foods"]),
      });
    }
    if (chance(0.75)) {
      await addExpense({
        category: "Maintenance",
        subcategory: pick(["Plumbing", "Electrical", "Carpentry", "Painting"]),
        rupees: randInt(1500, 12000),
        date: setDate(month, randInt(3, 26)),
        vendor: pick(["Sri Sai Electricals", "Kumar Plumbing Works", "Fixit Services", "A1 Repairs"]),
      });
    }
  }

  // --- Summary ---------------------------------------------------------------
  const [finalOccupied, tenantCount] = await Promise.all([
    prisma.bed.count({ where: { propertyId: property.id, status: "OCCUPIED" } }),
    prisma.tenant.count({ where: { propertyId: property.id } }),
  ]);
  console.log(`\nMock data for ${property.name} complete:`);
  console.log(`  Occupancy:        ${finalOccupied}/${totalBeds} beds`);
  console.log(`  Tenants:          ${tenantCount} (${endedCount} moved out, ${noticeCount} on notice)`);
  console.log(`  Current cycle:    ${statusCounts.PAID} paid / ${statusCounts.PENDING} pending / ${statusCounts.OVERDUE} overdue`);
  console.log(`  Payment rows:     ${paymentRows}`);
  console.log(`  Complaints:       ${COMPLAINTS.length}`);
  console.log(`  Expenses:         ${expenseCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
