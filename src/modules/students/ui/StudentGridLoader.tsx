"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { StudentGrid } from "./StudentGrid";

// The grid draws on a canvas, so it only renders in the browser.
const Grid = dynamic(() => import("./StudentGrid").then((m) => m.StudentGrid), {
  ssr: false,
  loading: () => <p className="voice text-sm text-ink-muted">loading students…</p>,
});

export function StudentGridLoader(props: ComponentProps<typeof StudentGrid>) {
  return <Grid {...props} />;
}
