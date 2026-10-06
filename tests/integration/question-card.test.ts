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

describe.skipIf(!hasDatabase)("saving a question card against PostgreSQL", () => {
  type Modules = {
    prisma: typeof import("@/adapters/db/client").prisma;
    login: typeof import("@/app/api/dev-auth/login/route").POST;
    saveQuestionCard: typeof import("@/app/e/[eventId]/manage/actions").saveQuestionCard;
    setQuestionAnswersRevealed: typeof import("@/app/e/[eventId]/manage/actions").setQuestionAnswersRevealed;
  };
  let m: Modules;
  let jwksServer: http.Server;
  let organizerId: string;
  let playerId: string;
  let eventId: string;

  const organizerEmail = "question-card-organizer@example.com";
  const playerEmail = "question-card-player@example.com";

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
    const questionIds = (
      await m.prisma.question.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } })
    ).map((q) => q.id);
    const answerIds = (
      await m.prisma.answer.findMany({ where: { questionId: { in: questionIds } }, select: { id: true } })
    ).map((a) => a.id);
    await m.prisma.$transaction([
      m.prisma.auditEvent.deleteMany({ where: { actorUserId: { in: [organizerId, playerId] } } }),
      m.prisma.answerChoice.deleteMany({ where: { answerId: { in: answerIds } } }),
      m.prisma.answerText.deleteMany({ where: { answerId: { in: answerIds } } }),
      m.prisma.answer.deleteMany({ where: { id: { in: answerIds } } }),
      m.prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } }),
      m.prisma.question.deleteMany({ where: { id: { in: questionIds } } }),
      m.prisma.eventParticipant.deleteMany({ where: { eventId: { in: eventIds } } }),
      m.prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
    ]);
  }

  // A choice question with options A and B, and one answer choosing A.
  async function answeredQuestion(type: "SINGLE_CHOICE" | "RANKING" = "SINGLE_CHOICE") {
    const question = await m.prisma.question.create({
      data: {
        eventId,
        type,
        prompt: "Which one?",
        version: 1,
        displayOrder: 0,
        options: {
          create: [
            { label: "A", displayOrder: 0 },
            { label: "B", displayOrder: 1 },
          ],
        },
      },
      include: { options: { orderBy: { displayOrder: "asc" } } },
    });
    await m.prisma.answer.create({
      data: {
        questionId: question.id,
        questionVersion: 1,
        eventId,
        userId: playerId,
        choices: { create: [{ optionId: question.options[0].id, rank: type === "RANKING" ? 1 : null }] },
      },
    });
    return question;
  }

  type Option = { key: string; id?: string; label: string; removed?: boolean };
  function card(
    question: { id: string; prompt: string; required: boolean; allowOther: boolean },
    changes: { prompt?: string; required?: boolean; options: Option[] },
  ): FormData {
    const form = new FormData();
    form.set(
      "card",
      JSON.stringify({
        questionId: question.id,
        prompt: changes.prompt ?? question.prompt,
        required: changes.required ?? question.required,
        allowOther: question.allowOther,
        options: changes.options,
      }),
    );
    return form;
  }

  function visibility(questionId: string, revealed: boolean): FormData {
    const form = new FormData();
    form.set("questionId", questionId);
    form.set("revealed", String(revealed));
    return form;
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
      saveQuestionCard: (await import("@/app/e/[eventId]/manage/actions")).saveQuestionCard,
      setQuestionAnswersRevealed: (await import("@/app/e/[eventId]/manage/actions"))
        .setQuestionAnswersRevealed,
    };

    const [organizer, player] = await Promise.all([
      m.prisma.user.upsert({
        where: { email: organizerEmail },
        update: {},
        create: { email: organizerEmail, displayName: "Card Organizer", timeZone: "UTC" },
      }),
      m.prisma.user.upsert({
        where: { email: playerEmail },
        update: {},
        create: { email: playerEmail, displayName: "Card Player", timeZone: "UTC" },
      }),
    ]);
    organizerId = organizer.id;
    playerId = player.id;
    await removeRows();
    const event = await m.prisma.event.create({
      data: {
        name: "Card event",
        mode: "SINGLE_ACTIVITY",
        organizerUserId: organizerId,
        organizerParticipates: false,
        status: "OPEN",
        requiredSlots: 2,
        participants: {
          create: [
            { userId: organizerId, role: "ORGANIZER", responseStatus: "INVITED" },
            { userId: playerId, role: "PLAYER", responseStatus: "SUBMITTED" },
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

  it("bumps an answered question's version once for a save with several wording changes", async () => {
    const question = await answeredQuestion();
    const [a, b] = question.options;
    const result = await m.saveQuestionCard(
      card(question, {
        prompt: "Which one, really?",
        options: [
          { key: a.id, id: a.id, label: "A" },
          { key: b.id, id: b.id, label: "Bee" },
          { key: "new-1", label: "C" },
        ],
      }),
    );
    expect(result).toEqual({ ok: true });

    const after = await m.prisma.question.findUniqueOrThrow({
      where: { id: question.id },
      include: { options: { orderBy: { displayOrder: "asc" } } },
    });
    expect(after.version).toBe(2);
    expect(after.prompt).toBe("Which one, really?");
    expect(after.options.map((o) => o.label)).toEqual(["A", "Bee", "C"]);
    const edited = await m.prisma.auditEvent.findMany({
      where: { entityId: b.id, action: "question_option_edited" },
    });
    expect(edited).toHaveLength(1);
    expect(edited[0].detail).toEqual({ optionId: b.id, from: "B", to: "Bee" });
  });

  it("deletes a removed option's choices and lists them in its audit row", async () => {
    const question = await answeredQuestion();
    const [a, b] = question.options;
    const result = await m.saveQuestionCard(
      card(question, {
        options: [
          { key: a.id, id: a.id, label: "A", removed: true },
          { key: b.id, id: b.id, label: "B" },
        ],
      }),
    );
    expect(result).toEqual({ ok: true });

    expect(await m.prisma.questionOption.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await m.prisma.answerChoice.count({ where: { optionId: a.id } })).toBe(0);
    const after = await m.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.version).toBe(2);
    const removed = await m.prisma.auditEvent.findMany({
      where: { entityId: a.id, action: "question_option_removed" },
    });
    expect(removed).toHaveLength(1);
    expect(removed[0].detail).toEqual({
      optionId: a.id,
      label: "A",
      displayOrder: 0,
      choices: [{ userId: playerId, rank: null }],
    });
  });

  it("leaves the version alone when only a switch changes, and writes the switch's audit row", async () => {
    const question = await answeredQuestion();
    const options = question.options.map((o) => ({ key: o.id, id: o.id, label: o.label }));
    const result = await m.saveQuestionCard(card(question, { required: true, options }));
    expect(result).toEqual({ ok: true });
    const after = await m.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.version).toBe(1);
    expect(after.required).toBe(true);
    expect(
      await m.prisma.auditEvent.count({
        where: { entityId: question.id, action: "question_required_set" },
      }),
    ).toBe(1);
  });

  it("counts a save with nothing changed as saved and changes nothing", async () => {
    const question = await answeredQuestion();
    const options = question.options.map((o) => ({ key: o.id, id: o.id, label: o.label }));
    expect(await m.saveQuestionCard(card(question, { options }))).toEqual({ ok: true });
    const after = await m.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.version).toBe(1);
  });

  it("answers each invalid card with its message and changes nothing", async () => {
    const question = await answeredQuestion();
    const [a, b] = question.options;
    const keep = [
      { key: a.id, id: a.id, label: "A" },
      { key: b.id, id: b.id, label: "B" },
    ];

    expect(await m.saveQuestionCard(card(question, { prompt: "  ", options: keep }))).toEqual({
      ok: false,
      message: "Add the question's wording.",
      field: "prompt",
    });
    expect(
      await m.saveQuestionCard(
        card(question, { options: [...keep, { key: "new-1", label: "  " }] }),
      ),
    ).toEqual({ ok: false, message: "Type the option before adding it.", field: "option-new-1" });
    expect(
      await m.saveQuestionCard(
        card(question, { options: keep.map((o) => ({ ...o, removed: true })) }),
      ),
    ).toEqual({ ok: false, message: "Add at least one option." });

    const ranking = await answeredQuestion("RANKING");
    const [r1, r2] = ranking.options;
    expect(
      await m.saveQuestionCard(
        card(ranking, {
          options: [
            { key: r1.id, id: r1.id, label: "A" },
            { key: r2.id, id: r2.id, label: "B", removed: true },
          ],
        }),
      ),
    ).toEqual({ ok: false, message: "A ranking needs at least two options." });

    const after = await m.prisma.question.findUniqueOrThrow({
      where: { id: question.id },
      include: { options: true },
    });
    expect(after.version).toBe(1);
    expect(after.prompt).toBe("Which one?");
    expect(after.options).toHaveLength(2);
    expect(await m.prisma.questionOption.count({ where: { questionId: ranking.id } })).toBe(2);
  });

  it("hides and shows an answered question's answers, one audit row each, version untouched", async () => {
    const question = await answeredQuestion();
    await m.prisma.question.update({ where: { id: question.id }, data: { answersRevealed: true } });
    const audits = (action: string) =>
      m.prisma.auditEvent.count({
        where: { entity: "Question", entityId: question.id, action },
      });

    expect(await m.setQuestionAnswersRevealed(visibility(question.id, false))).toEqual({ ok: true });
    let after = await m.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.answersRevealed).toBe(false);
    expect(await audits("question_answers_hidden")).toBe(1);

    expect(await m.setQuestionAnswersRevealed(visibility(question.id, true))).toEqual({ ok: true });
    after = await m.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.answersRevealed).toBe(true);
    expect(await audits("question_answers_revealed")).toBe(1);
    expect(await audits("question_answers_hidden")).toBe(1);
    expect(after.version).toBe(1);
  });

  it("counts sending the visibility a question already has as saved and writes no audit row", async () => {
    const question = await answeredQuestion();
    const result = await m.setQuestionAnswersRevealed(
      visibility(question.id, question.answersRevealed),
    );
    expect(result).toEqual({ ok: true });
    expect(await m.prisma.auditEvent.count({ where: { entityId: question.id } })).toBe(0);
  });

  it("refuses to change a question's visibility for a player", async () => {
    const question = await answeredQuestion();
    await loginAs(playerId);
    try {
      await expect(
        m.setQuestionAnswersRevealed(visibility(question.id, !question.answersRevealed)),
      ).rejects.toThrow();
    } finally {
      await loginAs(organizerId);
    }
    const after = await m.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.answersRevealed).toBe(question.answersRevealed);
  });
});
