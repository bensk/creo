import type { Directory, DirectoryUser } from "@/core/google/directory";

/** An in-memory Directory for tests. */
export function fakeDirectory(users: Partial<DirectoryUser>[] = [], groups: Record<string, string[]> = {}) {
  const all: DirectoryUser[] = users.map((u, i) => ({
    id: u.id ?? `g-${i}`, email: (u.email ?? `user${i}@creoprep.org`).toLowerCase(), givenName: u.givenName ?? "Test",
    familyName: u.familyName ?? `User${i}`, orgUnitPath: u.orgUnitPath ?? "/Staff", suspended: u.suspended ?? false,
    employeeId: u.employeeId ?? null,
  }));
  let calls = 0;
  const directory: Directory & { calls: () => number } = {
    async getUser(email) {
      calls++;
      return all.find((u) => u.email === email.toLowerCase()) ?? null;
    },
    async listUsers() {
      return [...all];
    },
    async listGroupMemberEmails(groupEmail) {
      return (groups[groupEmail.toLowerCase()] ?? []).map((e) => e.toLowerCase());
    },
    calls: () => calls,
  };
  return directory;
}
