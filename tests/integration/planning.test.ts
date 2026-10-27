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
// Server actions revalidate the responses and manage pages; there is no page cache here.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("saving an event's planning settings and shared times against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    savePlanningSettings: typeof import("@/app/e/[eventId]/responses/planning-actions").savePlanningSettings;
    shareTimes: typeof import("@/app/e/[eventId]/responses/planning-actions").shareTimes;
  };
  let m: Modules;
  let jwksServer: http.Server;
  let organizerId: string;
  let playerId: string;
  let eventId: string;
  let groupEventId: string;

  const organizerEmail = "planning-organizer@example.com";
  const playerEmail = "planning-player@example.com";
  const organizerZone = "Europe/Warsaw";
  const SEEDED = {
    requiredSlots: 6,
    planningMinPeople: 2,
    planningOrganizerMustAttend: false,
    planningNearlySlots: null,
  };

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
      m.prisma.eventSharedTime.deleteMany({ where: { eventId: { in: eventIds } } }),
      m.prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
    ]);
  }

  function settings(fields: Record<string, string>): FormData {
    const form = new FormData();
    form.set("eventId", eventId);
    for (const [name, value] of Object.entries({
      lengthSlots: "6",
      minPeople: "2",
      nearlySlots: "",
      ...fields,
    })) {
      form.set(name, value);
    }
    return form;
  }

  async function stored() {
    return m.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        requiredSlots: true,
        planningMinPeople: true,
        planningOrganizerMustAttend: true,
        planningNearlySlots: true,
      },
    });
  }

  async function auditRows() {
    return m.prisma.auditEvent.findMany({
      where: { entityId: eventId, action: "planning_settings_changed" },
      orderBy: { at: "desc" },
    });
  }

  async function resetSettings(): Promise<void> {
    await m.prisma.event.update({ where: { id: eventId }, data: SEEDED });
    await m.prisma.eventSharedTime.deleteMany({ where: { eventId: { in: [eventId, groupEventId] } } });
    await m.prisma.auditEvent.deleteMany({ where: { entityId: { in: [eventId, groupEventId] } } });
  }

  function share(starts: string, id = eventId): FormData {
    const form = new FormData();
    form.set("eventId", id);
    form.set("starts", starts);
    // Neither is read: zone and length come from the user and the event.
    form.set("timeZone", "UTC");
    form.set("lengthSlots", "2");
    return form;
  }

  async function sharedTimes(id = eventId) {
    return m.prisma.eventSharedTime.findMany({
      where: { eventId: id },
      select: { startSlot: true, timeZone: true, lengthSlots: true },
      orderBy: { startSlot: "asc" },
    });
  }

  async function shareAuditRows(id = eventId) {
    return m.prisma.auditEvent.findMany({
      where: { entityId: id, action: "shared_times_changed" },
      orderBy: { at: "desc" },
    });
  }

  const shared = (...startSlots: number[]) =>
    startSlots.map((startSlot) => ({ startSlot, timeZone: organizerZone, lengthSlots: 6 }));

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
      savePlanningSettings: (await import("@/app/e/[eventId]/responses/planning-actions"))
        .savePlanningSettings,
      shareTimes: (await import("@/app/e/[eventId]/responses/planning-actions")).shareTimes,
    };

    const [organizer, player] = await Promise.all([
      m.prisma.user.upsert({
        where: { email: organizerEmail },
        update: { timeZone: organizerZone },
        create: { email: organizerEmail, displayName: "Planning Organizer", timeZone: organizerZone },
      }),
      m.prisma.user.upsert({
        where: { email: playerEmail },
        update: {},
        create: { email: playerEmail, displayName: "Planning Player", timeZone: "UTC" },
      }),
    ]);
    organizerId = organizer.id;
    playerId = player.id;
    await removeRows();
    const event = await m.prisma.event.create({
      data: {
        name: "Planning event",
        mode: "SINGLE_ACTIVITY",
        organizerUserId: organizerId,
        organizerParticipates: false,
        status: "OPEN",
        requiredSlots: 6,
        participants: {
          create: [
            { userId: organizerId, role: "ORGANIZER", responseStatus: "INVITED" },
            { userId: playerId, role: "PLAYER", responseStatus: "INVITED" },
          ],
        },
      },
    });
    eventId = event.id;
    const groupEvent = await m.prisma.event.create({
      data: {
        name: "Planning group event",
        mode: "MULTI_GROUP",
        organizerUserId: organizerId,
        status: "OPEN",
        requiredSlots: 6,
        participants: {
          create: [{ userId: organizerId, role: "ORGANIZER", responseStatus: "INVITED" }],
        },
      },
    });
    groupEventId = groupEvent.id;
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

  it("saves all four settings and writes an audit row with from and to", async () => {
    await resetSettings();
    const result = await m.savePlanningSettings(
      settings({ lengthSlots: "5", minPeople: "3", organizerMustAttend: "on", nearlySlots: "2" }),
    );
    expect(result).toEqual({ ok: true });
    const after = {
      requiredSlots: 5,
      planningMinPeople: 3,
      planningOrganizerMustAttend: true,
      planningNearlySlots: 2,
    };
    expect(await stored()).toEqual(after);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].entity).toBe("Event");
    expect(rows[0].actorUserId).toBe(organizerId);
    expect(rows[0].detail).toEqual({ from: SEEDED, to: after });
  });

  it("writes no audit row for an unchanged save", async () => {
    await resetSettings();
    expect(await m.savePlanningSettings(settings({}))).toEqual({ ok: true });
    expect(await stored()).toEqual(SEEDED);
    expect(await auditRows()).toHaveLength(0);
  });

  const WINDOW_MESSAGE = "Choose a window shorter than the session.";
  const refusals: [string, Record<string, string>, string, string][] = [
    ["a length of 0", { lengthSlots: "0" }, "Choose a session length.", "lengthSlots"],
    ["a length of 17", { lengthSlots: "17" }, "Choose a session length.", "lengthSlots"],
    ["a fractional length", { lengthSlots: "2.5" }, "Choose a session length.", "lengthSlots"],
    ["a minimum of 1", { minPeople: "1" }, "Choose how many people.", "minPeople"],
    ["a minimum of 201", { minPeople: "201" }, "Choose how many people.", "minPeople"],
    ["a minimum that is not a number", { minPeople: "two" }, "Choose how many people.", "minPeople"],
    ["a window of 0", { nearlySlots: "0" }, WINDOW_MESSAGE, "nearlySlots"],
    ["a window of 7", { lengthSlots: "16", nearlySlots: "7" }, WINDOW_MESSAGE, "nearlySlots"],
    ["a window equal to the length", { lengthSlots: "3", nearlySlots: "3" }, WINDOW_MESSAGE, "nearlySlots"],
  ];
  for (const [name, fields, message, field] of refusals) {
    it(`refuses ${name} with its message and field and stores nothing`, async () => {
      await resetSettings();
      expect(
        await m.savePlanningSettings(
          settings({ organizerMustAttend: "on", nearlySlots: "1", ...fields }),
        ),
      ).toEqual({ ok: false, message, field });
      expect(await stored()).toEqual(SEEDED);
      expect(await auditRows()).toHaveLength(0);
    });
  }

  it("refuses a participant who is not a manager and stores nothing", async () => {
    await resetSettings();
    await loginAs(playerId);
    try {
      await expect(m.savePlanningSettings(settings({ lengthSlots: "4" }))).rejects.toThrow();
    } finally {
      await loginAs(organizerId);
    }
    expect(await stored()).toEqual(SEEDED);
    expect(await auditRows()).toHaveLength(0);
  });

  it("shares exactly the starts with the user's zone and the event's length, and audits from and to", async () => {
    await resetSettings();
    expect(await m.shareTimes(share("335,0,183"))).toEqual({ ok: true });
    expect(await sharedTimes()).toEqual(shared(0, 183, 335));
    const rows = await shareAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].entity).toBe("Event");
    expect(rows[0].actorUserId).toBe(organizerId);
    expect(rows[0].detail).toEqual({ from: [], to: shared(0, 183, 335) });
  });

  it("replaces the shared times when sharing again", async () => {
    await resetSettings();
    await m.shareTimes(share("278,183"));
    expect(await m.shareTimes(share("230"))).toEqual({ ok: true });
    expect(await sharedTimes()).toEqual(shared(230));
    const rows = await shareAuditRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.detail)).toContainEqual({
      from: shared(183, 278),
      to: shared(230),
    });
  });

  it("stops sharing when the list is empty", async () => {
    await resetSettings();
    await m.shareTimes(share("278"));
    expect(await m.shareTimes(share(""))).toEqual({ ok: true });
    expect(await sharedTimes()).toEqual([]);
    expect((await shareAuditRows()).map((row) => row.detail)).toContainEqual({
      from: shared(278),
      to: [],
    });
  });

  it("writes no audit row for an unchanged share", async () => {
    await resetSettings();
    await m.shareTimes(share("278,183"));
    expect(await m.shareTimes(share(" 183, 278 "))).toEqual({ ok: true });
    expect(await sharedTimes()).toEqual(shared(183, 278));
    expect(await shareAuditRows()).toHaveLength(1);
  });

  it("refuses sharing on a group event and stores nothing", async () => {
    await resetSettings();
    expect(await m.shareTimes(share("278", groupEventId))).toEqual({
      ok: false,
      message: "Sharing times is for single-activity events.",
      field: "starts",
    });
    expect(await sharedTimes(groupEventId)).toEqual([]);
    expect(await shareAuditRows(groupEventId)).toHaveLength(0);
  });

  const shareRefusals: [string, string][] = [
    ["a start past Sunday 23:30", "278,336"],
    ["a negative start", "-1"],
    ["a repeated start", "183,278,183"],
    ["more than 20 starts", Array.from({ length: 21 }, (_, i) => String(i * 2)).join(",")],
    ["a start that is not a number", "278,Saturday"],
    ["a fractional start", "1.5"],
    ["an empty entry", "183,,278"],
  ];
  for (const [name, starts] of shareRefusals) {
    it(`refuses ${name} with its message and stores nothing`, async () => {
      await resetSettings();
      expect(await m.shareTimes(share(starts))).toEqual({
        ok: false,
        message: "Choose the times to share.",
        field: "starts",
      });
      expect(await sharedTimes()).toEqual([]);
      expect(await shareAuditRows()).toHaveLength(0);
    });
  }

  it("refuses sharing by a participant who is not a manager and stores nothing", async () => {
    await resetSettings();
    await loginAs(playerId);
    try {
      await expect(m.shareTimes(share("278"))).rejects.toThrow();
    } finally {
      await loginAs(organizerId);
    }
    expect(await sharedTimes()).toEqual([]);
    expect(await shareAuditRows()).toHaveLength(0);
  });

  it("leaves the shared times as they were when planning settings are saved", async () => {
    await resetSettings();
    await m.shareTimes(share("278,183"));
    expect(await m.savePlanningSettings(settings({ lengthSlots: "4" }))).toEqual({ ok: true });
    expect((await stored()).requiredSlots).toBe(4);
    expect(await sharedTimes()).toEqual(shared(183, 278));
    expect(await shareAuditRows()).toHaveLength(1);
  });
});
