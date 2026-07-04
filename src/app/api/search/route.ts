import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import type { GlobalSearchResult } from "@/lib/search-types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return Response.json({ results: [] });

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { isFlat: true },
  });
  const isFlat = property?.isFlat ?? false;

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  const contains = { contains: query, mode: "insensitive" as const };
  const upper = query.toUpperCase().replace(/\s+/g, "_");
  const paymentStatuses = ["PAID", "PENDING", "OVERDUE"] as const;
  const paymentMethods = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"] as const;

  const [tenants, rooms, complaints, payments] = await Promise.all([
    prisma.tenant.findMany({
      where: { propertyId, OR: [{ fullName: contains }, { phone: contains }] },
      take: 6,
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        phone: true,
        tenancies: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { bed: { select: { label: true, room: { select: { number: true } } } } },
        },
      },
    }),
    prisma.room.findMany({
      where: {
        propertyId,
        OR: [{ number: contains }, { label: contains }, { beds: { some: { label: contains } } }],
      },
      take: 5,
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        sharingType: true,
        floorId: true,
        floor: { select: { number: true, block: { select: { id: true, name: true } } } },
        beds: { orderBy: { order: "asc" }, select: { id: true, label: true, status: true } },
      },
    }),
    prisma.complaint.findMany({
      where: { propertyId, OR: [{ title: contains }, { description: contains }] },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true, priority: true },
    }),
    prisma.payment.findMany({
      where: {
        propertyId,
        OR: [
          { tenant: { is: { fullName: contains } } },
          { tenant: { is: { phone: contains } } },
          ...(paymentStatuses.includes(upper as (typeof paymentStatuses)[number])
            ? [{ status: { equals: upper as (typeof paymentStatuses)[number] } }]
            : []),
          ...(paymentMethods.includes(upper as (typeof paymentMethods)[number])
            ? [{ method: { equals: upper as (typeof paymentMethods)[number] } }]
            : []),
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        status: true,
        forMonth: true,
        tenant: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  const results: GlobalSearchResult[] = [];
  for (const tenant of tenants) {
    const stay = tenant.tenancies[0];
    results.push({
      id: `tenant-${tenant.id}`,
      type: "tenant",
      title: tenant.fullName,
      subtitle: stay
        ? isFlat
          ? `${tenant.phone} · Flat ${stay.bed.room.number}`
          : `${tenant.phone} · Room ${stay.bed.room.number}, bed ${stay.bed.label}`
        : `${tenant.phone} · Past tenant`,
      href: `/tenants/${tenant.id}`,
    });
  }
  for (const room of rooms) {
    const params = new URLSearchParams({ floor: room.floorId });
    if (room.floor.block) params.set("block", room.floor.block.id);
    const href = `/floor-manager?${params.toString()}`;
    const location = `${room.floor.block ? `Block ${room.floor.block.name}, ` : ""}Floor ${room.floor.number}`;
    results.push({
      id: `room-${room.id}`,
      type: "room",
      title: isFlat ? `Flat ${room.number}` : `Room ${room.number}`,
      subtitle: isFlat ? `${location} · Flat` : `${location} · ${room.sharingType} sharing`,
      href,
    });
    if (!isFlat) {
      for (const bed of room.beds.slice(0, 4)) {
        results.push({
          id: `bed-${bed.id}`,
          type: "bed",
          title: `Room ${room.number}, bed ${bed.label}`,
          subtitle: `${location} · ${bed.status === "OCCUPIED" ? "Occupied" : "Available"}`,
          href,
        });
      }
    }
  }
  for (const complaint of complaints) {
    results.push({
      id: `complaint-${complaint.id}`,
      type: "complaint",
      title: complaint.title,
      subtitle: `${complaint.priority.toLowerCase()} priority · ${complaint.status.replace(/_/g, " ").toLowerCase()}`,
      href: "/complaints",
    });
  }
  for (const payment of payments) {
    results.push({
      id: `payment-${payment.id}`,
      type: "payment",
      title: `${payment.tenant.fullName} payment`,
      subtitle: `${payment.status.toLowerCase()} · ${payment.forMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`,
      href: `/tenants/${payment.tenant.id}`,
    });
  }

  return Response.json({ results: results.slice(0, 24) });
}

