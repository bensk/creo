import localFont from "next/font/local";

// Self-hosted from npm packages, so builds never fetch fonts from the network.
// Inter for text; Maple Mono for numbers, IDs, dates, and the system's own
// voice (hints, labels, metadata), where its cursive italic does the talking.

export const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
});

export const mapleMono = localFont({
  variable: "--font-maple",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/maple-mono/files/maple-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/maple-mono/files/maple-mono-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../node_modules/@fontsource/maple-mono/files/maple-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/maple-mono/files/maple-mono-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
});
