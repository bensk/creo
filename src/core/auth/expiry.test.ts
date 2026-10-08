import { describe, expect, it } from "vitest";
import { sessionExpiry } from "./expiry";

const NY = "America/New_York";

describe("sessionExpiry", () => {
  it("gives staff 7 days and families 30 days", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(sessionExpiry("staff", now, NY).toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(sessionExpiry("family", now, NY).toISOString()).toBe("2026-11-07T12:00:00.000Z");
  });

  it("ends a student session at 6 pm New York time", () => {
    // 8:05 am EDT
    expect(sessionExpiry("student", new Date("2026-10-08T12:05:00Z"), NY).toISOString()).toBe(
      "2026-10-08T22:00:00.000Z",
    );
    // In winter (EST) 6 pm is 23:00 UTC
    expect(sessionExpiry("student", new Date("2026-12-08T13:05:00Z"), NY).toISOString()).toBe(
      "2026-12-08T23:00:00.000Z",
    );
  });

  it("lets an evening student session last until 11:59 pm", () => {
    // 8 pm EDT
    expect(sessionExpiry("student", new Date("2026-10-09T00:00:00Z"), NY).toISOString()).toBe(
      "2026-10-09T03:59:00.000Z",
    );
  });
});
