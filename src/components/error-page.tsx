"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ErrorMonitor } from "@/components/error-monitor";
import { NesController } from "@/components/nes-controller";
import { Pane } from "@/components/pane";
import { PixelCat } from "@/components/pixel-cat";
import { SecretCode } from "@/components/secret-code";
import { GLYPHS, SEQUENCE, useKonami } from "@/components/use-konami";

// The video the code opens.
const VIDEO_ID = "dQw4w9WgXcQ";

const NUDGE_MS = 240;

/** Shared body of the 404 and 500 pages; children are the actions under the game. */
export function ErrorPage({
  heading,
  errorLine,
  children,
}: {
  heading: string;
  errorLine?: string;
  children: ReactNode;
}) {
  const { progress, done, missed, feed } = useKonami();
  // The pane shakes from a wrong press until the miss count has settled.
  const [settled, setSettled] = useState(0);
  const nudge = missed !== settled;

  useEffect(() => {
    if (missed === settled) return;
    const timer = window.setTimeout(() => setSettled(missed), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [missed, settled]);

  const entered = SEQUENCE.slice(0, progress)
    .map((key) => GLYPHS[key])
    .join("");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div" className={`text-center${nudge ? " nudge" : ""}`}>
        <h1 className="font-pixel-display text-2xl font-normal">{heading}</h1>
        {errorLine && <p className="font-pixel-display text-sm text-hint">{errorLine}</p>}
        <PixelCat
          mood={done ? "laughing" : "sad"}
          className="mx-auto mt-3 h-24 w-28 text-btn-primary"
        />
        <p className="mt-3 text-muted">
          {"Darn looks like you've found a game-breaking bug. You'll never get to try "}
          <SecretCode />
          {" now."}
        </p>
        <NesController onPress={feed} />
        <p
          className="mt-2 min-h-6 font-pixel-display tracking-wide text-status-submitted"
          aria-live="polite"
        >
          {entered}
          {done && " ✓"}
        </p>
        <ErrorMonitor open={done} videoId={VIDEO_ID} />
        <div className="mt-4 flex flex-wrap justify-center gap-4">{children}</div>
      </Pane>
    </main>
  );
}
