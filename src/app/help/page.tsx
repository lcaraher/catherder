import Link from "next/link";

// Public help page: no sign-in needed, it holds no data. Section text marked
// as placeholder is to be rewritten — headings are the real structure.

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Modes",
    body: "A short explanation of multi-group and single-activity events will go here.",
  },
  {
    heading: "Organizer also participates",
    body: "A short explanation of the organizer participation switch will go here.",
  },
  {
    heading: "Your availability and time zone",
    body: "A short explanation of the weekly grid and time-zone handling will go here.",
  },
  {
    heading: "Joining by link or code",
    body: "An organizer can share a join link or a short code (it looks like ABCDE-FGHJK). Open the link, or go to Join an event and type the code; capitals, hyphens and spaces do not matter. If you are not signed in yet, you will be asked to sign in first and then brought straight back. Joining adds the event to your home page under Needs your response. A link or code only works while the event is open, and the organizer can replace it at any time, after which the old one stops working.",
  },
  {
    heading: "Responding to an event",
    body: "A short explanation of the respond page and resubmitting will go here.",
  },
  {
    heading: "Results sharing and answer visibility",
    body: "A short explanation of when responses become visible will go here.",
  },
  {
    heading: "Required questions",
    body: "A short explanation of required questions will go here.",
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-2 text-sm">
        <Link href="/" className="text-hint hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold">How do?</h1>
      <div className="flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-1 text-lg font-medium">{section.heading}</h2>
            <p className="text-sm text-muted">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
