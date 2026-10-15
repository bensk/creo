import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Files named *.dev.tsx / *.dev.ts are routes only when running `next dev`.
// `next build` always runs with NODE_ENV=production, so dev-only routes (dev
// sign-in) are not compiled into a production build at all.
const devOnlyExtensions = process.env.NODE_ENV === "development" ? ["dev.tsx", "dev.ts"] : [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  pageExtensions: [...devOnlyExtensions, "tsx", "ts"],
  // Keep the dev badge clear of the sidebar's account controls (bottom left).
  devIndicators: { position: "bottom-right" },
  // Clever roster uploads (six CSV files) and name recordings go through server actions.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
