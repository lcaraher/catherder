import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Handlers read and write cookies through next/headers; outside a Next
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

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("account theme against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    saveTheme: typeof import("@/app/api/me/theme/route").POST;
    logout: typeof import("@/app/logout/route").GET;
    rootLayout: typeof import("@/app/layout").default;
  };
  let m: Modules;
  let jwksServer: http.Server;

  let userId: string;
  let originalTheme: string;
  let startedAt: Date;

  // themeCookie is what a signed-out visitor chose before signing in.
  async function loginAs(id: string, themeCookie?: string): Promise<void> {
    cookieJar.clear();
    if (themeCookie) cookieJar.set("catherder_theme", themeCookie);
    const form = new FormData();
    form.set("userId", id);
    const response = await m.login(
      new Request("http://localhost/api/dev-auth/login", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(303);
    expect(cookieJar.has("catherder_session")).toBe(true);
  }

  const postTheme = (theme: string) =>
    m.saveTheme(
      new Request("http://localhost/api/me/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme }),
      }),
    );

  // The data-theme the root layout puts on <html> for the current cookies.
  const renderedTheme = async () => {
    const html = await m.rootLayout({
      children: null,
      params: Promise.resolve({}),
    });
    return (html.props as { "data-theme": string })["data-theme"];
  };

  const storedTheme = async () =>
    (await m.prisma.user.findUniqueOrThrow({ where: { id: userId } })).theme;

  const auditRows = () =>
    m.prisma.auditEvent.findMany({
      where: {
        entity: "User",
        entityId: userId,
        action: "theme_changed",
        at: { gte: startedAt },
      },
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

    m = {
      prisma: (await import("@/adapters/db/client")).prisma,
      login: (await import("@/app/api/dev-auth/login/route")).POST,
      saveTheme: (await import("@/app/api/me/theme/route")).POST,
      logout: (await import("@/app/logout/route")).GET,
      rootLayout: (await import("@/app/layout")).default,
    };

    // A seeded user; the theme starts from "light" and is restored in afterAll.
    const user = await m.prisma.user.findUniqueOrThrow({
      where: { email: "player3@example.com" },
    });
    userId = user.id;
    originalTheme = user.theme;
    startedAt = new Date();
    await m.prisma.user.update({
      where: { id: userId },
      data: { theme: "light" },
    });
  });

  afterAll(async () => {
    if (userId) {
      await m.prisma.$transaction([
        m.prisma.auditEvent.deleteMany({
          where: {
            entity: "User",
            entityId: userId,
            action: "theme_changed",
            at: { gte: startedAt },
          },
        }),
        m.prisma.user.update({
          where: { id: userId },
          data: { theme: originalTheme },
        }),
      ]);
    }
    await m?.prisma.$disconnect();
    await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
  });

  it("signing in sets the theme cookie to the account's theme", async () => {
    await loginAs(userId);
    expect(cookieJar.get("catherder_theme")).toBe("light");
  });

  it("saving a theme updates the row, the audit trail and the cookie", async () => {
    const response = await postTheme("dark");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(await storedTheme()).toBe("dark");
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(userId);
    // The audit row never holds the chosen value.
    expect(rows[0].detail).toBeNull();
    expect(cookieJar.get("catherder_theme")).toBe("dark");
  });

  it("refuses an unknown theme and changes nothing", async () => {
    const response = await postTheme("auto");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "theme must be one of: light, dark",
    });

    expect(await storedTheme()).toBe("dark");
    expect(await auditRows()).toHaveLength(1);
    expect(cookieJar.get("catherder_theme")).toBe("dark");
  });

  it("signing in with no cookie mirrors the account and leaves it unchanged", async () => {
    await loginAs(userId);
    expect(cookieJar.get("catherder_theme")).toBe("dark");
    expect(await storedTheme()).toBe("dark");
    expect(await auditRows()).toHaveLength(1);
  });

  it("a signed-out save sets the cookie only", async () => {
    cookieJar.clear();
    const response = await postTheme("light");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(cookieJar.get("catherder_theme")).toBe("light");
    expect(cookieJar.has("catherder_session")).toBe(false);
    expect(await storedTheme()).toBe("dark");
    expect(await auditRows()).toHaveLength(1);
  });

  it("signing in adopts a theme chosen while signed out", async () => {
    await m.prisma.user.update({
      where: { id: userId },
      data: { theme: "light" },
    });
    await loginAs(userId, "dark");

    expect(await storedTheme()).toBe("dark");
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.actorUserId === userId)).toBe(true);
    expect(rows.every((row) => row.detail === null)).toBe(true);
    expect(cookieJar.get("catherder_theme")).toBe("dark");
  });

  it("signing in ignores an unknown cookie value", async () => {
    await loginAs(userId, "auto");
    expect(await storedTheme()).toBe("dark");
    expect(await auditRows()).toHaveLength(2);
    expect(cookieJar.get("catherder_theme")).toBe("dark");
  });

  it("logging out drops the theme cookie and pages return to the default", async () => {
    await loginAs(userId);
    expect(cookieJar.get("catherder_theme")).toBe("dark");
    expect(await renderedTheme()).toBe("dark");

    const response = await m.logout();
    expect(response.status).toBe(303);
    expect(cookieJar.has("catherder_session")).toBe(false);
    expect(cookieJar.has("catherder_theme")).toBe(false);
    expect(await renderedTheme()).toBe("light");
    // The account keeps its theme; only the browser forgets it.
    expect(await storedTheme()).toBe("dark");
  });

  it("a signed-out flip after logout is adopted at the next sign-in", async () => {
    await m.prisma.user.update({
      where: { id: userId },
      data: { theme: "light" },
    });
    const before = (await auditRows()).length;

    const response = await postTheme("dark");
    expect(response.status).toBe(200);
    expect(await renderedTheme()).toBe("dark");
    expect(await storedTheme()).toBe("light");

    await loginAs(userId, cookieJar.get("catherder_theme"));
    expect(await storedTheme()).toBe("dark");
    expect(await auditRows()).toHaveLength(before + 1);
    expect(cookieJar.get("catherder_theme")).toBe("dark");
  });
});
