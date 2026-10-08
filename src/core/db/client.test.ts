import { afterAll, describe, expect, it } from "vitest";
import { getSql } from "./client";

describe("database client", () => {
  afterAll(async () => {
    await getSql().end();
  });

  it("connects to the test database as the app role", async () => {
    const [row] = await getSql()<{ db: string; role: string }[]>`
      select current_database() as db, current_user as role`;
    expect(row).toEqual({ db: "creo_test", role: "creo_app" });
  });
});
