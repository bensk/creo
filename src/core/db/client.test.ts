import { afterAll, describe, expect, it } from "vitest";
import { getSql } from "./client";

describe("database client", () => {
  afterAll(async () => {
    await getSql().end();
  });

  it("connects to the test database", async () => {
    const [row] = await getSql()<{ db: string }[]>`select current_database() as db`;
    expect(row?.db).toBe("creo_test");
  });
});
