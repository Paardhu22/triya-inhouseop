import "server-only";

// An in-memory picture of the property's blocks / floors / rooms / beds that the
// planners read and mutate as they walk a sheet. Two rows naming the same new room
// must agree on it, and two rows landing in the same room must not both take bed A —
// keeping that state here is what makes the preview an honest dry run of the commit.
import type { Prisma } from "@/generated/prisma/client";

import { bedLabelAt, cleanCell, inferBlockName, inferFloorNumber, normalizeBedLabel, normalizeRoomNumber } from "./coerce";

/** Reads work against either the client or a transaction, so preview and commit share code. */
export type ImportDb = Prisma.TransactionClient;

export type BedSlot = {
  /** null until the bed is created by this import. */
  id: string | null;
  label: string;
  /** Occupied in the database, or claimed by an earlier row of this sheet. */
  taken: boolean;
};

export type RoomSlot = {
  /** null until the room is created by this import. */
  id: string | null;
  /** Match key: uppercased, punctuation and "Room"/"Flat" prefixes removed. */
  key: string;
  /** The number as it is (or will be) stored. */
  number: string;
  floorNumber: number;
  blockName: string | null;
  label: string | null;
  defaultRent: number | null;
  defaultMaintenance: number | null;
  beds: BedSlot[];
};

export type StructureMap = Map<string, RoomSlot>;

