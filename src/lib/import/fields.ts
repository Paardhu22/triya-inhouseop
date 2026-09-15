// The field catalogue: what each sheet type can carry, and the header spellings we
// recognise when guessing a mapping. Pure data — the mapping UI, the auto-mapper, the
// validators and the downloadable templates are all generated from this one source,
// so a new column only has to be added here.
import type { FieldDef, ImportKind, KindDef } from "./types";

const TENANT_FIELDS: FieldDef[] = [
  {
    key: "fullName",
    label: "Full name",
    required: true,
    type: "text",
    aliases: ["name", "tenant name", "resident name", "student name", "tenant", "occupant", "guest name", "member name"],
    example: "Ananya Rao",
  },
  {
    key: "phone",
    label: "Phone",
    required: true,
    type: "phone",
    aliases: ["mobile", "contact", "phone number", "mobile number", "contact number", "mobile no", "phone no", "cell", "whatsapp", "whatsapp number"],
    hint: "10-digit Indian number; +91 / 0 prefixes are fine.",
    example: "9876543210",
  },
  {
    key: "roomNumber",
    label: "Room / flat number",
    required: true,
    type: "text",
    aliases: ["room", "room number", "room no", "flat", "flat no", "flat number", "unit", "unit no", "room/flat"],
    example: "301",
  },
  {
    key: "bedLabel",
    label: "Bed",
    required: false,
    type: "text",
    aliases: ["bed label", "bed no", "bed number", "cot", "cot no", "position"],
    hint: "Leave unmapped to place each resident in the first free bed of the room.",
    example: "A",
  },
  {
    key: "floorNumber",
    label: "Floor",
    required: false,
    type: "int",
    aliases: ["floor number", "floor no", "level"],
    hint: "Only used when creating missing rooms; otherwise inferred from the room number.",
    example: "3",
    min: 0,
    max: 999,
  },
  {
    key: "blockName",
    label: "Block",
    required: false,
    type: "text",
    aliases: ["block name", "wing", "tower", "building"],
    example: "A",
  },
  {
    key: "monthlyRent",
    label: "Monthly rent",
    required: true,
    type: "money",
    aliases: ["rent", "rent amount", "rent per month", "room rent", "monthly amount"],
    example: "8500",
  },
  {
    key: "maintenanceCharge",
    label: "Maintenance charge",
    required: false,
    type: "money",
    aliases: ["maintenance", "maintenance amount", "upkeep", "service charge", "monthly maintenance"],
    example: "500",
  },
  {
    key: "securityDeposit",
    label: "Security deposit",
    required: false,
    type: "money",
    aliases: ["deposit", "advance", "caution deposit", "advance amount", "security", "security amount"],
    example: "10000",
  },
  {
    key: "checkInDate",
    label: "Check-in date",
    required: true,
    type: "date",
    aliases: ["check in", "checkin", "joining date", "date of joining", "doj", "move in", "move in date", "admission date", "start date", "from date", "entry date"],
    hint: "Ambiguous numeric dates are read day-first (01/06/2024 is 1 June).",
    example: "01/06/2024",
  },
  {
    key: "paymentDueDay",
    label: "Rent due day",
    required: false,
    type: "int",
    aliases: ["due day", "rent due day", "payment due day", "due on", "bill day"],
    hint: "Day of the month rent falls due, 1-31.",
    example: "5",
    min: 1,
    max: 31,
  },
  {
    key: "paymentStatus",
    label: "This month paid?",
    required: false,
    type: "paymentStatus",
    aliases: ["payment status", "rent status", "paid", "paid status", "payment state", "rent paid"],
    hint: "Paid rows are recorded as a collection for the current month.",
    example: "Pending",
  },
  {
    key: "paymentMethod",
    label: "Payment method",
    required: false,
    type: "paymentMethod",
    aliases: ["method", "mode", "payment mode", "paid by", "payment type"],
    example: "Cash",
  },
  { key: "email", label: "Email", required: false, type: "email", aliases: ["email address", "mail", "email id"], example: "ananya@example.com" },
  {
    key: "emergencyContact",
    label: "Emergency contact",
    required: false,
    type: "text",
    aliases: ["emergency number", "alternate number", "alternate contact", "guardian number", "parent number", "emergency", "secondary contact"],
    example: "9812345670",
  },
  { key: "fatherName", label: "Father's name", required: false, type: "text", aliases: ["father name", "fathers name", "father", "guardian name"], example: "Suresh Rao" },
  { key: "motherName", label: "Mother's name", required: false, type: "text", aliases: ["mother name", "mothers name", "mother"], example: "Latha Rao" },
  { key: "address", label: "Permanent address", required: false, type: "text", aliases: ["address", "home address", "native place", "residence", "permanent address"], example: "12 MG Road, Vijayawada" },
  { key: "aadhaarNumber", label: "Aadhaar number", required: false, type: "text", aliases: ["aadhaar", "aadhar", "aadhar no", "aadhaar no", "uid", "aadhaar card"], example: "1234 5678 9012" },
  { key: "panNumber", label: "PAN number", required: false, type: "text", aliases: ["pan", "pan card", "pan no"], example: "ABCDE1234F" },
  { key: "college", label: "College", required: false, type: "text", aliases: ["university", "institution", "school", "studying at", "course"], example: "VIT" },
  { key: "company", label: "Company", required: false, type: "text", aliases: ["employer", "organisation", "organization", "working at", "office"], example: "Infosys" },
  { key: "occupation", label: "Occupation", required: false, type: "text", aliases: ["profession", "job", "designation", "work", "student/working"], example: "Student" },
  { key: "notes", label: "Notes", required: false, type: "text", aliases: ["remarks", "comments", "note", "remark"], example: "Prefers ground floor" },
];

