import type { NextConfig } from "next";

// Files named *.dev.tsx / *.dev.ts are routes only when running `next dev`.
// `next build` always runs with NODE_ENV=production, so dev-only routes (dev
// sign-in) are not compiled into a production build at all.
const devOnlyExtensions = process.env.NODE_ENV === "development" ? ["dev.tsx", "dev.ts"] : [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  pageExtensions: [...devOnlyExtensions, "tsx", "ts"],
};

export default nextConfig;
