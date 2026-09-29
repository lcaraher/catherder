import Link from "next/link";
import { Pane } from "@/components/pane";

// Public about page: no sign-in needed. Section text is placeholder.

const SECTIONS: { id: string; heading: string; body: string }[] = [
  {
    id: "about",
    heading: "What catherder is",
    body: "A short explanation of what catherder is and who it is for will go here.",
  },
  {
    id: "accessibility",
    heading: "Accessibility",
    body: "A short explanation of how catherder is made usable for colour-blind, dyslexic and keyboard users will go here.",
  },
  {
    id: "privacy",
    heading: "Privacy",
    body: "A short explanation of what catherder stores, who can see it, and how to have it removed will go here.",
  },
];

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
            <p className="text-sm text-muted">{section.body}</p>
          </Pane>
        ))}
      </div>
    </main>
  );
}
