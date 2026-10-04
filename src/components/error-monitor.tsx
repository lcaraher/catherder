"use client";

import { useEffect, useRef } from "react";

/** A small screen that switches on when open and plays the video. */
export function ErrorMonitor({ open, videoId }: { open: boolean; videoId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="crt-on scanlines mx-auto mt-4 aspect-video w-full max-w-md overflow-hidden rounded-lg border-4 border-edge-strong bg-surface"
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1`}
        title="A video"
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