const STRUCTURE_FIELDS: FieldDef[] = [
  { key: "blockName", label: "Block", required: false, type: "text", aliases: ["block name", "wing", "tower", "building"], hint: "Only for properties organised into blocks.", example: "A" },
  { key: "floorNumber", label: "Floor", required: true, type: "int", aliases: ["floor number", "floor no", "level"], example: "3", min: 0, max: 999 },
  { key: "roomNumber", label: "Room / flat number", required: true, type: "text", aliases: ["room", "room number", "room no", "flat", "flat no", "flat number", "unit"], example: "301" },
  { key: "roomLabel", label: "Room label", required: false, type: "text", aliases: ["label", "room name", "description"], example: "Corner room" },
  { key: "sharingType", label: "Beds in room", required: true, type: "sharing", aliases: ["sharing", "sharing type", "beds", "no of beds", "capacity", "occupancy", "bed count", "type"], hint: "A number, or words like Single / Double / Triple.", example: "3" },
  { key: "defaultRent", label: "Default rent per bed", required: false, type: "money", aliases: ["rent", "default rent", "room rent", "monthly rent", "rent per bed"], hint: "Pre-fills a move-in for every bed in the room.", example: "8500" },
  { key: "defaultMaintenance", label: "Default maintenance", required: false, type: "money", aliases: ["maintenance", "default maintenance", "maintenance charge"], example: "500" },
];

