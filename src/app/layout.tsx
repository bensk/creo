import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { parseTheme, THEME_COOKIE } from "@/core/ui/theme";
import { inter, mapleMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Creo SIS", template: "%s · Creo SIS" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      className={`${inter.variable} ${mapleMono.variable}`}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {/* Overlay editors from the data grid render here. */}
        <div id="portal" className="fixed left-0 top-0 z-[60]" />
      </body>
    </html>
  );
}
