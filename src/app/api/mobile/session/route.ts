import { getStoragePolicy } from "@/lib/storage-policy";
import { prisma } from "@/lib/prisma";
import { deleteMobileSession, getMobileSession } from "@/lib/mobile/session";

export async function GET() {
  const session = await getMobileSession();
  if (!session) return Response.json({ error: "Please sign in again" }, { status: 401 });
  const properties = await prisma.property.findMany({
    where: { isActive: true, ...(session.user.role === "ADMIN" ? {} : { id: session.user.propertyId ?? "" }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { rooms: true, beds: true } }, beds: { where: { status: "OCCUPIED" }, select: { roomId: true } } },
  });
  return Response.json({ ...session, storage: getStoragePolicy(), properties: properties.map(({ _count, beds, ...property }) => ({
    ...property, stats: { totalRooms: _count.rooms, totalBeds: _count.beds,
      occupiedBeds: property.isFlat ? new Set(beds.map(b => b.roomId)).size : beds.length },
  })) }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE() {
  await deleteMobileSession();
  return Response.json({ ok: true });
}
