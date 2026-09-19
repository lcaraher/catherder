import { Prisma, type EventInvite, type PrismaClient } from "@prisma/client";
import { prisma } from "@/adapters/db/client";
import {
  canRedeemInvite,
  generateInviteCode,
  normalizeInviteCode,
} from "@/domain/invites";

type Db = Prisma.TransactionClient | PrismaClient;

const MAX_CODE_ATTEMPTS = 5;

function isCodeCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target)
    ? target.includes("code")
    : typeof target === "string" && target.includes("code");
}

/** Runs `attempt` with a fresh code, retrying only on a code collision. */
export async function withFreshInviteCode<T>(
  attempt: (code: string) => Promise<T>,
): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt(generateInviteCode());
    } catch (error) {
      if (!isCodeCollision(error) || tries >= MAX_CODE_ATTEMPTS) throw error;
    }
  }
}

/** Creates the event's invite and its audit row inside the caller's transaction. */
export async function createInviteInTx(
  tx: Db,
  {
    eventId,
    code,
    actorUserId,
  }: { eventId: string; code: string; actorUserId: string },
): Promise<EventInvite> {
  const invite = await tx.eventInvite.create({
    data: { eventId, code, createdByUserId: actorUserId },
  });
  await tx.auditEvent.create({
    data: {
      actorUserId,
      entity: "EventInvite",
      entityId: invite.id,
      action: "created",
      detail: { eventId },
    },
  });
  return invite;
}

export type RedeemResult =
  { ok: true; eventId: string; alreadyParticipant: boolean } | { ok: false };

/**
 * Redeems a typed or linked code for `userId`: joins the event where needed
 * and records the outcome. Never surfaces why it failed.
 */
export async function redeemInvite({
  userId,
  rawCode,
}: {
  userId: string;
  rawCode: string;
}): Promise<RedeemResult> {
  const code = normalizeInviteCode(rawCode);
  const invite = code
    ? await prisma.eventInvite.findUnique({
        where: { code },
        include: {
          event: {
            select: {
              id: true,
              status: true,
              archivedAt: true,
            },
          },
        },
      })
    : null;

  const redeemable =
    invite !== null &&
    canRedeemInvite({
      eventStatus: invite.event.status,
      archivedAt: invite.event.archivedAt,
    });
  if (!invite || !redeemable) {
    // The attempted code is never stored; only who tried and, if known, which invite.
    await prisma.auditEvent.create({
      data: {
        actorUserId: userId,
        entity: "EventInvite",
        entityId: invite?.id ?? "unknown",
        action: "redeem_failed",
      },
    });
    return { ok: false };
  }

  const { event } = invite;
  return prisma.$transaction(async (tx) => {
    const participant = await tx.eventParticipant.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } },
    });
    if (participant) {
      return { ok: true, eventId: event.id, alreadyParticipant: true };
    }
    await tx.eventParticipant.create({
      data: {
        eventId: event.id,
        userId,
        role: "PLAYER",
        responseStatus: "INVITED",
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: userId,
        entity: "EventInvite",
        entityId: invite.id,
        action: "redeemed",
        detail: { eventId: event.id },
      },
    });
    return { ok: true, eventId: event.id, alreadyParticipant: false };
  });
}
