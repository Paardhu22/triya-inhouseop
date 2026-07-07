import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import type { CreatePropertyInput } from "@/lib/validations/properties";

export function bedLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

export async function uniquePropertySlug(name: string): Promise<string> {
  const root = slugify(name) || "property";
  let slug = root;
  let suffix = 2;
  while (await prisma.property.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

/**
 * Builds a property's full block/floor/room/bed structure from the wizard's
 * `sections` shape, inside an existing transaction. Shared by the App Owner's
 * legacy `createProperty` and a Property Owner's self-serve `createOwnedProperty`.
 */
export async function provisionPropertyStructure(
  tx: Prisma.TransactionClient,
  propertyId: string,
  data: CreatePropertyInput,
): Promise<void> {
  for (let sectionIndex = 0; sectionIndex < data.sections.length; sectionIndex += 1) {
    const section = data.sections[sectionIndex];
    const block = data.hasBlocks
      ? await tx.block.create({
          data: { propertyId, name: section.name.trim(), order: sectionIndex },
        })
      : null;

    const template = await tx.floorTemplate.create({
      data: {
        propertyId,
        name: block ? `Block ${block.name} Floor` : "Standard Floor",
        roomTemplates: {
          create: section.roomsPerFloor.map((sharingType, index) => ({
            sequence: index + 1,
            sharingType,
          })),
        },
      },
    });

    for (const floorNumber of section.floors) {
      await tx.floor.create({
        data: {
          propertyId,
          blockId: block?.id ?? null,
          templateId: template.id,
          number: floorNumber,
          name: `Floor ${floorNumber}`,
          order: floorNumber,
          rooms: {
            create: section.roomsPerFloor.map((sharing, index) => {
              const sequence = index + 1;
              const number = `${block?.name ?? ""}${floorNumber}${String(sequence).padStart(2, "0")}`;
              return {
                propertyId,
                number,
                sharingType: sharing,
                order: sequence,
                beds: {
                  create: bedLabels(sharing).map((label, bedIndex) => ({
                    propertyId,
                    label,
                    order: bedIndex,
                  })),
                },
              };
            }),
          },
        },
      });
    }
  }
}
