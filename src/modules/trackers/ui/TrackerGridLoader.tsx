"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { TrackerGrid } from "./TrackerGrid";

// The grid draws on a canvas, so it only renders in the browser.
const Grid = dynamic(() => import("./TrackerGrid").then((m) => m.TrackerGrid), {
  ssr: false,
  loading: () => <p className="voice text-sm text-ink-muted">loading tracker…</p>,
});

export function TrackerGridLoader(props: ComponentProps<typeof TrackerGrid>) {
  return <Grid {...props} />;
}
