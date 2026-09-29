"use client";

import { useEffect, useRef, useState } from "react";

const FRAMES = 9;
const FRAME_MS = 38;

/** `text` with every character from `revealed` on, spaces kept, as a random 0 or 1. */
function binaryFrom(text: string, revealed: number): string {
  return Array.from(text, (char, i) =>
    i < revealed || char === " " ? char : Math.random() < 0.5 ? "0" : "1",
  ).join("");
}

/** Footer link label that decodes from binary on mouse entry or keyboard focus of its link. */
export function DecodeLabel({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState<string | null>(null);

  useEffect(() => {
    const host = ref.current?.closest<HTMLElement>("a, [tabindex]");
    if (!host) return;
    let timer: number | undefined;

    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
      setOverlay(null);
    };
    const start = () => {
      stop();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      let frame = 0;
      setOverlay(binaryFrom(text, 0));
      timer = window.setInterval(() => {
        frame += 1;
        if (frame >= FRAMES) {
          stop();
          return;
        }
        setOverlay(binaryFrom(text, Math.floor((text.length * frame) / FRAMES)));
      }, FRAME_MS);
    };
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") start();
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse") stop();
    };
    const onFocus = () => {
      if (host.matches(":focus-visible")) start();
    };

    host.addEventListener("pointerenter", onPointerEnter);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("focus", onFocus);
    host.addEventListener("blur", stop);
    return () => {
      window.clearInterval(timer);
      host.removeEventListener("pointerenter", onPointerEnter);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("focus", onFocus);
      host.removeEventListener("blur", stop);
    };
  }, [text]);

  return (
    <span ref={ref} className={overlay === null ? "relative" : "relative text-transparent"}>
      {text}
      {overlay !== null && (
        <span aria-hidden="true" className="absolute top-0 left-0 whitespace-nowrap text-link-hover">
          {overlay}
        </span>
      )}
    </span>
  );
}
