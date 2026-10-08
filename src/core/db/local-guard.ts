// Guards for commands that destroy or fabricate data (reset, seed). They may
// only ever touch a database on this machine.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function assertLocalDatabase(url: string, action: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Refusing to ${action}: NODE_ENV is production`);
  }
  if (!isLocalDatabaseUrl(url)) {
    throw new Error(`Refusing to ${action}: the database is not on this machine`);
  }
}
