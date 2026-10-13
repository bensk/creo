import { and, eq } from "drizzle-orm";
import { recordAudit } from "@/core/audit/record";
import { staff } from "@/core/auth/schema";
import { loadViewer, type StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { slackUserLinks } from "./schema";

// Slack users are linked to staff by their verified Workspace email, once.
// After that the link is used as is; the staff member's roles and status are
// read fresh on every request, exactly as for a session in the app.

export interface SlackProfile {
  email: string | null;
  /** Slack's is_email_confirmed. An unconfirmed email never links. */
  emailConfirmed: boolean;
  isBot: boolean;
}

export type SlackIdentity =
  | { status: "linked"; viewer: StaffViewer }
  | { status: "unlinked" }
  | { status: "no_access" };

export async function staffForSlackUser(
  db: Db,
  slackUserId: string,
  lookupProfile: () => Promise<SlackProfile | null>,
): Promise<SlackIdentity> {
  const [link] = await db
    .select({ userId: staff.userId })
    .from(slackUserLinks)
    .innerJoin(staff, eq(staff.id, slackUserLinks.staffId))
    .where(eq(slackUserLinks.slackUserId, slackUserId));
  if (link) return asIdentity(await loadViewer(db, link.userId, "staff"));

  const profile = await lookupProfile();
  if (!profile || profile.isBot || !profile.email || !profile.emailConfirmed) return { status: "unlinked" };
  const matches = await db
    .select({ id: staff.id, userId: staff.userId, schoolId: staff.schoolId })
    .from(staff)
    .where(and(eq(staff.email, profile.email), eq(staff.status, "active")));
  if (matches.length !== 1) return { status: "unlinked" };
  const person = matches[0]!;

  await db.transaction(async (tx) => {
    await tx
      .insert(slackUserLinks)
      .values({ schoolId: person.schoolId, createdBy: person.userId, staffId: person.id, slackUserId })
      .onConflictDoNothing();
    await recordAudit(tx, {
      schoolId: person.schoolId, actorUserId: person.userId, action: "slack.link_user", entity: "staff", entityId: person.id,
      after: { slackUserId }, via: "slack",
    });
  });
  return asIdentity(await loadViewer(db, person.userId, "staff"));
}

function asIdentity(viewer: Awaited<ReturnType<typeof loadViewer>>): SlackIdentity {
  if (!viewer || viewer.kind !== "staff") return { status: "unlinked" };
  return viewer.hasAccess ? { status: "linked", viewer } : { status: "no_access" };
}
