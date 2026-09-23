import { prisma } from "../src/adapters/db/client.ts";
import {
  slotToDbTime,
  type AvailabilityRange,
} from "../src/domain/availability.ts";

// Local development seed, run via `npm run db:seed`. Upserts keyed on
// unique fields so re-running is safe; logs counts and opaque IDs only.

// Weekday convention matches the schema: 0 = Monday … 6 = Sunday.
const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;
const FRI = 4;
const SAT = 5;
const SUN = 6;

const range = (
  weekday: number,
  startSlot: number,
  endSlot: number,
  status: "AVAILABLE" | "TENTATIVE" = "AVAILABLE",
): AvailabilityRange => ({ weekday, startSlot, endSlot, status });

// Whole hours in the user's own local time; a range is start–end, end exclusive.
const hours = (
  weekday: number,
  startHour: number,
  endHour: number,
  status: "AVAILABLE" | "TENTATIVE" = "AVAILABLE",
): AvailabilityRange => range(weekday, startHour * 2, endHour * 2, status);

interface SeedUser {
  displayName: string;
  email: string;
  timeZone: string;
  siteAdmin: boolean;
  standing: AvailabilityRange[];
}

// In NY time these weeks give: Wed evening everyone, Sat afternoon without
// Greta, Sun Robin-tentative only, and a Quinn block crossing NY midnight.
const USERS: SeedUser[] = [
  {
    displayName: "Greta Master",
    email: "organizer@example.com",
    timeZone: "America/New_York",
    // The local admin.
    siteAdmin: true,
    standing: [range(WED, 36, 44)],
  },
  {
    displayName: "Pat Player",
    email: "player1@example.com",
    timeZone: "America/New_York",
    siteAdmin: false,
    standing: [range(WED, 38, 46), range(SAT, 28, 34)],
  },
  {
    displayName: "Quinn Player",
    email: "player2@example.com",
    timeZone: "America/Chicago",
    siteAdmin: false,
    standing: [range(WED, 36, 44), range(FRI, 44, 48), range(SAT, 26, 32)],
  },
  {
    displayName: "Robin Player",
    email: "player3@example.com",
    timeZone: "Europe/London",
    siteAdmin: false,
    standing: [
      range(WED, 44, 48),
      range(THU, 0, 4),
      range(SUN, 28, 34, "TENTATIVE"),
    ],
  },
];