const PAYMENT_FIELDS: FieldDef[] = [
  { key: "phone", label: "Tenant phone", required: false, type: "phone", aliases: ["mobile", "contact", "phone number", "mobile number", "contact number", "phone no", "mobile no"], hint: "The most reliable way to find the right tenancy.", example: "9876543210" },
  { key: "roomNumber", label: "Room / flat number", required: false, type: "text", aliases: ["room", "room number", "room no", "flat", "flat no", "unit"], hint: "Used when no phone is given.", example: "301" },
  { key: "tenantName", label: "Tenant name", required: false, type: "text", aliases: ["name", "tenant", "resident name", "paid by name", "student name"], hint: "Never used to match — shown in the preview so you can check the row.", example: "Ananya Rao" },
  { key: "month", label: "Billing month", required: true, type: "month", aliases: ["month", "billing month", "for month", "rent month", "period", "month year", "rent for"], example: "2024-06" },
  { key: "amount", label: "Amount collected", required: true, type: "money", aliases: ["amount", "paid amount", "rent paid", "collection", "amount paid", "received", "amount received"], example: "9000" },
  { key: "method", label: "Payment method", required: false, type: "paymentMethod", aliases: ["method", "mode", "payment mode", "payment method", "paid by", "payment type"], example: "Cash" },
  { key: "cashAmount", label: "Cash portion", required: false, type: "money", aliases: ["cash", "cash amount", "cash paid", "by cash"], hint: "Only needed for split collections.", example: "4000" },
  { key: "onlineAmount", label: "Online portion", required: false, type: "money", aliases: ["online", "online amount", "upi", "bank", "online paid", "transfer", "by online"], example: "5000" },
  { key: "paidAt", label: "Collected on", required: false, type: "date", aliases: ["paid on", "payment date", "date", "paid date", "receipt date", "transaction date", "collected on"], hint: "Defaults to the first of the billing month.", example: "05/06/2024" },
  { key: "notes", label: "Notes", required: false, type: "text", aliases: ["remarks", "comments", "note", "reference", "receipt no"], example: "UPI ref 4821" },
];

const EXPENSE_FIELDS: FieldDef[] = [
  { key: "date", label: "Date", required: true, type: "date", aliases: ["expense date", "paid on", "bill date", "transaction date", "spent on"], example: "05/06/2024" },
  { key: "categoryName", label: "Category", required: true, type: "text", aliases: ["category", "expense category", "head", "type", "expense type", "expense head"], example: "Utilities" },
  { key: "subcategoryName", label: "Subcategory", required: false, type: "text", aliases: ["sub category", "sub-category", "subcategory", "item", "particulars", "sub head", "sub type"], example: "Electricity" },
  { key: "amount", label: "Amount", required: true, type: "money", aliases: ["amount", "expense amount", "cost", "value", "total", "paid", "spent"], example: "4200" },
  { key: "vendor", label: "Paid to", required: false, type: "text", aliases: ["vendor", "payee", "supplier", "shop", "merchant", "paid to"], example: "TSSPDCL" },
  { key: "notes", label: "Notes", required: false, type: "text", aliases: ["remarks", "description", "comments", "note", "narration"], example: "June bill" },
];

export const IMPORT_KIND_DEFS: Record<ImportKind, KindDef> = {
  tenants: {
    kind: "tenants",
    label: "Residents & occupancy",
    description:
      "Your current residents and where they live. Creates the tenant, moves them into a bed and sets their rent.",
    rowMeaning: "One row = one resident currently living in the property.",
    fields: TENANT_FIELDS,
  },
  structure: {
    kind: "structure",
    label: "Property structure",
    description:
      "The building itself — floors, rooms and how many beds each room has. Run this first for a brand-new property.",
    rowMeaning: "One row = one room (or flat).",
    fields: STRUCTURE_FIELDS,
  },
  payments: {
    kind: "payments",
    label: "Past rent collections",
    description:
      "Historical rent receipts, posted against the tenancy that covered that month.",
    rowMeaning: "One row = one payment received.",
    fields: PAYMENT_FIELDS,
    requireOneOf: [{ label: "Tenant phone or Room number", keys: ["phone", "roomNumber"] }],
  },
  expenses: {
    kind: "expenses",
    label: "Expenses",
    description: "Past spending, with categories created on the fly if they do not exist yet.",
    rowMeaning: "One row = one expense.",
    fields: EXPENSE_FIELDS,
  },
};

export function kindDef(kind: ImportKind): KindDef {
  return IMPORT_KIND_DEFS[kind];
}

export function fieldDef(kind: ImportKind, key: string): FieldDef | undefined {
  return IMPORT_KIND_DEFS[kind].fields.find((field) => field.key === key);
}
