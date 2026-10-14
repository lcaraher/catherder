import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
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
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!hasDatabase)("event pictures against PostgreSQL", () => {
  type Actions = typeof import("@/app/e/[eventId]/manage/image-actions");
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    requestImageUpload: Actions["requestImageUpload"];
    imageStatus: Actions["imageStatus"];
    updateEventDescription: typeof import("@/app/e/[eventId]/manage/actions").updateEventDescription;
    localUpload: typeof import("@/app/api/images/local-upload/route").POST;
    picture: typeof import("@/app/e/[eventId]/images/[imageId]/route").GET;
    getImageStorage: typeof import("@/adapters/images/storage").getImageStorage;
    refusalMessage: typeof import("@/domain/images").refusalMessage;
    MAX_IMAGE_BYTES: number;
  };
  let m: Modules;
  let jwksServer: http.Server;
  let imagesDir: string;
  const users: Record<"organizer" | "player" | "stranger" | "admin" | "former", string> = {
    organizer: "",
    player: "",
    stranger: "",
    admin: "",
    former: "",
  };
  const userIds = () => Object.values(users).filter(Boolean);

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
      where: { organizerUserId: { in: userIds() } },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    await m.prisma.$transaction([
      m.prisma.eventImage.deleteMany({
        where: { OR: [{ eventId: { in: eventIds } }, { uploaderUserId: { in: userIds() } }] },
      }),
      m.prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds() } } }),
      m.prisma.eventParticipant.deleteMany({ where: { eventId: { in: eventIds } } }),
      m.prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
    ]);
  }

  // An open event run by the organizer, with the player taking part.
  async function newEvent(): Promise<string> {
    const event = await m.prisma.event.create({
      data: {
        name: "Picture event",
        mode: "SINGLE_ACTIVITY",
        organizerUserId: users.organizer,
        organizerParticipates: false,
        status: "OPEN",
        requiredSlots: 2,
        participants: {
          create: [
            { userId: users.organizer, role: "ORGANIZER", responseStatus: "INVITED" },
            { userId: users.player, role: "PLAYER", responseStatus: "INVITED" },
          ],
        },
      },
    });
    return event.id;
  }

  async function png(): Promise<Buffer> {
    return sharp({ create: { width: 60, height: 40, channels: 3, background: "#336699" } })
      .png()
      .toBuffer();
  }

  // Posts a file through the local stand-in's form, as the editor will.
  async function postUpload(fields: Record<string, string>, bytes: Buffer, type: string) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    form.set("file", new File([new Uint8Array(bytes)], "picture", { type }));
    return m.localUpload(
      new Request("http://localhost/api/images/local-upload", { method: "POST", body: form }),
    );
  }

  // Requests a picture as the signed-in manager and uploads a real one; returns its id.
  async function readyPicture(eventId: string): Promise<string> {
    const result = await m.requestImageUpload({ eventId, contentType: "image/png", size: 1000 });
    if (!result.ok) throw new Error(result.message);
    expect((await postUpload(result.upload.fields, await png(), "image/png")).status).toBe(204);
    return result.imageId;
  }

  function getPicture(eventId: string, imageId: string) {
    return m.picture(new Request(`http://localhost/e/${eventId}/images/${imageId}`), {
      params: Promise.resolve({ eventId, imageId }),
    });
  }

  function description(eventId: string, text: string): FormData {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("description", text);
    return form;
  }

  const fileFor = (eventId: string, imageId: string) =>
    path.join(imagesDir, "images", eventId, `${imageId}.webp`);

  async function exists(file: string): Promise<boolean> {
    return stat(file).then(
      () => true,
      () => false,
    );
  }

  beforeAll(async () => {
    imagesDir = await mkdtemp(path.join(tmpdir(), "catherder-images-it-"));
    process.env.IMAGES_LOCAL_DIR = imagesDir;
    delete process.env.IMAGES_BUCKET;

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

    const actions = await import("@/app/e/[eventId]/manage/image-actions");
    const domain = await import("@/domain/images");
    m = {
      prisma: (await import("@/adapters/db/client")).prisma,
      login: (await import("@/app/api/dev-auth/login/route")).POST,
      requestImageUpload: actions.requestImageUpload,
      imageStatus: actions.imageStatus,
      updateEventDescription: (await import("@/app/e/[eventId]/manage/actions")).updateEventDescription,
      localUpload: (await import("@/app/api/images/local-upload/route")).POST,
      picture: (await import("@/app/e/[eventId]/images/[imageId]/route")).GET,
      getImageStorage: (await import("@/adapters/images/storage")).getImageStorage,
      refusalMessage: domain.refusalMessage,
      MAX_IMAGE_BYTES: domain.MAX_IMAGE_BYTES,
    };

    for (const role of Object.keys(users) as (keyof typeof users)[]) {
      const user = await m.prisma.user.upsert({
        where: { email: `images-${role}@example.com` },
        update: { siteAdmin: role === "admin" },
        create: {
          email: `images-${role}@example.com`,
          displayName: `Images ${role}`,
          timeZone: "UTC",
          siteAdmin: role === "admin",
        },
      });
      users[role] = user.id;
    }
    await removeRows();
  });

  afterAll(async () => {
    if (users.organizer) {
      await removeRows();
      await m.prisma.externalIdentity.deleteMany({ where: { userId: { in: userIds() } } });
      await m.prisma.user.deleteMany({ where: { id: { in: userIds() } } });
    }
    await m?.prisma.$disconnect();
    await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
    if (imagesDir) await rm(imagesDir, { recursive: true, force: true });
  });

  describe("requestImageUpload", () => {
    it("gives a manager an upload form and records the picture", async () => {
      const eventId = await newEvent();
      await loginAs(users.organizer);
      const result = await m.requestImageUpload({ eventId, contentType: "image/png", size: 1000 });
      if (!result.ok) throw new Error(result.message);
      expect(result.upload).toEqual({
        url: "/api/images/local-upload",
        fields: { key: `pending/${eventId}/${result.imageId}`, "Content-Type": "image/png" },
      });
      const row = await m.prisma.eventImage.findUniqueOrThrow({ where: { id: result.imageId } });
      expect(row.eventId).toBe(eventId);
      expect(row.uploaderUserId).toBe(users.organizer);
    });

    it("refuses a participant who isn't a manager and a stranger", async () => {
      const eventId = await newEvent();
      for (const userId of [users.player, users.stranger]) {
        await loginAs(userId);
        await expect(
          m.requestImageUpload({ eventId, contentType: "image/png", size: 1000 }),
        ).rejects.toThrow();
      }
      expect(await m.prisma.eventImage.count({ where: { eventId } })).toBe(0);
    });

    it("refuses a wrong type, an empty file and one over 10 MB with their words", async () => {
      const eventId = await newEvent();
      await loginAs(users.organizer);
      expect(await m.requestImageUpload({ eventId, contentType: "image/svg+xml", size: 1000 })).toEqual({
        ok: false,
        message: m.refusalMessage("type"),
      });
      for (const size of [0, m.MAX_IMAGE_BYTES + 1]) {
        expect(await m.requestImageUpload({ eventId, contentType: "image/png", size })).toEqual({
          ok: false,
          message: m.refusalMessage("size"),
        });
      }
      expect(await m.prisma.eventImage.count({ where: { eventId } })).toBe(0);
    });

    it("refuses the 21st picture of an event", async () => {
      const eventId = await newEvent();
      // Recorded under another uploader so the organizer's daily count is untouched.
      await m.prisma.eventImage.createMany({
        data: Array.from({ length: 20 }, () => ({ eventId, uploaderUserId: users.stranger })),
      });
      await loginAs(users.organizer);
      expect(await m.requestImageUpload({ eventId, contentType: "image/png", size: 1000 })).toEqual({
        ok: false,
        message: m.refusalMessage("per-event"),
      });
      expect(await m.prisma.eventImage.count({ where: { eventId } })).toBe(20);
    });

    it("refuses a person's 31st upload in 24 hours, not counting older ones", async () => {
      const [a, b, c] = [await newEvent(), await newEvent(), await newEvent()];
      const recent = (eventId: string, count: number) =>
        Array.from({ length: count }, () => ({ eventId, uploaderUserId: users.admin }));
      await m.prisma.eventImage.createMany({
        data: [
          ...recent(a, 15),
          ...recent(b, 14),
          ...Array.from({ length: 10 }, () => ({
            eventId: b,
            uploaderUserId: users.admin,
            createdAt: new Date(Date.now() - DAY_MS - 60_000),
          })),
        ],
      });
      await loginAs(users.admin);
      const thirtieth = await m.requestImageUpload({ eventId: c, contentType: "image/png", size: 1000 });
      expect(thirtieth.ok).toBe(true);
      expect(await m.requestImageUpload({ eventId: c, contentType: "image/png", size: 1000 })).toEqual({
        ok: false,
        message: m.refusalMessage("per-day"),
      });
    });
  });

  describe("imageStatus", () => {
    it("is pending before the upload and ready, with its address, after it", async () => {
      const eventId = await newEvent();
      await loginAs(users.organizer);
      const result = await m.requestImageUpload({ eventId, contentType: "image/png", size: 1000 });
      if (!result.ok) throw new Error(result.message);
      expect(await m.imageStatus({ eventId, imageId: result.imageId })).toEqual({ state: "pending" });
      expect((await postUpload(result.upload.fields, await png(), "image/png")).status).toBe(204);
      expect(await m.imageStatus({ eventId, imageId: result.imageId })).toEqual({
        state: "ready",
        src: `/e/${eventId}/images/${result.imageId}`,
      });
    });

    it("is refused, with the words, after a file that is not a picture", async () => {
      const eventId = await newEvent();
      await loginAs(users.organizer);
      const result = await m.requestImageUpload({ eventId, contentType: "image/png", size: 100 });
      if (!result.ok) throw new Error(result.message);
      const response = await postUpload(result.upload.fields, Buffer.from("not a picture"), "image/png");
      expect(response.status).toBe(204);
      expect(await m.imageStatus({ eventId, imageId: result.imageId })).toEqual({
        state: "refused",
        message: m.refusalMessage("not-an-image"),
      });
    });

    it("is refused for a picture of another event", async () => {
      const [a, b] = [await newEvent(), await newEvent()];
      await loginAs(users.organizer);
      const imageId = await readyPicture(a);
      expect(await m.imageStatus({ eventId: b, imageId })).toEqual({
        state: "refused",
        message: m.refusalMessage("not-an-image"),
      });
    });
  });

  describe("the local upload route", () => {
    it("refuses a key the person did not request, and a file whose type differs", async () => {
      const eventId = await newEvent();
      await loginAs(users.organizer);
      const result = await m.requestImageUpload({ eventId, contentType: "image/png", size: 1000 });
      if (!result.ok) throw new Error(result.message);
      expect((await postUpload(result.upload.fields, await png(), "image/jpeg")).status).toBe(400);
      await loginAs(users.admin);
      expect((await postUpload(result.upload.fields, await png(), "image/png")).status).toBe(400);
      await loginAs(users.organizer);
      expect(await m.imageStatus({ eventId, imageId: result.imageId })).toEqual({ state: "pending" });
    });
  });

  describe("the picture route", () => {
    it("serves the picture to the organizer, a participant and a site admin", async () => {
      const eventId = await newEvent();
      await loginAs(users.organizer);
      const imageId = await readyPicture(eventId);
      for (const userId of [users.organizer, users.player, users.admin]) {
        await loginAs(userId);
        const response = await getPicture(eventId, imageId);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/webp");
        expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const bytes = Buffer.from(await response.arrayBuffer());
        expect(response.headers.get("content-length")).toBe(String(bytes.length));
        expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      }
    });

    it("answers the same empty 404 to everyone else and for anything missing", async () => {
      const [eventId, other] = [await newEvent(), await newEvent()];
      await loginAs(users.organizer);
      const imageId = await readyPicture(eventId);
      const otherImageId = await readyPicture(other);
      await m.prisma.eventParticipant.create({
        data: { eventId, userId: users.former, role: "PLAYER", responseStatus: "INVITED" },
      });
      await m.prisma.eventParticipant.delete({
        where: { eventId_userId: { eventId, userId: users.former } },
      });

      const answers: Response[] = [];
      for (const userId of [users.stranger, users.former]) {
        await loginAs(userId);
        answers.push(await getPicture(eventId, imageId));
      }
      cookieJar.clear();
      answers.push(await getPicture(eventId, imageId));
      await loginAs(users.organizer);
      answers.push(await getPicture(eventId, "zzzzzzzz"));
      answers.push(await getPicture("nosuchevent", imageId));
      answers.push(await getPicture(eventId, otherImageId));
      for (const response of answers) {
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("");
      }
    });
  });

  describe("removing unused pictures when the description is saved", () => {
    // A picture row of the given age with a stored WebP.
    async function storedPicture(eventId: string, ageMs: number): Promise<string> {
      const row = await m.prisma.eventImage.create({
        data: { eventId, uploaderUserId: users.organizer, createdAt: new Date(Date.now() - ageMs) },
      });
      const storage = m.getImageStorage();
      if (storage.kind !== "local") throw new Error("expected the local stand-in");
      await storage.store.put(`images/${eventId}/${row.id}.webp`, await png(), "image/webp");
      return row.id;
    }

    it("removes an old unused picture and keeps a new one and one still used", async () => {
      const eventId = await newEvent();
      const oldUnused = await storedPicture(eventId, 2 * DAY_MS);
      const newUnused = await storedPicture(eventId, 60_000);
      const oldUsed = await storedPicture(eventId, 2 * DAY_MS);
      await loginAs(users.organizer);
      expect(
        await m.updateEventDescription(description(eventId, `Map: ![map](img:${oldUsed})`)),
      ).toEqual({ ok: true });

      expect(await m.prisma.eventImage.findUnique({ where: { id: oldUnused } })).toBeNull();
      expect(await exists(fileFor(eventId, oldUnused))).toBe(false);
      for (const id of [newUnused, oldUsed]) {
        expect(await m.prisma.eventImage.findUnique({ where: { id } })).not.toBeNull();
        expect(await exists(fileFor(eventId, id))).toBe(true);
      }
    });

    it("keeps the row when its file cannot be removed, and the save still succeeds", async () => {
      const eventId = await newEvent();
      const row = await m.prisma.eventImage.create({
        data: { eventId, uploaderUserId: users.organizer, createdAt: new Date(Date.now() - 2 * DAY_MS) },
      });
      // A folder where the WebP should be makes the removal fail.
      await mkdir(fileFor(eventId, row.id), { recursive: true });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await loginAs(users.organizer);
        expect(await m.updateEventDescription(description(eventId, "No pictures now."))).toEqual({
          ok: true,
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(
          new RegExp(`^image cleanup failed event=${eventId} image=${row.id} error=`),
        );
      } finally {
        warn.mockRestore();
      }
      expect(await m.prisma.eventImage.findUnique({ where: { id: row.id } })).not.toBeNull();
      const saved = await m.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      expect(saved.description).toBe("No pictures now.");
    });
  });
});
