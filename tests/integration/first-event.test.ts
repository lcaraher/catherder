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

describe.skipIf(!hasDatabase)("a person's first event against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    createEvent: typeof import("@/app/e/[eventId]/manage/actions").createEvent;
  };
  let m: Modules;
  let jwksServer: http.Server;

  let testerId: string;

  const testerEmail = "first-event@example.com";

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

  // Removes everything the tester owns or touched, in dependency order.
  async function removeTesterRows(): Promise<void> {
    const eventIds = (
      await m.prisma.event.findMany({
        where: { organizerUserId: testerId },
        select: { id: true },
      })
    ).map((e) => e.id);
    await m.prisma.$transaction([
      m.prisma.auditEvent.deleteMany({ where: { actorUserId: testerId } }),
      m.prisma.eventInvite.deleteMany({ where: { eventId: { in: eventIds } } }),
      m.prisma.eventAvailability.deleteMany({
        where: { eventId: { in: eventIds } },
      }),
      m.prisma.eventParticipant.deleteMany({
        where: { eventId: { in: eventIds } },
      }),
      m.prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
    ]);
  }

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

    m = {
      prisma: (await import("@/adapters/db/client")).prisma,
      login: (await import("@/app/api/dev-auth/login/route")).POST,
      createEvent: (await import("@/app/e/[eventId]/manage/actions"))
        .createEvent,
    };

    const tester = await m.prisma.user.upsert({
      where: { email: testerEmail },
      update: {},
      create: {
        email: testerEmail,
        displayName: "First Event Tester",
        timeZone: "UTC",
      },
    });
    testerId = tester.id;
    await removeTesterRows();
  });

  afterAll(async () => {
    if (testerId) {
      await removeTesterRows();
      // The dev login links an identity to the user; it goes before the user.
      await m.prisma.externalIdentity.deleteMany({
        where: { userId: testerId },
      });
      await m.prisma.user.delete({ where: { id: testerId } });
    }
    await m?.prisma.$disconnect();
    await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
  });

  it("creates the event with its Organizer row, audit row and invite, then opens its manage page", async () => {
    await loginAs(testerId);
    const form = new FormData();
    form.set("name", "First event");
    form.set("mode", "SINGLE_ACTIVITY");
    form.set("targetHours", "2");
    // The action always ends in a redirect; the digest carries the target.
    let digest = "";
    try {
      await m.createEvent(form);
    } catch (error) {
      digest = (error as { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT");

    const events = await m.prisma.event.findMany({
      where: { organizerUserId: testerId },
    });
    expect(events).toHaveLength(1);
    const event = events[0];

    const participants = await m.prisma.eventParticipant.findMany({
      where: { eventId: event.id },
    });
    expect(participants).toHaveLength(1);
    expect(participants[0].userId).toBe(testerId);
    expect(participants[0].role).toBe("ORGANIZER");

    const audit = await m.prisma.auditEvent.findMany({
      where: { entity: "Event", entityId: event.id, action: "create" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(testerId);

    const invite = await m.prisma.eventInvite.findUniqueOrThrow({
      where: { eventId: event.id },
    });
    expect(invite.createdByUserId).toBe(testerId);
    expect(invite.code).toHaveLength(10);

    expect(digest).toContain(`/e/${event.id}/manage`);
  });
});
