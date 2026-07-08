import "server-only";

import { prisma } from "@/lib/prisma";

/** Recent WhatsApp message sends (manual reminders + the daily cron) for the
 * Collections "Message & Call status" tab, newest first. */
export async function getRecentMessages(propertyId: string) {
  return prisma.message.findMany({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      body: true,
      status: true,
      error: true,
      createdAt: true,
      tenant: { select: { fullName: true, phone: true } },
    },
  });
}

/** Recent AI/test calls (Exotel) for the Collections "Message & Call status" tab,
 * newest first. */
export async function getRecentCalls(propertyId: string) {
  return prisma.call.findMany({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      tenant: { select: { fullName: true, phone: true } },
    },
  });
}

export type RecentMessage = Awaited<ReturnType<typeof getRecentMessages>>[number];
export type RecentCall = Awaited<ReturnType<typeof getRecentCalls>>[number];
