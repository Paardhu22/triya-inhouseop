"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import {
  blockSchema,
  floorSchema,
  floorTemplateSchema,
  roomCapacitySchema,
} from "@/lib/validations/admin";

class AdminActionError extends Error {}

async function requireAdminContext() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  const propertyId = await getSelectedPropertyId();
  return propertyId ? { propertyId } : null;
}

function revalidatePropertyStructure() {
  revalidatePath("/admin");
  revalidatePath("/floor-manager");
  revalidatePath("/dashboard");
}

function nextBedLabels(existing: string[], count: number) {
  const used = new Set(existing);
  const labels: string[] = [];
  for (let index = 0; labels.length < count && index < 26; index += 1) {
    const label = String.fromCharCode(65 + index);
    if (!used.has(label)) labels.push(label);
  }
  if (labels.length !== count) throw new AdminActionError("Could not allocate bed labels");
  return labels;
}

export async function updateRoomCapacity(input: unknown): Promise<ActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx) return actionError("Administrator access required");
  const parsed = roomCapacitySchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid capacity");

  try {
    await prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: parsed.data.roomId, propertyId: ctx.propertyId },
        select: {
          id: true,
          beds: {
            orderBy: { order: "asc" },
            select: { id: true, label: true, status: true, order: true },
          },
        },
      });
      if (!room) throw new AdminActionError("Room not found");

      const currentCount = room.beds.length;
      const occupiedCount = room.beds.filter((bed) => bed.status === "OCCUPIED").length;
      const target = parsed.data.targetSharing;
      if (target < occupiedCount) {
        throw new AdminActionError(`Capacity cannot be below ${occupiedCount} occupied beds`);
      }

      if (target < currentCount) {
        const required = currentCount - target;
        const uniqueIds = [...new Set(parsed.data.removeBedIds)];
        if (uniqueIds.length !== required) {
          throw new AdminActionError(`Select exactly ${required} available bed${required === 1 ? "" : "s"}`);
        }
        const removable = room.beds.filter(
          (bed) => uniqueIds.includes(bed.id) && bed.status === "AVAILABLE",
        );
        if (removable.length !== required) {
          throw new AdminActionError("Only available beds can be removed");
        }
        const deleted = await tx.bed.deleteMany({
          where: {
            id: { in: uniqueIds },
            roomId: room.id,
            propertyId: ctx.propertyId,
            status: "AVAILABLE",
          },
        });
        if (deleted.count !== required) {
          throw new AdminActionError("Bed occupancy changed. Refresh and try again");
        }
      } else if (target > currentCount) {
        const labels = nextBedLabels(
          room.beds.map((bed) => bed.label),
          target - currentCount,
        );
        const maxOrder = room.beds.reduce((max, bed) => Math.max(max, bed.order), -1);
        await tx.bed.createMany({
          data: labels.map((label, index) => ({
            propertyId: ctx.propertyId,
            roomId: room.id,
            label,
            order: maxOrder + index + 1,
          })),
        });
      }

      await tx.room.update({ where: { id: room.id }, data: { sharingType: target } });
    });
  } catch (error) {
    if (error instanceof AdminActionError) return actionError(error.message);
    return actionError("Could not update room capacity");
  }

  revalidatePropertyStructure();
  return actionOk();
}

export async function createFloorTemplate(input: unknown): Promise<ActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx) return actionError("Administrator access required");
  const parsed = floorTemplateSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid template");

  await prisma.floorTemplate.create({
    data: {
      propertyId: ctx.propertyId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      roomTemplates: {
        create: parsed.data.sharingTypes.map((sharingType, index) => ({
          sequence: index + 1,
          sharingType,
        })),
      },
    },
  });
  revalidatePropertyStructure();
  return actionOk();
}

export async function createBlock(input: unknown): Promise<ActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx) return actionError("Administrator access required");
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid block");

  const property = await prisma.property.findFirst({
    where: { id: ctx.propertyId, hasBlocks: true },
    select: { id: true, _count: { select: { blocks: true } } },
  });
  if (!property) return actionError("This property does not use blocks");

  try {
    await prisma.block.create({
      data: { propertyId: ctx.propertyId, name: parsed.data.name, order: property._count.blocks },
    });
  } catch {
    return actionError("A block with this name already exists");
  }
  revalidatePropertyStructure();
  return actionOk();
}

export async function createFloorFromTemplate(input: unknown): Promise<ActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx) return actionError("Administrator access required");
  const parsed = floorSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid floor");

  const [property, template] = await Promise.all([
    prisma.property.findUnique({
      where: { id: ctx.propertyId },
      select: { hasBlocks: true },
    }),
    prisma.floorTemplate.findFirst({
      where: { id: parsed.data.templateId, propertyId: ctx.propertyId },
      select: {
        id: true,
        roomTemplates: {
          orderBy: { sequence: "asc" },
          select: { sequence: true, sharingType: true, label: true },
        },
      },
    }),
  ]);
  if (!property || !template) return actionError("Property or template not found");
  if (template.roomTemplates.length === 0) return actionError("The selected template has no rooms");

  const block = parsed.data.blockId
    ? await prisma.block.findFirst({
        where: { id: parsed.data.blockId, propertyId: ctx.propertyId },
        select: { id: true, name: true },
      })
    : null;
  if (property.hasBlocks && !block) return actionError("Select a block for this floor");
  if (!property.hasBlocks && block) return actionError("This property does not use blocks");

  try {
    await prisma.floor.create({
      data: {
        propertyId: ctx.propertyId,
        blockId: block?.id ?? null,
        templateId: template.id,
        number: parsed.data.number,
        name: parsed.data.name || `Floor ${parsed.data.number}`,
        order: parsed.data.number,
        rooms: {
          create: template.roomTemplates.map((room) => {
            const number = `${block?.name ?? ""}${parsed.data.number}${String(room.sequence).padStart(2, "0")}`;
            return {
              propertyId: ctx.propertyId,
              number,
              label: room.label,
              sharingType: room.sharingType,
              order: room.sequence,
              beds: {
                create: Array.from({ length: room.sharingType }, (_, index) => ({
                  propertyId: ctx.propertyId,
                  label: String.fromCharCode(65 + index),
                  order: index,
                })),
              },
            };
          }),
        },
      },
    });
  } catch {
    return actionError("That floor or one of its room numbers already exists");
  }

  revalidatePropertyStructure();
  return actionOk();
}