// Eleven more players for the dense event; the last three have no standing
// week and stay INVITED.
const DENSE_USERS: SeedUser[] = [
  {
    displayName: "Bartholomew Okonkwo-Reyes",
    email: "player4@example.com",
    timeZone: "America/Los_Angeles",
    siteAdmin: false,
    standing: [
      hours(MON, 17, 22),
      hours(WED, 17, 22),
      hours(THU, 18, 22, "TENTATIVE"),
      hours(FRI, 17, 23),
      hours(SAT, 10, 23),
      hours(SUN, 10, 20),
    ],
  },
  {
    displayName: "Maximilian Featherstonehaugh",
    email: "player5@example.com",
    timeZone: "Europe/London",
    siteAdmin: false,
    standing: [
      hours(MON, 0, 1),
      hours(MON, 23, 24),
      hours(TUE, 0, 2),
      hours(TUE, 23, 24, "TENTATIVE"),
      hours(WED, 0, 2, "TENTATIVE"),
      hours(THU, 23, 24),
      hours(FRI, 0, 2),
      hours(FRI, 23, 24),
      hours(SAT, 0, 3),
      hours(SAT, 18, 24),
      hours(SUN, 0, 3),
      hours(SUN, 17, 24),
    ],
  },
  {
    displayName: "Priyanka Venkataraghavan",
    email: "player6@example.com",
    timeZone: "Asia/Kolkata",
    siteAdmin: false,
    standing: [
      hours(MON, 5, 8),
      hours(TUE, 5, 8, "TENTATIVE"),
      hours(THU, 5, 8),
      hours(FRI, 5, 9),
      hours(SAT, 5, 9),
      hours(SUN, 5, 7),
      hours(SUN, 7, 12, "TENTATIVE"),
    ],
  },
  {
    displayName: "Oluwaseun Adebayo-Whitfield",
    email: "player7@example.com",
    timeZone: "America/Chicago",
    siteAdmin: false,
    standing: [
      hours(MON, 18, 22),
      hours(TUE, 18, 22),
      hours(WED, 18, 22),
      hours(THU, 18, 22),
      hours(FRI, 18, 23),
      hours(SAT, 12, 23),
      hours(SUN, 12, 21, "TENTATIVE"),
    ],
  },
  {
    displayName: "Anneliese Vondráčková",
    email: "player8@example.com",
    timeZone: "Europe/Berlin",
    siteAdmin: false,
    standing: [],
  },
  {
    displayName: "Thaddeus Nakagawa-Brennan",
    email: "player9@example.com",
    timeZone: "Asia/Tokyo",
    siteAdmin: false,
    standing: [
      hours(MON, 8, 12, "TENTATIVE"),
      hours(FRI, 8, 13),
      hours(SAT, 8, 13),
      hours(SUN, 8, 13),
    ],
  },
  {
    displayName: "Rosalind Achterberg",
    email: "player10@example.com",
    timeZone: "Australia/Adelaide",
    siteAdmin: false,
    standing: [
      hours(MON, 9, 12),
      hours(FRI, 9, 13),
      hours(SAT, 9, 13),
      hours(SUN, 8, 12, "TENTATIVE"),
      hours(SUN, 12, 13),
    ],
  },
  {
    displayName: "Ignatius Mbeki-Sørensen",
    email: "player11@example.com",
    timeZone: "Europe/Helsinki",
    siteAdmin: false,
    standing: [],
  },
  {
    displayName: "Wilhelmina Castellanos",
    email: "player12@example.com",
    timeZone: "America/Sao_Paulo",
    siteAdmin: false,
    standing: [
      hours(MON, 19, 24),
      hours(TUE, 19, 24),
      hours(THU, 19, 24),
      hours(FRI, 19, 24),
      hours(SAT, 0, 1),
      hours(SAT, 14, 24),
      hours(SUN, 0, 1),
      hours(SUN, 14, 23),
    ],
  },
  {
    displayName: "Kalani Fa'afetai-Iosefa",
    email: "player13@example.com",
    timeZone: "Pacific/Auckland",
    siteAdmin: false,
    standing: [
      hours(MON, 12, 15, "TENTATIVE"),
      hours(FRI, 12, 16),
      hours(SAT, 12, 16),
      hours(SUN, 9, 16),
    ],
  },
  {
    displayName: "Dorothea Szczepańska",
    email: "player14@example.com",
    timeZone: "Asia/Kathmandu",
    siteAdmin: false,
    standing: [],
  },
];

const DENSE_QUESTION = "Which arc do you want to start next?";
const DENSE_OPTIONS = [
  "Rime of the Frostmaiden",
  "A homebrew heist campaign",
  "Something short — one-shots for a month",
];

async function upsertUser(u: SeedUser) {
  return prisma.user.upsert({
    where: { email: u.email },
    // The zone applies on update too, so re-seeding an existing database
    // moves everyone to the designed zones.
    update: { timeZone: u.timeZone, siteAdmin: u.siteAdmin },
    create: {
      displayName: u.displayName,
      email: u.email,
      timeZone: u.timeZone,
      siteAdmin: u.siteAdmin,
    },
  });
}

// Standing availability: created only when the user has none, so hand
// edits made after the first seed run are not clobbered.
async function ensureStanding(userId: string, standing: AvailabilityRange[]) {
  const existing = await prisma.standingAvailability.count({
    where: { userId },
  });
  if (existing === 0 && standing.length > 0) {
    await prisma.standingAvailability.createMany({
      data: standing.map((r) => ({
        userId,
        version: 1,
        weekday: r.weekday,
        startLocal: slotToDbTime(r.startSlot),
        endLocal: slotToDbTime(r.endSlot),
        status: r.status,
      })),
    });
  }
}

// Event availability copied from the standing week, only when the user has
// none on the event yet.
async function ensureEventAvailability(
  eventId: string,
  userId: string,
  standing: AvailabilityRange[],
) {
  const existing = await prisma.eventAvailability.count({
    where: { eventId, userId },
  });
  if (existing === 0 && standing.length > 0) {
    await prisma.eventAvailability.createMany({
      data: standing.map((r) => ({
        eventId,
        userId,
        weekday: r.weekday,
        startLocal: slotToDbTime(r.startSlot),
        endLocal: slotToDbTime(r.endSlot),
        status: r.status,
        copiedFromStandingVersion: 1,
      })),
    });
  }
}

