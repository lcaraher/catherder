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
// Server actions revalidate the event and respond pages; there is no page cache here.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("saving an event's descriptions against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    updateEventShortDescription: typeof import("@/app/e/[eventId]/manage/actions").updateEventShortDescription;
    updateEventDescription: typeof import("@/app/e/[eventId]/manage/actions").updateEventDescription;
  };
  let m: Modules;
  let jwksServer: http.Server;
  let organizerId: string;
  let playerId: string;
  let eventId: string;

  const organizerEmail = "short-description-organizer@example.com";
  const playerEmail = "short-description-player@example.com";

  async function loginAs(userId: string): Promise<void> {
    cookieJar.clear();
    const form = new FormData();
    form.set("userId", userId);
    const response = await m.login(
      new Request("http://localhost/api/dev-auth/login", { method: "POST", body: form }),
    );
    expect(response.status).toBe(303);
  }

  async function removeRows(): Promise<void> {
    const events = await m.prisma.event.findMany({
      where: { organizerUserId: { in: [organizerId, playerId].filter(Boolean) } },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    await m.prisma.$transaction([
      m.prisma.auditEvent.deleteMany({ where: { actorUserId: { in: [organizerId, playerId] } } }),
      m.prisma.eventParticipant.deleteMany({ where: { eventId: { in: eventIds } } }),
      m.prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
    ]);
  }

  function shortDescription(text: string): FormData {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("shortDescription", text);
    return form;
  }

  function description(text: string): FormData {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("description", text);
    return form;
  }

  async function stored(): Promise<string | null> {
    const event = await m.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    return event.shortDescription;
  }

  async function storedDescription(): Promise<string | null> {
    const event = await m.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    return event.description;
  }

  beforeAll(async () => {
    const auth = await import("@/adapters/auth");
    jwksServer = http.createServer((_req, res) => {
      auth.getDevJwks().then((jwks) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(jwks));
      });
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    const { port } = jwksServer.address() as AddressInfo;
    process.env.AUTH_JWKS_URL = `http://127.0.0.1:${port}/jwks`;

    m = {
      prisma: (await import("@/adapters/db/client")).prisma,
      login: (await import("@/app/api/dev-auth/login/route")).POST,
      updateEventShortDescription: (await import("@/app/e/[eventId]/manage/actions"))
        .updateEventShortDescription,
      updateEventDescription: (await import("@/app/e/[eventId]/manage/actions"))
        .updateEventDescription,
    };

    const [organizer, player] = await Promise.all([
      m.prisma.user.upsert({
        where: { email: organizerEmail },
        update: {},
        create: { email: organizerEmail, displayName: "Short Organizer", timeZone: "UTC" },
      }),
      m.prisma.user.upsert({
        where: { email: playerEmail },
        update: {},
        create: { email: playerEmail, displayName: "Short Player", timeZone: "UTC" },
      }),
    ]);
    organizerId = organizer.id;
    playerId = player.id;
    await removeRows();
    const event = await m.prisma.event.create({
      data: {
        name: "Short event",
        mode: "SINGLE_ACTIVITY",
        organizerUserId: organizerId,
        organizerParticipates: false,
        status: "OPEN",
        requiredSlots: 2,
        participants: {
          create: [
            { userId: organizerId, role: "ORGANIZER", responseStatus: "INVITED" },
            { userId: playerId, role: "PLAYER", responseStatus: "INVITED" },
          ],
        },
      },
    });
    eventId = event.id;
    await loginAs(organizerId);
  });

  afterAll(async () => {
    if (organizerId) {
      await removeRows();
      await m.prisma.externalIdentity.deleteMany({ where: { userId: { in: [organizerId, playerId] } } });
      await m.prisma.user.deleteMany({ where: { id: { in: [organizerId, playerId] } } });
    }
    await m?.prisma.$disconnect();
    await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
  });

  it("saves the text trimmed", async () => {
    expect(await m.updateEventShortDescription(shortDescription("  **Bring** dice.  \n"))).toEqual({
      ok: true,
    });
    expect(await stored()).toBe("**Bring** dice.");
  });

  it("stores blank text as null", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { shortDescription: "Before" } });
    expect(await m.updateEventShortDescription(shortDescription("   "))).toEqual({ ok: true });
    expect(await stored()).toBeNull();
  });

  it("stores a short description that shows nothing (an empty heading) as null", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { shortDescription: "Before" } });
    expect(await m.updateEventShortDescription(shortDescription("##"))).toEqual({ ok: true });
    expect(await stored()).toBeNull();
  });

  it("saves a short description heading with text as typed", async () => {
    expect(await m.updateEventShortDescription(shortDescription("## A"))).toEqual({ ok: true });
    expect(await stored()).toBe("## A");
  });

  it("stores a full description that shows nothing (an empty heading) as null", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { description: "Before" } });
    expect(await m.updateEventDescription(description("##"))).toEqual({ ok: true });
    expect(await storedDescription()).toBeNull();
  });

  it("saves a full description heading with text as typed", async () => {
    expect(await m.updateEventDescription(description("## A"))).toEqual({ ok: true });
    expect(await storedDescription()).toBe("## A");
  });

  it("saves 400 seen characters with bold and a long link", async () => {
    const link = `[guide](https://example.com/${"a".repeat(300)})`;
    const text = `**${"b".repeat(200)}** ${"c".repeat(194)}${link}`;
    expect(await m.updateEventShortDescription(shortDescription(text))).toEqual({ ok: true });
    expect(await stored()).toBe(text);
  });

  it("refuses 401 seen characters with the message and stores nothing", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { shortDescription: "Before" } });
    const text = `**${"b".repeat(200)}** ${"c".repeat(200)}`;
    expect(await m.updateEventShortDescription(shortDescription(text))).toEqual({
      ok: false,
      message: "The short description is limited to 400 characters.",
      field: "shortDescription",
    });
    expect(await stored()).toBe("Before");
  });

  it("refuses stored text over 2,000 characters", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { shortDescription: "Before" } });
    const text = `[guide](https://example.com/${"a".repeat(2_000)})`;
    expect(await m.updateEventShortDescription(shortDescription(text))).toEqual({
      ok: false,
      message: "The short description's links and formatting make it too long to save.",
      field: "shortDescription",
    });
    expect(await stored()).toBe("Before");
  });

  it("writes an audit row with the previous text", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { shortDescription: "Old text" } });
    expect(await m.updateEventShortDescription(shortDescription("New text"))).toEqual({ ok: true });
    const rows = await m.prisma.auditEvent.findMany({
      where: { entityId: eventId, action: "event_short_description_edited" },
      orderBy: { at: "desc" },
    });
    expect(rows[0].detail).toEqual({ from: "Old text" });
    expect(rows[0].actorUserId).toBe(organizerId);
  });

  it("refuses a non-manager and stores nothing", async () => {
    await m.prisma.event.update({ where: { id: eventId }, data: { shortDescription: "Before" } });
    await loginAs(playerId);
    try {
      await expect(m.updateEventShortDescription(shortDescription("Mine now"))).rejects.toThrow();
    } finally {
      await loginAs(organizerId);
    }
    expect(await stored()).toBe("Before");
  });
});
