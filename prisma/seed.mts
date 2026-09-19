import { prisma } from "../src/adapters/db/client.ts";
import {
  slotToDbTime,
  type AvailabilityRange,
} from "../src/domain/availability.ts";

// Local development seed, run via `npm run db:seed`. Upserts keyed on
// unique fields so re-running is safe; logs counts and opaque IDs only.

// Weekday convention matches the schema: 0 = Monday … 6 = Sunday.
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

// In NY time these weeks give: Wed evening everyone, Sat afternoon without
// Greta, Sun Robin-tentative only, and a Quinn block crossing NY midnight.
const USERS: {
  displayName: string;
  email: string;
  timeZone: string;
  siteAdmin: boolean;
  standing: AvailabilityRange[];
}[] = [
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

async function main() {
  const [organizer, ...players] = await Promise.all(
    USERS.map((u) =>
      prisma.user.upsert({
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
      }),
    ),
  );
  const userByEmail = new Map(
    [organizer, ...players].map((user) => [user.email, user]),
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

  // Standing availability: created only when the user has none, so hand
  // edits made after the first seed run are not clobbered.
  for (const u of USERS) {
    const user = userByEmail.get(u.email)!;
    const existing = await prisma.standingAvailability.count({
      where: { userId: user.id },
    });
    if (existing === 0 && u.standing.length > 0) {
      await prisma.standingAvailability.createMany({
        data: u.standing.map((r) => ({
          userId: user.id,
          version: 1,
          weekday: r.weekday,
          startLocal: slotToDbTime(r.startSlot),
          endLocal: slotToDbTime(r.endSlot),
          status: r.status,
        })),
      });
    }
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

  // Event availability copied from the standing weeks — including Greta's,
  // so the organizer mark and the organizer-only filter have data to show.
  for (const u of USERS) {
    const user = userByEmail.get(u.email)!;
    const existing = await prisma.eventAvailability.count({
      where: { eventId: event.id, userId: user.id },
    });
    if (existing === 0 && u.standing.length > 0) {
      await prisma.eventAvailability.createMany({
        data: u.standing.map((r) => ({
          eventId: event.id,
          userId: user.id,
          weekday: r.weekday,
          startLocal: slotToDbTime(r.startSlot),
          endLocal: slotToDbTime(r.endSlot),
          status: r.status,
          copiedFromStandingVersion: 1,
        })),
      });
    }
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
      const existing = await prisma.answer.findUnique({
        where: {
          questionId_userId: { questionId: systemQuestion.id, userId: user.id },
        },
      });
      if (!existing) {
        await prisma.answer.create({
          data: {
            questionId: systemQuestion.id,
            questionVersion: systemQuestion.version,
            eventId: event.id,
            userId: user.id,
            choices: { create: [{ optionId: option.id, rank: null }] },
          },
        });
      }
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

  console.log(
    `db:seed: event ${event.id}, ` +
      `5 users (1 organizer and site admin, 1 on no event), ${questions.length} questions`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
