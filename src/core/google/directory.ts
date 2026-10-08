import { JWT } from "google-auth-library";

// Read-only access to the Google Workspace Directory (Admin SDK). Used by
// Directory sync (staff, roles from Google Groups) and by student sign-in (is
// this account in the /students OU?). Everything else talks to this interface,
// so tests use a fake.

export interface DirectoryUser {
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  orgUnitPath: string;
  suspended: boolean;
}

export interface Directory {
  getUser(email: string): Promise<DirectoryUser | null>;
  /** Every user in the Workspace, students included. */
  listUsers(): Promise<DirectoryUser[]>;
  /** Email addresses of a group's members, including members of nested groups. */
  listGroupMemberEmails(groupEmail: string): Promise<string[]>;
}

/** Whether an OU path is the students OU or one of its graduation-year sub-OUs. */
export function isStudentOrgUnit(orgUnitPath: string): boolean {
  const path = orgUnitPath.toLowerCase();
  return path === "/students" || path.startsWith("/students/");
}

const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
];
const API = "https://admin.googleapis.com/admin/directory/v1";

interface ApiUser {
  id: string;
  primaryEmail: string;
  name?: { givenName?: string; familyName?: string };
  orgUnitPath?: string;
  suspended?: boolean;
}

const toUser = (u: ApiUser): DirectoryUser => ({
  id: u.id,
  email: u.primaryEmail.toLowerCase(),
  givenName: u.name?.givenName ?? "",
  familyName: u.name?.familyName ?? "",
  orgUnitPath: u.orgUnitPath ?? "/",
  suspended: Boolean(u.suspended),
});

/**
 * The real Directory, through a service account with domain-wide delegation
 * acting as a Workspace admin (read-only scopes only).
 */
export function googleDirectory(options: { credentialsJson: string; adminEmail: string }): Directory {
  const key = JSON.parse(options.credentialsJson) as { client_email: string; private_key: string };
  const client = new JWT({ email: key.client_email, key: key.private_key, scopes: SCOPES, subject: options.adminEmail });

  async function get<T>(url: string): Promise<T> {
    const res = await client.request<T>({ url, method: "GET" });
    return res.data;
  }

  return {
    async getUser(email) {
      try {
        return toUser(await get<ApiUser>(`${API}/users/${encodeURIComponent(email)}?projection=basic`));
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
    async listUsers() {
      const users: DirectoryUser[] = [];
      let pageToken: string | undefined;
      do {
        const page = await get<{ users?: ApiUser[]; nextPageToken?: string }>(
          `${API}/users?customer=my_customer&projection=basic&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`,
        );
        users.push(...(page.users ?? []).map(toUser));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return users;
    },
    async listGroupMemberEmails(groupEmail) {
      const emails: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await get<{ members?: { email?: string; type?: string }[]; nextPageToken?: string }>(
          `${API}/groups/${encodeURIComponent(groupEmail)}/members?includeDerivedMembership=true&maxResults=200${pageToken ? `&pageToken=${pageToken}` : ""}`,
        );
        for (const m of page.members ?? []) if (m.type === "USER" && m.email) emails.push(m.email.toLowerCase());
        pageToken = page.nextPageToken;
      } while (pageToken);
      return [...new Set(emails)];
    },
  };
}

let cached: Directory | null | undefined;

/** The configured Directory, or null when GOOGLE_DIRECTORY_CREDENTIALS / GOOGLE_DIRECTORY_ADMIN aren't set. */
export function directoryFromEnv(): Directory | null {
  if (cached !== undefined) return cached;
  const credentialsJson = process.env.GOOGLE_DIRECTORY_CREDENTIALS;
  const adminEmail = process.env.GOOGLE_DIRECTORY_ADMIN;
  cached = credentialsJson && adminEmail ? withUserCache(googleDirectory({ credentialsJson, adminEmail })) : null;
  return cached;
}

/** Caches getUser for a few minutes so a burst of student sign-ins doesn't hammer the Admin SDK. */
export function withUserCache(directory: Directory, ttlMs = 5 * 60_000): Directory {
  const cache = new Map<string, { at: number; user: DirectoryUser | null }>();
  return {
    ...directory,
    async getUser(email) {
      const key = email.toLowerCase();
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.user;
      const user = await directory.getUser(key);
      cache.set(key, { at: Date.now(), user });
      return user;
    },
  };
}
