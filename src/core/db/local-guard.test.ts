import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalDatabase, isLocalDatabaseUrl } from "./local-guard";

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
    "postgres://creo@/creo?host=/cloudsql/creo:us-east4:creo-prod",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});

describe("assertLocalDatabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses in production even for a local database", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertLocalDatabase("postgres://creo:creo@localhost:5432/creo_dev", "seed")).toThrow(
      /NODE_ENV is production/,
    );
  });

  it("refuses a remote database", () => {
    expect(() => assertLocalDatabase("postgres://creo:creo@10.0.0.5:5432/creo", "seed")).toThrow(
      /not on this machine/,
    );
  });
});
