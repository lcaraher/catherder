import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Pages and actions read the session through next/headers; outside a Next
// request there is no cookie jar, so one is provided here.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));
// Server actions revalidate the event page; there is no page cache here.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("invite redemption against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    redeemInvite: typeof import("@/adapters/db/invites").redeemInvite;
    regenerateInvite: typeof import("@/app/w/[workspaceId]/events/actions").regenerateInvite;
    joinCodePage: typeof import("@/app/join/[code]/page").default;
    formatInviteCode: typeof import("@/domain/invites").formatInviteCode;
    generateInviteCode: typeof import("@/domain/invites").generateInviteCode;
  };
  let m: Modules;
  let jwksServer: http.Server;

  let organizerId: string;
  let joinerId: string;
  let secondJoinerId: string;
  let thirdJoinerId: string;
  let workspaceId: string;
  let eventId: string;
  let inviteId: string;
  let firstCode: string;

  const eventName = "Integration invite event";
  const joinerEmail = "integration-joiner@example.com";

  async function loginAs(userId: string): Promise<void> {
    cookieJar.clear();
    const form = new FormData();
    form.set("userId", userId);
    const response = await m.login(
      new Request("http://localhost/api/dev-auth/login", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(303);
    expect(cookieJar.has("catherder_session")).toBe(true);
  }

  const currentCode = async () =>
    (await m.prisma.eventInvite.findUniqueOrThrow({ where: { id: inviteId } }))
      .code;

  const auditRows = (action: string, actorUserId: string) =>
    m.prisma.auditEvent.findMany({
      where: { entity: "EventInvite", action, actorUserId },
      orderBy: { at: "asc" },
    });

  beforeAll(async () => {
    const auth = await import("@/adapters/auth");
    jwksServer = http.createServer((_req, res) => {
      auth.getDevJwks().then((jwks) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(jwks));
      });
    });
    await new Promise<void>((resolve) =>
      jwksServer.listen(0, "127.0.0.1", resolve),
    );
    const { port } = jwksServer.address() as AddressInfo;
    process.env.AUTH_JWKS_URL = `http://127.0.0.1:${port}/jwks`;

    const invites = await import("@/domain/invites");
    m = {
      prisma: (await import("@/adapters/db/client")).prisma,
      login: (await import("@/app/api/dev-auth/login/route")).POST,
      redeemInvite: (await import("@/adapters/db/invites")).redeemInvite,
      regenerateInvite: (
        await import("@/app/w/[workspaceId]/events/actions")
      ).regenerateInvite,
      joinCodePage: (await import("@/app/join/[code]/page")).default,
      formatInviteCode: invites.formatInviteCode,
      generateInviteCode: invites.generateInviteCode,
    };

    // The organizer and workspace are seeded; the joiner is created here so
    // membership creation is exercised, and removed again in afterAll.
    const organizer = await m.prisma.user.findUniqueOrThrow({
      where: { email: "organizer@example.com" },
    });
    organizerId = organizer.id;
    const workspace = await m.prisma.workspace.findFirstOrThrow({
      where: { name: "Seed Workspace", ownerUserId: organizerId },
    });
    workspaceId = workspace.id;
    const joiner = await m.prisma.user.upsert({
      where: { email: joinerEmail },
      update: {},
      create: {
        email: joinerEmail,
        displayName: "Integration Joiner",
        timeZone: "UTC",
      },
    });
    joinerId = joiner.id;
    await m.prisma.workspaceMember.deleteMany({
      where: { workspaceId, userId: joinerId },
    });
    secondJoinerId = (
      await m.prisma.user.findUniqueOrThrow({
        where: { email: "player2@example.com" },
      })
    ).id;
    thirdJoinerId = (
      await m.prisma.user.findUniqueOrThrow({
        where: { email: "player3@example.com" },
      })
    ).id;

    firstCode = m.generateInviteCode();
    const event = await m.prisma.event.create({
      data: {
        workspaceId,
        name: eventName,
        mode: "SINGLE_ACTIVITY",
        organizerUserId: organizerId,
        organizerParticipates: false,
        requiredSlots: 4,
        status: "OPEN",
        participants: {
          create: [
            {
              userId: organizerId,
              role: "ORGANIZER",
              responseStatus: "INVITED",
            },
          ],
        },
        invite: {
          create: { code: firstCode, createdByUserId: organizerId },
        },
      },
      include: { invite: true },
    });
    eventId = event.id;
    inviteId = event.invite!.id;
  });

  afterAll(async () => {
    if (eventId) {
      await m.prisma.$transaction([
        m.prisma.auditEvent.deleteMany({
          where: {
            entity: "EventInvite",
            OR: [
              { entityId: inviteId },
              {
                entityId: "unknown",
                actorUserId: { in: [joinerId, secondJoinerId, thirdJoinerId] },
              },
            ],
          },
        }),
        m.prisma.eventInvite.deleteMany({ where: { eventId } }),
        m.prisma.eventParticipant.deleteMany({ where: { eventId } }),
        m.prisma.event.delete({ where: { id: eventId } }),
      ]);
    }
    if (joinerId) {
      await m.prisma.workspaceMember.deleteMany({ where: { userId: joinerId } });
      await m.prisma.user.delete({ where: { id: joinerId } });
    }
    await m?.prisma.$disconnect();
    await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
  });

  it("sends a signed-out visitor to login with a same-origin next path", async () => {
    cookieJar.clear();
    const display = m.formatInviteCode(firstCode);
    let digest = "";
    try {
      await m.joinCodePage({ params: Promise.resolve({ code: display }) });
    } catch (error) {
      digest = (error as { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain(
      `/login?next=${encodeURIComponent(`/join/${display}`)}`,
    );
  });

  it("joins the workspace and the event and records the redemption", async () => {
    // Typed lower-case with hyphen and spaces: normalization is part of the path.
    const typed = ` ${m.formatInviteCode(firstCode).toLowerCase()} `;
    const result = await m.redeemInvite({ userId: joinerId, rawCode: typed });
    expect(result).toEqual({ ok: true, eventId, alreadyParticipant: false });

    const membership = await m.prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId, userId: joinerId } },
    });
    expect(membership.role).toBe("PARTICIPANT");

    const participant = await m.prisma.eventParticipant.findUniqueOrThrow({
      where: { eventId_userId: { eventId, userId: joinerId } },
    });
    expect(participant.role).toBe("PLAYER");
    expect(participant.responseStatus).toBe("INVITED");

    const redeemed = await auditRows("redeemed", joinerId);
    expect(redeemed).toHaveLength(1);
    expect(redeemed[0].entityId).toBe(inviteId);
    expect(JSON.stringify(redeemed[0].detail)).not.toContain(firstCode);
  });

  it("redeeming again changes nothing and reports the existing participation", async () => {
    const result = await m.redeemInvite({
      userId: joinerId,
      rawCode: firstCode,
    });
    expect(result).toEqual({ ok: true, eventId, alreadyParticipant: true });
    expect(await auditRows("redeemed", joinerId)).toHaveLength(1);
  });

  it("after regeneration the old code fails and the new code works", async () => {
    await loginAs(organizerId);
    const form = new FormData();
    form.set("eventId", eventId);
    await m.regenerateInvite(form);

    const invite = await m.prisma.eventInvite.findUniqueOrThrow({
      where: { id: inviteId },
    });
    expect(invite.code).not.toBe(firstCode);
    expect(invite.code).toHaveLength(10);
    expect(invite.regeneratedAt).not.toBeNull();
    const regenerated = await m.prisma.auditEvent.findMany({
      where: { entity: "EventInvite", entityId: inviteId, action: "regenerated" },
    });
    expect(regenerated).toHaveLength(1);
    expect(regenerated[0].actorUserId).toBe(organizerId);

    const stale = await m.redeemInvite({
      userId: secondJoinerId,
      rawCode: firstCode,
    });
    expect(stale).toEqual({ ok: false });
    expect(
      await m.prisma.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId: secondJoinerId } },
      }),
    ).toBeNull();
    const failed = await auditRows("redeem_failed", secondJoinerId);
    expect(failed).toHaveLength(1);
    expect(failed[0].entityId).toBe("unknown");
    expect(failed[0].detail).toBeNull();

    const fresh = await m.redeemInvite({
      userId: secondJoinerId,
      rawCode: invite.code,
    });
    expect(fresh).toEqual({ ok: true, eventId, alreadyParticipant: false });
  });

  it("refuses a code while the event is CLOSED and accepts it again once reopened", async () => {
    const code = await currentCode();
    await m.prisma.event.update({
      where: { id: eventId },
      data: { status: "CLOSED" },
    });

    const closed = await m.redeemInvite({ userId: thirdJoinerId, rawCode: code });
    expect(closed).toEqual({ ok: false });
    expect(
      await m.prisma.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId: thirdJoinerId } },
      }),
    ).toBeNull();
    const failed = await auditRows("redeem_failed", thirdJoinerId);
    expect(failed).toHaveLength(1);
    // A known invite is recorded by id; the code itself is never written.
    expect(failed[0].entityId).toBe(inviteId);
    expect(failed[0].detail).toBeNull();

    await m.prisma.event.update({
      where: { id: eventId },
      data: { status: "OPEN" },
    });
    const reopened = await m.redeemInvite({
      userId: thirdJoinerId,
      rawCode: code,
    });
    expect(reopened).toEqual({ ok: true, eventId, alreadyParticipant: false });
    expect(await currentCode()).toBe(code);
  });
});
