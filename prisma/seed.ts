import { PrismaClient } from "@prisma/client";

// Local development seed, run via `npm run db:seed` (Node strips the types
// natively; no build step). Upserts keyed on unique fields so re-running is safe.
// Per CLAUDE.md rule 6, log counts and opaque IDs only — never emails.
const prisma = new PrismaClient();

const TIME_ZONE = "America/New_York";

async function main() {
  const [gm, ...players] = await Promise.all(
    [
      { displayName: "Greta Master", email: "gm@example.com" },
      { displayName: "Pat Player", email: "player1@example.com" },
      { displayName: "Quinn Player", email: "player2@example.com" },
      { displayName: "Robin Player", email: "player3@example.com" },
    ].map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, timeZone: TIME_ZONE },
      }),
    ),
  );

  const workspaceName = "Seed Workspace";
  const existingWorkspace = await prisma.workspace.findFirst({
    where: { name: workspaceName, ownerUserId: gm.id },
  });
  const workspace =
    existingWorkspace ??
    (await prisma.workspace.create({
      data: { name: workspaceName, ownerUserId: gm.id },
    }));

  await Promise.all(
    [gm, ...players].map((user, i) =>
      prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
        },
        update: {},
        create: {
          workspaceId: workspace.id,
          userId: user.id,
          role: i === 0 ? "OWNER" : "PARTICIPANT",
        },
      }),
    ),
  );

  const eventName = "Seed Campaign Kickoff";
  const existingEvent = await prisma.event.findFirst({
    where: { workspaceId: workspace.id, name: eventName },
  });
  const event =
    existingEvent ??
    (await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name: eventName,
        mode: "GM_GROUPS",
        gmUserId: gm.id,
        requiredSlots: 6,
        status: "DRAFT",
      },
    }));

  await Promise.all(
    [gm, ...players].map((user, i) =>
      prisma.eventParticipant.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        update: {},
        create: {
          eventId: event.id,
          userId: user.id,
          role: i === 0 ? "GAMEMASTER" : "PLAYER",
          responseStatus: "INVITED",
        },
      }),
    ),
  );

  console.log(
    `db:seed: workspace ${workspace.id}, event ${event.id}, 4 users (1 GM)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
