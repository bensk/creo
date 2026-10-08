import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Viewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { aiGrants } from "./schema";
import type { AiFeature } from "./features";

export interface AiAvailability {
  /** AI_ENABLED is not "false". */
  switchedOn: boolean;
  /** An API key is configured. Without one the app runs with no AI at all. */
  configured: boolean;
}

export function aiAvailability(env: NodeJS.ProcessEnv = process.env): AiAvailability {
  return { switchedOn: env.AI_ENABLED !== "false", configured: Boolean(env.ANTHROPIC_API_KEY) };
}

type GrantRow = { effect: string; features: string[] | null; userId: string | null };

const covers = (row: GrantRow, feature: AiFeature) => row.features === null || row.features.includes(feature);

/**
 * Whether a viewer may use one AI feature. Rules, in order:
 *   1. AI_ENABLED=false, or no API key: nobody.
 *   2. Students and families: never.
 *   3. The viewer's own grant/revoke rows that cover the feature decide (revoke beats grant).
 *   4. Otherwise rows for any of the viewer's roles decide (revoke beats grant).
 *   5. Otherwise: no.
 * Ended rows (ended_at set) are ignored.
 */
export async function isEnabledFor(
  db: Db,
  viewer: Viewer,
  feature: AiFeature,
  availability: AiAvailability = aiAvailability(),
): Promise<boolean> {
  if (!availability.switchedOn || !availability.configured) return false;
  if (viewer.kind !== "staff" || !viewer.hasAccess) return false;

  const rows: GrantRow[] = await db
    .select({ effect: aiGrants.effect, features: aiGrants.features, userId: aiGrants.userId })
    .from(aiGrants)
    .where(
      and(
        eq(aiGrants.schoolId, viewer.schoolId),
        isNull(aiGrants.endedAt),
        or(eq(aiGrants.userId, viewer.userId), viewer.roles.length ? inArray(aiGrants.role, viewer.roles) : undefined),
      ),
    );

  const decide = (level: GrantRow[]) => {
    const applicable = level.filter((r) => covers(r, feature));
    if (applicable.some((r) => r.effect === "revoke")) return false;
    if (applicable.some((r) => r.effect === "grant")) return true;
    return undefined;
  };
  return decide(rows.filter((r) => r.userId !== null)) ?? decide(rows.filter((r) => r.userId === null)) ?? false;
}
