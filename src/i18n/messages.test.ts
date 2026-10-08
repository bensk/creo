import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";

// Every family- and student-facing string ships in every language (CLAUDE.md).

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}
const load = (locale: string) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as unknown;

describe("messages", () => {
  const english = keys(load("en")).sort();

  it.each(LOCALES.filter((l) => l !== "en"))("%s has exactly the English keys", (locale) => {
    expect(keys(load(locale)).sort()).toEqual(english);
  });

  it.each(LOCALES)("%s has no empty strings", (locale) => {
    const flat = JSON.stringify(load(locale));
    expect(flat).not.toMatch(/:""/);
  });
});
