# Threat Model
A first pass. It will change when the app is deployed.

## What the app holds
- People's names and which events they are on.
- Weekly availability and by extension information that could provide when a user may or may not be home.
- Free-text answers written to one organizer and not for the rest of participant's knowledge.
- Event descriptions, which could contain links or information regarding private community spaces.
- Audit rows, including JSON copies of deleted questions and their answers.
- My sanity while coordinating events.

## Who might misuse it
- **A friend on the roster** Friends that are too curious or nosy may want to see who said what before groups are decided and want to try and influence the shape of groups and who is in them when they submit their response.
- **A stranger or scraper with a URL** an event id in a shared link that was guessed, leaked, or obtained otherwise.
- **Me, by accident** An admin action on the wrong event, a deleted question and its unique responses.
- **An admin overriding an organizer**  This isn't a unexpected case, but still if such action occurs it shouldn't be invisible.
- **Someone typing hostile input**  A description or answer that carries HTML, a script, or a link that points somewhere it should not.
- **Anyone reading the logs** A leaked log line can easily reveal what the app holds or a potential way to strike it.


## What it does about each as of today
- Participants see nothing about other people. not who has responded, not the overlap, not any answer. This holds true until the organizer shares results. Sharing is per question for answers, so a poll can be shared while a private note stays private.
- Free-text notes written to the organizer are never shown to participants at all.
- The organizer can close an event before sharing, so nobody can change their answer after seeing everyone else's.
- Every page and every action checks, on the server, whether the signed-in person is on that event or may manage it.
- Someone who is not invited/joined on the event gets "not found", the same answer they would get for an event that does not exist, so the URL confirms nothing.
- Email addresses never appear on any page. There is no list of users anywhere in the app, so a valid login does not yield a roster of everyone else.
- Descriptions are Markdown rendered with raw HTML shown as text, links limited to `http` and `https`, and images never loaded.
- Answers and descriptions are rendered as text by React, which escapes them; the app never inserts raw HTML into a page.
- Every database query is a parameterised Prisma statement, so user text travels as a value and never becomes part of the SQL.
- Text limits (200 characters for "Other", 2,000 for text answers, 10,000 for descriptions) are size caps, not sanitisation. This will atleast stop a flood, not an attack.
- Deleting a question or removing an option people chose first writes a copy of what is being removed into the audit table, so it can be restored by hand from the database.
- Every state change (open, close, share, unlock, archive, zone change, deletions) writes an audit row with who did it and when.
- When a workspace admin manages an event they do not organize, the page says so in a banner, and the action is recorded in the audit table like any other.
- Free-text answers, schedules, tokens and full email addresses are never written to logs. Logs carry ids, outcomes and errors.

## Deliberately not done yet

- Rate limiting and abuse controls.  App is not public yet.
- Uploaded media. No storage exists yet.
- Notifications.
- Retention for audit snapshots.
- A platform-admin role separate from workspace ownership.
