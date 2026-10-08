import { describe, expect, it } from "vitest";
import { assertLocalDatabase, isLocalDatabaseUrl } from "./local-guard";

const dev = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

describe("isLocalDatabaseUrl", () => {
  it.each([
    "postgres://creo:creo@localhost:5432/creo_dev",
    "postgres://creo:creo@127.0.0.1:5432/creo_dev",
    "postgres://creo:creo@[::1]:5432/creo_dev",
    "postgres://creo:creo@postgres:5432/creo_dev",
  ])("accepts %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    "postgres://creo:creo@10.0.0.5:5432/creo",
    "postgres://creo:creo@db.creoprep.org:5432/creo",
    "postgres://creo:creo@localhost.evil.example:5432/creo",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});

describe("assertLocalDatabase", () => {
  it("allows the local dev and test databases", () => {
    expect(() => assertLocalDatabase("postgres://creo:creo@localhost:5432/creo_dev", "seed", dev)).not.toThrow();
    expect(() => assertLocalDatabase("postgres://creo:creo@localhost:5432/creo_test", "seed", dev)).not.toThrow();
  });

  it("refuses production even through a Cloud SQL proxy on localhost", () => {
    expect(() => assertLocalDatabase("postgres://creo:pw@localhost:5432/creo", "seed", dev)).toThrow(/not a development, test, or staging/);
    expect(() => assertLocalDatabase("postgres://creo:pw@127.0.0.1:6543/creo", "seed", dev)).toThrow(/not a development/);
  });

  it("refuses a dev-named database that isn't local", () => {
    expect(() => assertLocalDatabase("postgres://creo:creo@10.0.0.5:5432/creo_dev", "seed", dev)).toThrow(/not on this machine/);
  });

  it("allows staging only with the typed confirmation", () => {
    const url = "postgres://creo:pw@localhost:5432/creo_staging";
    expect(() => assertLocalDatabase(url, "seed", dev)).toThrow(/SEED_STAGING_CONFIRM=creo_staging/);
    expect(() => assertLocalDatabase(url, "seed", { ...dev, SEED_STAGING_CONFIRM: "creo" })).toThrow();
    expect(() => assertLocalDatabase(url, "seed", { ...dev, SEED_STAGING_CONFIRM: "creo_staging" })).not.toThrow();
  });

  it("refuses everything when NODE_ENV is production", () => {
    expect(() => assertLocalDatabase("postgres://creo:creo@localhost:5432/creo_dev", "seed", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/NODE_ENV is production/);
  });
});