/** Load the property's existing rooms and beds, flagging beds that are already occupied. */
export async function loadStructureMap(db: ImportDb, propertyId: string): Promise<StructureMap> {
  const rooms = await db.room.findMany({
    where: { propertyId },
    select: {
      id: true,
      number: true,
      label: true,
      defaultRent: true,
      defaultMaintenance: true,
      floor: { select: { number: true, block: { select: { name: true } } } },
      beds: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          label: true,
          status: true,
          _count: { select: { tenancies: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  const map: StructureMap = new Map();
  for (const room of rooms) {
    map.set(normalizeRoomNumber(room.number), {
      id: room.id,
      key: normalizeRoomNumber(room.number),
      number: room.number,
      floorNumber: room.floor.number,
      blockName: room.floor.block?.name ?? null,
      label: room.label,
      defaultRent: room.defaultRent,
      defaultMaintenance: room.defaultMaintenance,
      beds: room.beds.map((bed) => ({
        id: bed.id,
        label: bed.label,
        taken: bed.status === "OCCUPIED" || bed._count.tenancies > 0,
      })),
    });
  }
  return map;
}

/** Add a room that this import will create, inferring floor and block where not given. */
export function planRoom(
  map: StructureMap,
  input: {
    number: string;
    floorNumber: number | null;
    blockName: string | null;
    label?: string | null;
    defaultRent?: number | null;
    defaultMaintenance?: number | null;
    bedCount?: number;
  },
  hasBlocks: boolean,
): RoomSlot {
  const key = normalizeRoomNumber(input.number);
  const slot: RoomSlot = {
    id: null,
    key,
    number: cleanCell(input.number),
    floorNumber: input.floorNumber ?? inferFloorNumber(key),
    blockName: hasBlocks ? (input.blockName ?? inferBlockName(key)) : null,
    label: input.label ?? null,
    defaultRent: input.defaultRent ?? null,
    defaultMaintenance: input.defaultMaintenance ?? null,
    beds: Array.from({ length: input.bedCount ?? 0 }, (_, index) => ({
      id: null,
      label: bedLabelAt(index),
      taken: false,
    })),
  };
  map.set(key, slot);
  return slot;
}

/** Append one more bed to a room, using the first letter it is not already using. */
export function addBed(room: RoomSlot, label?: string | null): BedSlot | null {
  const wanted = label ? normalizeBedLabel(label) : null;
  if (wanted && room.beds.some((bed) => bed.label === wanted)) return null;

  let chosen = wanted;
  if (!chosen) {
    const used = new Set(room.beds.map((bed) => bed.label));
    for (let index = 0; index < 26 && !chosen; index += 1) {
      const candidate = bedLabelAt(index);
      if (!used.has(candidate)) chosen = candidate;
    }
  }
  if (!chosen) return null;

  const bed: BedSlot = { id: null, label: chosen, taken: false };
  room.beds.push(bed);
  return bed;
}

/**
 * The unique address of a bed within the plan, used to look its id up after creation.
 * Both halves are normalised to [A-Z0-9], so "#" cannot occur inside either.
 */
export function bedKey(roomKey: string, bedLabel: string): string {
  return `${roomKey}#${bedLabel}`;
}

export type StructureWrites = {
  /** Rooms that do not exist yet, with the beds they should be created with. */
  newRooms: RoomSlot[];
  /** Beds to add to rooms that already exist. */
  newBeds: { room: RoomSlot; labels: string[] }[];
};

/** Split the map into the writes needed to make it real. */
export function structureWrites(map: StructureMap): StructureWrites {
  const newRooms: RoomSlot[] = [];
  const newBeds: StructureWrites["newBeds"] = [];

  for (const room of map.values()) {
    if (room.id === null) {
      newRooms.push(room);
      continue;
    }
    const labels = room.beds.filter((bed) => bed.id === null).map((bed) => bed.label);
    if (labels.length) newBeds.push({ room, labels });
  }
  return { newRooms, newBeds };
}

export function countStructureWrites(writes: StructureWrites) {
  return {
    rooms: writes.newRooms.length,
    beds: writes.newRooms.reduce((sum, room) => sum + room.beds.length, 0) +
      writes.newBeds.reduce((sum, entry) => sum + entry.labels.length, 0),
  };
}

/**
 * Create every planned block, floor, room and bed, filling in the ids on the map as it
 * goes. Returns what was created plus a lookup from bed key to bed id, which the
 * tenants importer needs to place its move-ins.
 */
export async function applyStructure(
  tx: Prisma.TransactionClient,
  propertyId: string,
  map: StructureMap,
  hasBlocks: boolean,
): Promise<{ blocks: number; floors: number; rooms: number; beds: number; bedIds: Map<string, string> }> {
  const writes = structureWrites(map);
  const bedIds = new Map<string, string>();

  // Beds that already exist can be addressed immediately.
  for (const room of map.values()) {
    for (const bed of room.beds) {
      if (bed.id) bedIds.set(bedKey(room.key, bed.label), bed.id);
    }
  }
  if (writes.newRooms.length === 0 && writes.newBeds.length === 0) {
    return { blocks: 0, floors: 0, rooms: 0, beds: 0, bedIds };
  }

  let createdBlocks = 0;
  let createdFloors = 0;
  let createdBeds = 0;

  // --- Blocks ---
  const blockIds = new Map<string, string>();
  if (hasBlocks) {
    const existing = await tx.block.findMany({ where: { propertyId }, select: { id: true, name: true } });
    for (const block of existing) blockIds.set(block.name.toUpperCase(), block.id);

    const wanted = new Set(
      writes.newRooms.map((room) => room.blockName).filter((name): name is string => Boolean(name)),
    );
    let order = existing.length;
    for (const name of wanted) {
      if (blockIds.has(name.toUpperCase())) continue;
      const block = await tx.block.create({ data: { propertyId, name, order } });
      blockIds.set(name.toUpperCase(), block.id);
      createdBlocks += 1;
      order += 1;
    }
  }

  // --- Floors ---
  const floorKey = (blockId: string | null, number: number) => `${blockId ?? ""}#${number}`;
  const floorIds = new Map<string, string>();
  const existingFloors = await tx.floor.findMany({
    where: { propertyId },
    select: { id: true, number: true, blockId: true },
  });
  for (const floor of existingFloors) floorIds.set(floorKey(floor.blockId, floor.number), floor.id);

  for (const room of writes.newRooms) {
    const blockId = room.blockName ? (blockIds.get(room.blockName.toUpperCase()) ?? null) : null;
    const key = floorKey(blockId, room.floorNumber);
    if (floorIds.has(key)) continue;
    const floor = await tx.floor.create({
      data: {
        propertyId,
        blockId,
        number: room.floorNumber,
        name: `Floor ${room.floorNumber}`,
        order: room.floorNumber,
      },
    });
    floorIds.set(key, floor.id);
    createdFloors += 1;
  }

  // --- Rooms and their beds ---
  for (const room of writes.newRooms) {
    const blockId = room.blockName ? (blockIds.get(room.blockName.toUpperCase()) ?? null) : null;
    const floorId = floorIds.get(floorKey(blockId, room.floorNumber));
    if (!floorId) continue;

    const created = await tx.room.create({
      data: {
        propertyId,
        floorId,
        number: room.number,
        label: room.label,
        sharingType: Math.max(1, room.beds.length),
        defaultRent: room.defaultRent,
        defaultMaintenance: room.defaultMaintenance,
        beds: {
          create: room.beds.map((bed, index) => ({ propertyId, label: bed.label, order: index })),
        },
      },
      select: { id: true, beds: { select: { id: true, label: true } } },
    });
    room.id = created.id;
    createdBeds += created.beds.length;
    for (const bed of created.beds) {
      bedIds.set(bedKey(room.key, bed.label), bed.id);
      const slot = room.beds.find((item) => item.label === bed.label);
      if (slot) slot.id = bed.id;
    }
  }

  // --- Extra beds on rooms that already existed ---
  for (const { room, labels } of writes.newBeds) {
    if (!room.id) continue;
    const startOrder = room.beds.length - labels.length;
    for (const [index, label] of labels.entries()) {
      const bed = await tx.bed.create({
        data: { propertyId, roomId: room.id, label, order: startOrder + index },
        select: { id: true },
      });
      bedIds.set(bedKey(room.key, label), bed.id);
      const slot = room.beds.find((item) => item.label === label);
      if (slot) slot.id = bed.id;
      createdBeds += 1;
    }
    // Keep the room's configured capacity in step with the beds it now has.
    await tx.room.update({ where: { id: room.id }, data: { sharingType: room.beds.length } });
  }

  return {
    blocks: createdBlocks,
    floors: createdFloors,
    rooms: writes.newRooms.length,
    beds: createdBeds,
    bedIds,
  };
}
