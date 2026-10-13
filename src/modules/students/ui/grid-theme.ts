"use client";

import type { Theme } from "@glideapps/glide-data-grid";

/** Glide draws on a canvas, so it can't use CSS classes: read the Creo tokens from the page. */
export function readGridTheme(): Partial<Theme> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    accentColor: v("--focus-ring"),
    accentLight: `color-mix(in srgb, ${v("--brand-amber")} 22%, transparent)`,
    textDark: v("--ink-title"),
    textMedium: v("--ink"),
    textLight: v("--ink-muted"),
    textHeader: v("--ink-title"),
    textBubble: v("--ink-title"),
    bgIconHeader: v("--ink-muted"),
    fgIconHeader: v("--surface-100"),
    bgCell: v("--surface-100"),
    bgCellMedium: v("--surface-200"),
    bgHeader: v("--surface-200"),
    bgHeaderHasFocus: v("--surface-300"),
    bgHeaderHovered: v("--surface-300"),
    bgBubble: v("--surface-200"),
    bgSearchResult: `color-mix(in srgb, ${v("--brand-amber")} 35%, transparent)`,
    borderColor: v("--line-soft"),
    horizontalBorderColor: v("--line-soft"),
    drilldownBorder: v("--line"),
    linkColor: v("--heading-blue"),
    fontFamily: getComputedStyle(document.body).fontFamily,
    baseFontStyle: "13px",
    headerFontStyle: "600 12px",
    editorFontSize: "13px",
    cellHorizontalPadding: 10,
    cellVerticalPadding: 4,
  };
}
