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

describe.skipIf(!hasDatabase)("first event without a workspace against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    createEvent: typeof import("@/app/w/[workspaceId]/events/actions").createEvent;
  };
  let m: Modules;
  let jwksServer: http.Server;

  let testerId: string;
  let testerDisplayName: string;
  let organizerId: string;

  const testerEmail = "first-workspace@example.com";

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

  // The action always ends in a redirect; the digest carries the target.
  async function createWithoutWorkspace(): Promise<string> {
    const form = new FormData();
    form.set("name", "First event");
    form.set("mode", "SINGLE_ACTIVITY");
    form.set("targetHours", "2");
    let digest = "";
    try {
      await m.createEvent(form);
    } catch (error) {
      digest = (error as { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT");
    return digest;
  }

  const ownedWorkspaces = (ownerUserId: string) =>
    m.prisma.workspace.findMany({ where: { ownerUserId } });

  // Removes everything the tester owns or touched, in dependency order.
  async function removeTesterRows(): Promise<void> {
    const workspaceIds = (await ownedWorkspaces(testerId)).map((w) => w.id);
    const eventIds = (
      await m.prisma.event.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true },
      })
    ).map((e) => e.id);
    await m.prisma.$transaction([
      m.prisma.auditEvent.deleteMany({ where: { actorUserId: testerId } }),
      m.prisma.eventInvite.deleteMany({ where: { eventId: { in: eventIds } } }),
      m.prisma.eventParticipant.deleteMany({
        where: { eventId: { in: eventIds } },
      }),
      m.prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
      m.prisma.workspaceMember.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      }),
      m.prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } }),
      m.prisma.workspaceMember.deleteMany({ where: { userId: testerId } }),
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
      createEvent: (await import("@/app/w/[workspaceId]/events/actions"))
        .createEvent,
    };

    const tester = await m.prisma.user.upsert({
      where: { email: testerEmail },
      update: {},
      create: {
        email: testerEmail,
        displayName: "First Workspace Tester",
        timeZone: "UTC",
      },
    });
    testerId = tester.id;
    testerDisplayName = tester.displayName;
    await removeTesterRows();

    organizerId = (
      await m.prisma.user.findUniqueOrThrow({
        where: { email: "organizer@example.com" },
      })
    ).id;
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

  it("creates a workspace named after the person and puts the first event in it", async () => {
    await loginAs(testerId);
    const digest = await createWithoutWorkspace();

    const workspaces = await ownedWorkspaces(testerId);
    expect(workspaces).toHaveLength(1);
    const workspace = workspaces[0];
    expect(workspace.name).toBe(testerDisplayName);

    const membership = await m.prisma.workspaceMember.findUniqueOrThrow({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: testerId },
      },
    });
    expect(membership.role).toBe("OWNER");

    const events = await m.prisma.event.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.organizerUserId).toBe(testerId);

    const audit = await m.prisma.auditEvent.findMany({
      where: { entity: "Workspace", entityId: workspace.id, action: "created" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(testerId);
    expect(audit[0].detail).toEqual({ eventId: event.id });

    expect(digest).toContain(`/w/${workspace.id}/events/${event.id}`);
  });

  it("sends a person who now has a membership back to the form without creating anything", async () => {
    await loginAs(testerId);
    const digest = await createWithoutWorkspace();
    expect(digest).toContain("/events/new");
    expect(digest).not.toContain("error=");
    expect(await ownedWorkspaces(testerId)).toHaveLength(1);
  });

  it("never creates a second workspace for an existing member", async () => {
    await loginAs(organizerId);
    const digest = await createWithoutWorkspace();
    expect(digest).toContain("/events/new");
    expect(digest).not.toContain("error=");
    const owned = await ownedWorkspaces(organizerId);
    expect(owned.map((w) => w.name)).toEqual(["Seed Workspace"]);
  });
});