async function ensureChoiceAnswer(
  question: { id: string; version: number; eventId: string },
  userId: string,
  optionId: string,
) {
  const existing = await prisma.answer.findUnique({
    where: { questionId_userId: { questionId: question.id, userId } },
  });
  if (!existing) {
    await prisma.answer.create({
      data: {
        questionId: question.id,
        questionVersion: question.version,
        eventId: question.eventId,
        userId,
        choices: { create: [{ optionId, rank: null }] },
      },
    });
  }
}

async function main() {
  const [organizer, ...players] = await Promise.all(USERS.map(upsertUser));
  const denseUsers = await Promise.all(DENSE_USERS.map(upsertUser));
  const userByEmail = new Map(
    [organizer, ...players, ...denseUsers].map((user) => [user.email, user]),
  );

  // Nova is on no event.
  await prisma.user.upsert({
    where: { email: "newcomer@example.com" },
    update: { timeZone: "America/Los_Angeles", siteAdmin: false },
    create: {
      displayName: "Nova Newcomer",
      email: "newcomer@example.com",
      timeZone: "America/Los_Angeles",
      siteAdmin: false,
    },
  });

  for (const u of [...USERS, ...DENSE_USERS]) {
    await ensureStanding(userByEmail.get(u.email)!.id, u.standing);
  }

  const eventName = "Seed Campaign Kickoff";
  const existingEvent = await prisma.event.findFirst({
    where: { name: eventName, organizerUserId: organizer.id },
  });
  // The event stays DRAFT and unrevealed.
  const event =
    existingEvent ??
    (await prisma.event.create({
      data: {
        name: eventName,
        mode: "MULTI_GROUP",
        organizerUserId: organizer.id,
        organizerParticipates: false,
        requiredSlots: 6,
        status: "DRAFT",
      },
    }));

  // Pat, Quinn and Robin have submitted; Greta does not participate, so
  // her ORGANIZER row is storage only — its status is never displayed.
  await Promise.all(
    [organizer, ...players].map((user, i) =>
      prisma.eventParticipant.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        update:
          i === 0
            ? { role: "ORGANIZER" }
            : { responseStatus: "SUBMITTED" },
        create: {
          eventId: event.id,
          userId: user.id,
          role: i === 0 ? "ORGANIZER" : "PLAYER",
          responseStatus: i === 0 ? "INVITED" : "SUBMITTED",
        },
      }),
    ),
  );

  // Greta's week is copied too, so the organizer mark and the
  // organizer-only filter have data to show.
  for (const u of USERS) {
    await ensureEventAvailability(
      event.id,
      userByEmail.get(u.email)!.id,
      u.standing,
    );
  }

  // Two questions, created only when the event has none.
  const questionCount = await prisma.question.count({
    where: { eventId: event.id },
  });
  if (questionCount === 0) {
    await prisma.question.create({
      data: {
        eventId: event.id,
        type: "SINGLE_CHOICE",
        prompt: "Preferred system?",
        version: 1,
        displayOrder: 0,
        options: {
          create: [
            { label: "Pathfinder", displayOrder: 0 },
            { label: "D&D 5e", displayOrder: 1 },
            { label: "Call of Cthulhu", displayOrder: 2 },
          ],
        },
      },
    });
    await prisma.question.create({
      data: {
        eventId: event.id,
        type: "TEXT",
        prompt: "Anything the organizer should know?",
        version: 1,
        displayOrder: 1,
      },
    });
  }

  const questions = await prisma.question.findMany({
    where: { eventId: event.id },
    include: { options: true },
  });
  const systemQuestion = questions.find(
    (q) => q.prompt === "Preferred system?",
  );
  const textQuestion = questions.find(
    (q) => q.prompt === "Anything the organizer should know?",
  );

  const [pat, quinn, robin] = players;
  if (systemQuestion) {
    const optionByLabel = new Map(
      systemQuestion.options.map((option) => [option.label, option]),
    );
    const picks: [typeof pat, string][] = [
      [pat, "Pathfinder"],
      [quinn, "D&D 5e"],
      [robin, "Call of Cthulhu"],
    ];
    for (const [user, label] of picks) {
      const option = optionByLabel.get(label);
      if (!option) continue;
      await ensureChoiceAnswer(systemQuestion, user.id, option.id);
    }
  }

  if (textQuestion) {
    // Robin deliberately leaves the text blank.
    const texts: [typeof pat, string][] = [
      [pat, "I can shift my Saturday block if that helps the group."],
      [quinn, "My Friday block runs late — it is firm, not flexible."],
      [robin, ""],
    ];
    for (const [user, text] of texts) {
      const existing = await prisma.answer.findUnique({
        where: {
          questionId_userId: { questionId: textQuestion.id, userId: user.id },
        },
      });
      if (!existing) {
        await prisma.answer.create({
          data: {
            questionId: textQuestion.id,
            questionVersion: textQuestion.version,
            eventId: event.id,
            userId: user.id,
            text: { create: { text } },
          },
        });
      }
    }
  }

  // Second event: twelve participants, OPEN, results already shared.
  const denseName = "Seed Dense Session";
  const existingDense = await prisma.event.findFirst({
    where: { name: denseName, organizerUserId: organizer.id },
  });
  const dense =
    existingDense ??
    (await prisma.event.create({
      data: {
        name: denseName,
        mode: "SINGLE_ACTIVITY",
        organizerUserId: organizer.id,
        organizerParticipates: true,
        requiredSlots: 6,
        status: "OPEN",
        resultsRevealedAt: new Date(),
      },
    }));

  // Greta participates and has submitted; players without a standing week
  // are still INVITED.
  const denseRows: [SeedUser, "ORGANIZER" | "PLAYER"][] = [
    [USERS[0], "ORGANIZER"],
    ...DENSE_USERS.map((u): [SeedUser, "PLAYER"] => [u, "PLAYER"]),
  ];
  await Promise.all(
    denseRows.map(([u, role]) => {
      const responseStatus =
        role === "ORGANIZER" || u.standing.length > 0 ? "SUBMITTED" : "INVITED";
      const userId = userByEmail.get(u.email)!.id;
      return prisma.eventParticipant.upsert({
        where: { eventId_userId: { eventId: dense.id, userId } },
        update: { role, responseStatus },
        create: { eventId: dense.id, userId, role, responseStatus },
      });
    }),
  );

  for (const [u] of denseRows) {
    await ensureEventAvailability(
      dense.id,
      userByEmail.get(u.email)!.id,
      u.standing,
    );
  }

  const denseQuestionCount = await prisma.question.count({
    where: { eventId: dense.id },
  });
  if (denseQuestionCount === 0) {
    await prisma.question.create({
      data: {
        eventId: dense.id,
        type: "SINGLE_CHOICE",
        prompt: DENSE_QUESTION,
        version: 1,
        displayOrder: 0,
        options: {
          create: DENSE_OPTIONS.map((label, displayOrder) => ({
            label,
            displayOrder,
          })),
        },
      },
    });
  }

  const denseQuestion = await prisma.question.findFirst({
    where: { eventId: dense.id, prompt: DENSE_QUESTION },
    include: { options: true },
  });
  if (denseQuestion) {
    const optionByLabel = new Map(
      denseQuestion.options.map((option) => [option.label, option]),
    );
    // Greta picks the first option; the submitted players rotate through all three.
    const first = optionByLabel.get(DENSE_OPTIONS[0]);
    if (first) await ensureChoiceAnswer(denseQuestion, organizer.id, first.id);
    const submitted = DENSE_USERS.filter((u) => u.standing.length > 0);
    for (const [i, u] of submitted.entries()) {
      const option = optionByLabel.get(DENSE_OPTIONS[i % DENSE_OPTIONS.length]);
      if (!option) continue;
      await ensureChoiceAnswer(
        denseQuestion,
        userByEmail.get(u.email)!.id,
        option.id,
      );
    }
  }

  console.log(
    `db:seed: events ${event.id} and ${dense.id}, ` +
      `${USERS.length + DENSE_USERS.length + 1} users (1 organizer and site admin, 1 on no event), ` +
      `${questions.length + (denseQuestion ? 1 : 0)} questions`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
