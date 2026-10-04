import type { ReactNode } from "react";
import Link from "next/link";
import { Pane } from "@/components/pane";

// Public about page: no sign-in needed.

const FEEDBACK_ADDRESS = "feedback@catherderapp.com";

const SECTIONS: { id: string; heading: string; body: readonly string[] }[] = [
  {
    id: "about",
    heading: "What catherder is",
    body: ["catherder was created to help a group of friends find a time to play, whether that's an event or even a set of events broken into smaller groups.  An organizer makes an event and shares its join link or code with their intended participants.  Everyone who joins will then paint their availability onto a weekly grid, in their own time zone, and answer any questions the organizer includes with the event.",
      "The results page helps with overlaying everyone's availability hours over one another to assist the organizer in determining the best time for everyone and the times that work for the most people stand out and are clearly marked who's all available when.",
      "I made this so that when I'm trying to gather times for several people to break them up into smaller tabletop groups it would help keep my sanity and could make it less a headache for anyone else that wants to do the same and assist in their game planning."
    ],
  },
  {
    id: "accessibility",
    heading: "Accessibility",
    body: [
      "catherder was made while keeping some of our friends' dyslexia and colorblind needs in mind, so a few rules hold on each page.",
      "The availability grid is also able to be used from a keyboard: Tab to grid, move with the arrow keys, and press Space to change a square.  Every field has a visible label and focus always shows where you are.",
      "At this time there are four themes; Aurora, Light, Chill Pill, and Regal ASF (I have plans for more and am open to requests), and your choice is kept on your account.  If your device asks for reduced motion, the effects are turned off or shown already finished.",
      "The pages have also been scanned with an automated accessibility checker while the site is being built.",
      "Coming soon:  a color-blind-safe theme, and an optional reading font for dyslexic readers and ability to enlarge text.",
      "If you have any requests, accomommdations, or anything you find gets in your way please let me know at feedback@catherderapp.com."
    ],
  },
  {
    id: "privacy",
    heading: "Privacy",
    body: [
      "What catherder keeps: the name you choose to show, the email address you signed up with, your timezone, clock format and theme, your usual weekly availability, and, for each event you join, your availability and your answers. It also keeps a record of changes made to events.",
      "Who sees it: an event's organizer sees the responses to that event. Other participants see the combined results, and each other's answers, only once the organizer shares them. Your email address is never shown to anyone in the app.",
      "Signing in is handled by Amazon Cognito, Amazon Web Services' sign-in service, so catherder never sees your password. The app, its database and the sign-in service all run on Amazon Web Services in the United States (Ohio).",
      "Cookies keep you signed in (for up to 7 days) and remember your theme (for a year). Your browser also remembers whether you've seen the note that points at the Theme button. There are no ads, no tracking and no analytics because I'm too lazy to care about being nefarious with that information.",
      "Feedback: when you write to feedback@catherderapp.com, the whole message (your address, the subject, the text and any attachments) is stored on Amazon Web Services for 30 days and then deleted automatically, so nothing is lost if forwarding fails. A copy is forwarded to my own inbox so I can read and answer it, and stays there until I delete it.  You're also welcome to just send me feedback on Discord if you so wish and have that contact info.",
      "The logs that keep the site running are kept for 14 days. The mail system's logs record only that a message arrived and what happened to it, not who sent it or what it said.",
      "To have your account and everything attached to it deleted, or a feedback message you sent, write to feedback@catherderapp.com.",
    ],
  },
];

/** The paragraph's text with each feedback address as a mail link. */
function withMailLinks(text: string): ReactNode {
  const parts = text.split(FEEDBACK_ADDRESS);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <a key={i} href={`mailto:${FEEDBACK_ADDRESS}`}>
            {FEEDBACK_ADDRESS}
          </a>,
          part,
        ],
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div" className="mb-6">
        <p className="mb-2 text-sm">
          <Link href="/" className="text-hint">
            ← Home
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">About catherder</h1>
      </Pane>
      <div className="flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <Pane key={section.id} id={section.id} className="scroll-mt-4">
            <h2 className="mb-2 border-b border-edge pb-2 text-lg font-semibold">
              {section.heading}
            </h2>
            <div className="flex flex-col gap-2">
              {section.body.map((paragraph, i) => (
                <p key={i} className="text-sm text-muted">
                  {withMailLinks(paragraph)}
                </p>
              ))}
            </div>
          </Pane>
        ))}
      </div>
    </main>
  );
}
