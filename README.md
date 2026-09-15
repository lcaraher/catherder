# catherder
Find when a group of people can meet for a single event, or how a large group can best align over multiple events.

catherder collects an event organizer and the events' participants' weekly availability on a grid, shows where it overlaps in each viewer's time zone, and asks whatever questions the organizer feels are relevant to preparing for the event and its participants' preferences.  I utilize it for my own tabletop group (a dozen or so people across different time zones that I have to break into a few groups), and it works for just about any activity where finding a time that works for everyone feels like... well... herding cats.

It runs at **catherderapp.com** for the people I plan with.  It is not a public service (at this time); accounts get in by invitation/request.

## What it does today
- Each person paints a standing week of availability at least once and approves their detected timezone or saves the correct one(which is saved to their profile); every event they're invited to starts pre-filled with their saved availability and can be one-off modified from within the event or reloaded if they make direct edits to their profile's canon availability.
- An organizer creates an event, provides a description and details for their expected participants, and provides questions(single choice, multiple choice, text, ranking, and Other available for unique feedback where needed) for the context they need for planning.
- Participants respond in their own time zone to the availability grid.  The organizer sees the overlap grid with everyone's blocks converted into their time zone, and each person's answers.
- Nothing about other people is visible to participants until the organizer decides it's appropriate to share or reveal, whether during or after information gathering for the event is complete.  The organizer can decide for each question whether information is revealed at any time.
- Two modes: a multi-group activity where the availability can be anchored on the organizer, and a single activity where it can anchor on the organizer's availability or ignore it to just match when it's best for everyone.

## Where it's going

The major reason I wanted this app to exist is to be able to take over a dozen schedules and have an event organizer that wants to take a large group of people and find how to break them into potential smaller groups that have the best schedule compatibility for the most amount of people to be able to participate rather than an organizer being bogged down by trying to chase down schedule changes, timezone conversions, and who actually can make what with enough people for an actual group activity to fire.

Planned, in order:

1. **Group finder** The organizer sets a block length; the app processes candidate windows of that length from submitted availability, sorts people into groups on distinct dates and time ranges so one or more organizers can run them all while indicating clearly who can't fit into the schedule at all or cleanly.  Block length for the events is a live control; the organizer can select a subset of people and see only their overlap with each other.
2. **Co-Organizers**  An individual person in the organizer's event who holds one of two roles: another anchor for availability (someone who leads their own group in the event) or a helper who administers the event and the participant's feedback without necessarily leading a separate group.
3. **Invitation only for now** This will include email invitations, join links, or potentially invite by code.
4. **Richer event descriptions** Event descriptions will have an editor and ability for images and media.
5. **Themes and accessibility** App will have selectable themes including light, dark, and other colorful themes. Colour-blind-safe by construction; a dyslexia-friendly option.  This is to accommodate real constraints from people in my friend group to make things more comfortable for them.


Additional ideas regarding being able to query in plain language regarding responses and integration with event/campaign notes are ideas kept open but not yet scheduled, along with other tabletop gaming-related idea integration.

## How it's built

- **Next.js** (App Router, Typescript) with **Tailwind**, on **PostgreSQL** through **Prisma**.
- Three layers: `src/domain` is pure logic with no framework imports (availability slots, overlap, access rules), `src/adapters` talks to the database and the identity provider, `src/app` is routes and pages.
- Login is standard OIDC behind a seam: the app verifies tokens against whatever issuer it's configured with (Amazon Cognito in the deployed version). It keeps its own user table keyed on issuer and subject.
- Who may do what lives in the database, i.e., workspace roles, event organizers, and event participants. Never lives in the login token. Every check is made on the server.
- Availability is stored as local wall-clock time plus an IANA time-zone name, never UTC.  The overlap view converts into the viewer's time zone at render time.
- Every color is a named token, so a theme is one block of values.
- Infrastructure is Terraform under `infra/aws`.  Deploys from GitHub Actions through a keyless OIDC role.


More in [docs/architecture.md](docs/architecture.md), the [decision records](docs/decisions/README.md), and the [threat model](docs/threat-model.md).

## Working on the code

This is a developer setup, not a way to use the app:

The database runs in Docker, the app runs on your machine, and a dev-only login page stands in for the identity provider.  Needs Node 24 and Docker.

        docker compose up -d db
        npm install
        npm run dev
Then `http://localhost:3001/dev-login` and pick a seeded user (`npm run db:seed` creates them). The dev login refuses to start in production.

`npm test` runs the unit tests, then an integration suite that migrates, seeds, and exercises the API against the database in `DATABASE_URL`.  CI runs the same on every push with a PostgreSQL service container.

Self-hosting for your own group is possible -- the app is a container plus PostgreSQL plus any OIDC provider, but it isn't documented yet.  Your own identity provider, a public address, and TLS would be needed.  The [runbook](docs/runbook.md) covers the AWS deployment this repo actually runs.

## Accessibility

Coming soon.
