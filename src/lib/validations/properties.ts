import { z } from "zod";

// A "section" is one floor group. Properties without blocks have exactly one section;
// block properties (Frieden A/B, Cozy A/B/C) have one per block. roomsPerFloor lists the
// bed-count of each room in floor order; floors lists the floor numbers to instantiate.
const intList = (min: number, max: number) => z.array(z.coerce.number().int().min(min).max(max));

export const propertySectionSchema = z.object({
  name: z.string().trim().max(30).optional().default(""),
  roomsPerFloor: intList(1, 12).min(1, "Add at least one room").max(40),
  floors: intList(0, 999).min(1, "Add at least one floor").max(40),
});

export const createPropertySchema = z
  .object({
    name: z.string().trim().min(2, "Property name is required").max(120),
    city: z.string().trim().max(100).optional().default(""),
    address: z.string().trim().max(240).optional().default(""),
    phone: z.string().trim().max(20).optional().default(""),
    isFlat: z.boolean().default(false),
    hasBlocks: z.boolean().default(false),
    account: z.object({
      email: z.email("Enter a valid account email").max(160),
      phone: z.string().trim().min(10, "Enter a valid WhatsApp number").max(20),
      password: z.string().min(8, "Account password must be at least 8 characters").max(128),
    }),
    sections: z.array(propertySectionSchema).min(1, "Add at least one floor group").max(12),
  })
  .superRefine((data, ctx) => {
    if (data.hasBlocks) {
      data.sections.forEach((section, index) => {
        if (!section.name.trim()) {
          ctx.addIssue({ code: "custom", message: "Every block needs a name", path: ["sections", index, "name"] });
        }
      });
      const names = data.sections.map((section) => section.name.trim().toUpperCase());
      if (new Set(names).size !== names.length) {
        ctx.addIssue({ code: "custom", message: "Block names must be unique", path: ["sections"] });
      }
    } else if (data.sections.length !== 1) {
      ctx.addIssue({ code: "custom", message: "Use a single floor group when blocks are off", path: ["sections"] });
    }
    data.sections.forEach((section, index) => {
      if (new Set(section.floors).size !== section.floors.length) {
        ctx.addIssue({ code: "custom", message: "Floor numbers must be unique", path: ["sections", index, "floors"] });
      }
    });
  });

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const setAccountPasswordSchema = z.object({
  userId: z.string().trim().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const setPropertyActiveSchema = z.object({
  propertyId: z.string().trim().min(1),
  active: z.boolean(),
});
