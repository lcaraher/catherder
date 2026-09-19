import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Route handlers read the session through next/headers; outside a Next
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

describe.skipIf(!hasDatabase)("respond routes against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    dbTimeToSlot: typeof import("@/domain/availability").dbTimeToSlot;
    getDevJwks: typeof import("@/adapters/auth").getDevJwks;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    respond: typeof import("@/app/api/events/[eventId]/respond/route").POST;
    organizerAvailability: typeof import("@/app/api/events/[eventId]/organizer-availability/route").PUT;
  };
  let m: Modules;
  let jwksServer: http.Server;

  let organizerId: string;
  let playerId: string;
  let eventId: string;
  let choiceQuestionId: string;
  let textQuestionId: string;
  let optionAId: string;

  const eventName = "Integration test event";
  const choicePrompt = "Integration: pick one";
  const textPrompt = "Integration: any notes";

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

  function respondRequest(body: unknown): Request {
    return new Request(`http://localhost/api/events/${eventId}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const params = () => ({ params: Promise.resolve({ eventId }) });

  const ranges = [
    { weekday: 2, startSlot: 36, endSlot: 44, status: "AVAILABLE" },
    { weekday: 5, startSlot: 28, endSlot: 34, status: "TENTATIVE" },
  ];

  function answers(overrides: {
    choice?: Partial<{ optionIds: string[]; otherText: string }>;
    text?: string;
  }) {
    return [
      {
        questionId: choiceQuestionId,
        optionIds: overrides.choice?.optionIds ?? [],
        text: "",
        otherText: overrides.choice?.otherText ?? "",
        ranks: [],
      },
      {
        questionId: textQuestionId,
        optionIds: [],
        text: overrides.text ?? "",
        otherText: "",
        ranks: [],
      },
    ];
  }

  beforeAll(async () => {
    // The dev issuer's JWKS is served locally so token verification takes
    // the real remote-JWKS path.
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
      dbTimeToSlot: (await import("@/domain/availability")).dbTimeToSlot,
      getDevJwks: auth.getDevJwks,
      login: (await import("@/app/api/dev-auth/login/route")).POST,
      respond: (await import("@/app/api/events/[eventId]/respond/route")).POST,
      organizerAvailability: (
        await import("@/app/api/events/[eventId]/organizer-availability/route")
      ).PUT,
    };

    // Fixtures hang off the seeded users; the event itself is
    // created here and removed in afterAll so the seed data is left as is.
    const organizer = await m.prisma.user.findUniqueOrThrow({
      where: { email: "organizer@example.com" },
    });
    const player = await m.prisma.user.findUniqueOrThrow({
      where: { email: "player1@example.com" },
    });
    organizerId = organizer.id;
    playerId = player.id;

    const event = await m.prisma.event.create({
      data: {
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
            { userId: playerId, role: "PLAYER", responseStatus: "INVITED" },
          ],
        },
        questions: {
          create: [
            {
              type: "SINGLE_CHOICE",
              prompt: choicePrompt,
              version: 1,
              displayOrder: 0,
              required: true,
              allowOther: true,
              options: {
                create: [
                  { label: "Option A", displayOrder: 0 },
                  { label: "Option B", displayOrder: 1 },
                ],
              },
            },
            {
              type: "TEXT",
              prompt: textPrompt,
              version: 1,
              displayOrder: 1,
            },
          ],
        },
      },
      include: { questions: { include: { options: true } } },
    });
    eventId = event.id;
    const choice = event.questions.find((q) => q.type === "SINGLE_CHOICE")!;
    choiceQuestionId = choice.id;
    textQuestionId = event.questions.find((q) => q.type === "TEXT")!.id;
    optionAId = choice.options.find((o) => o.label === "Option A")!.id;
  });

  afterAll(async () => {
    if (eventId) {
      const answerIds = (
        await m.prisma.answer.findMany({
          where: { eventId },
          select: { id: true },
        })
      ).map((a) => a.id);
      await m.prisma.$transaction([
        m.prisma.answerText.deleteMany({
          where: { answerId: { in: answerIds } },
        }),
        m.prisma.answerChoice.deleteMany({
          where: { answerId: { in: answerIds } },
        }),
        m.prisma.answer.deleteMany({ where: { eventId } }),
        m.prisma.questionOption.deleteMany({
          where: { question: { eventId } },
        }),
        m.prisma.question.deleteMany({ where: { eventId } }),
        m.prisma.eventAvailability.deleteMany({ where: { eventId } }),
        m.prisma.eventParticipant.deleteMany({ where: { eventId } }),
        m.prisma.auditEvent.deleteMany({
          where: { entity: "Event", entityId: eventId },
        }),
        m.prisma.event.delete({ where: { id: eventId } }),
      ]);
    }
    await m?.prisma.$disconnect();
    await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
  });

  it("stores a participant's availability and answer, readable afterwards", async () => {
    await loginAs(playerId);
    const response = await m.respond(
      respondRequest({
        ranges,
        answers: answers({
          choice: { optionIds: [optionAId] },
          text: "Bring snacks",
        }),
      }),
      params(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const rows = await m.prisma.eventAvailability.findMany({
      where: { eventId, userId: playerId },
      orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
    });
    expect(
      rows.map((row) => ({
        weekday: row.weekday,
        startSlot: m.dbTimeToSlot(row.startLocal, "start"),
        endSlot: m.dbTimeToSlot(row.endLocal, "end"),
        status: row.status,
      })),
    ).toEqual(ranges);

    const choiceAnswer = await m.prisma.answer.findUniqueOrThrow({
      where: {
        questionId_userId: { questionId: choiceQuestionId, userId: playerId },
      },
      include: { choices: true },
    });
    expect(choiceAnswer.choices.map((c) => c.optionId)).toEqual([optionAId]);
    expect(choiceAnswer.otherText).toBeNull();

    const textAnswer = await m.prisma.answer.findUniqueOrThrow({
      where: {
        questionId_userId: { questionId: textQuestionId, userId: playerId },
      },
      include: { text: true },
    });
    expect(textAnswer.text?.text).toBe("Bring snacks");

    const participant = await m.prisma.eventParticipant.findUniqueOrThrow({
      where: { eventId_userId: { eventId, userId: playerId } },
    });
    expect(participant.responseStatus).toBe("SUBMITTED");
  });

  it("gives a non-participating organizer 404 from the respond route", async () => {
    await loginAs(organizerId);
    const response = await m.respond(
      respondRequest({
        ranges,
        answers: answers({ choice: { optionIds: [optionAId] } }),
      }),
      params(),
    );
    expect(response.status).toBe(404);
  });

  it("gives a participating organizer 403 from organizer-availability", async () => {
    await m.prisma.event.update({
      where: { id: eventId },
      data: { organizerParticipates: true },
    });
    try {
      await loginAs(organizerId);
      const response = await m.organizerAvailability(
        new Request(
          `http://localhost/api/events/${eventId}/organizer-availability`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ranges }),
          },
        ),
        params(),
      );
      expect(response.status).toBe(403);
    } finally {
      await m.prisma.event.update({
        where: { id: eventId },
        data: { organizerParticipates: false },
      });
    }
  });

  it("rejects a missing required answer and names the question", async () => {
    await loginAs(playerId);
    const response = await m.respond(
      respondRequest({ ranges, answers: answers({}) }),
      params(),
    );
    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: string };
    expect(error).toContain("required");
    expect(error).toContain(choicePrompt);
  });

  it("rejects an Other answer over 200 characters and stores one under it", async () => {
    await loginAs(playerId);
    const tooLong = "x".repeat(201);
    const rejected = await m.respond(
      respondRequest({
        ranges,
        answers: answers({ choice: { otherText: tooLong } }),
      }),
      params(),
    );
    expect(rejected.status).toBe(400);
    const { error } = (await rejected.json()) as { error: string };
    expect(error).toContain("200");

    const fine = "y".repeat(200);
    const accepted = await m.respond(
      respondRequest({
        ranges,
        answers: answers({ choice: { otherText: fine } }),
      }),
      params(),
    );
    expect(accepted.status).toBe(200);
    const answer = await m.prisma.answer.findUniqueOrThrow({
      where: {
        questionId_userId: { questionId: choiceQuestionId, userId: playerId },
      },
      include: { choices: true },
    });
    expect(answer.otherText).toBe(fine);
    expect(answer.choices).toEqual([]);
  });
});
