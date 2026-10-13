"use client";

import { useRef, useState } from "react";

/** Plays a student's name recording. Sized with the name it sits beside. */
export function PlayNameButton({ src, name }: { src: string; name: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <button
      type="button"
      data-play-name
      aria-label={`Play how to say ${name}`}
      title="Play pronunciation"
      onClick={(e) => {
        // Inside a palette item or a link, play without also opening it.
        e.preventDefault();
        e.stopPropagation();
        if (!audio.current) {
          audio.current = new Audio(src);
          audio.current.addEventListener("ended", () => setPlaying(false));
          audio.current.addEventListener("pause", () => setPlaying(false));
        }
        audio.current.currentTime = 0;
        setPlaying(true);
        audio.current.play().catch(() => setPlaying(false));
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`ml-[0.4em] inline-flex size-[1.4em] min-h-6 min-w-6 items-center justify-center rounded-full border border-line align-middle text-ink-muted hover:text-ink-title ${playing ? "bg-surface-sunken" : ""}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[55%]" fill="currentColor">
        <path d="M2 6h3l4-3v10l-4-3H2z" />
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}
