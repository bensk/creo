// Guards for commands that destroy or fabricate data (reset, seed, minting
// load-test sessions). The database NAME is the real safeguard: a Cloud SQL
// proxy makes production look like localhost, so a host check alone is not enough.
//   - creo_dev and *_test: always allowed (local development and tests)
//   - *_staging: allowed only with SEED_STAGING_CONFIRM set to the database name
//   - anything else (production is "creo"): refused

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function databaseName(url: string): string | null {
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

/** Throws unless this database may be wiped and filled with synthetic data. */
export function assertLocalDatabase(url: string, action: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error(`Refusing to ${action}: NODE_ENV is production`);
  }
  const name = databaseName(url);
  if (!name) throw new Error(`Refusing to ${action}: can't read the database name`);
  if (name === "creo_dev" || name.endsWith("_test")) {
    if (!isLocalDatabaseUrl(url)) throw new Error(`Refusing to ${action}: the database is not on this machine`);
    return;
  }
  if (name.endsWith("_staging")) {
    if (env.SEED_STAGING_CONFIRM === name) return;
    throw new Error(`Refusing to ${action} on ${name}: set SEED_STAGING_CONFIRM=${name} to confirm`);
  }
  throw new Error(`Refusing to ${action}: "${name}" is not a development, test, or staging database`);
}

/**
 * Throws unless this database may receive REAL student data: never a dev,
 * test, or staging database, and never one marked synthetic by the seed. The
 * opposite of assertLocalDatabase; importers call it before writing anything.
 */
export function assertRealDataDatabase(url: string, action: string, isSynthetic: boolean): void {
  const name = databaseName(url);
  if (!name) throw new Error(`Refusing to ${action}: can't read the database name`);
  if (name === "creo_dev" || /_(dev|test|staging)$/.test(name)) {
    throw new Error(`Refusing to ${action}: "${name}" holds synthetic data only; real student data never goes there`);
  }
  if (isSynthetic) throw new Error(`Refusing to ${action}: this database is marked synthetic`);
}
