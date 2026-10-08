import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache, serverEnv } from "./index";

const DB = "postgres://creo_app:creo_app@localhost:5432/creo_dev";

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCache();
  });

  function load(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    resetServerEnvCache();
    return serverEnv();
  }

  it.each(["true", "false"])("refuses to start in production with DEV_SIGN_IN=%s", (value) => {
    expect(() => load({ NODE_ENV: "production", DATABASE_URL: DB, DEV_SIGN_IN: value })).toThrow(
      /DEV_SIGN_IN must not be set in production/,
    );
  });

  it("starts in production without DEV_SIGN_IN", () => {
    expect(load({ NODE_ENV: "production", DATABASE_URL: DB, DEV_SIGN_IN: undefined }).NODE_ENV).toBe("production");
  });

  it("allows DEV_SIGN_IN in development", () => {
    expect(load({ NODE_ENV: "development", DATABASE_URL: DB, DEV_SIGN_IN: "true" }).DEV_SIGN_IN).toBe("true");
  });

  it("names a missing variable without printing values", () => {
    expect(() => load({ NODE_ENV: "development", DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
