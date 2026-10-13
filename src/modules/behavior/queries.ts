import { desc, eq } from "drizzle-orm";
import { staff } from "@/core/auth/schema";
import type { Db } from "@/core/db/types";
import { behaviorEvents, behaviorTypes } from "./schema";

// Public reads for other modules (e.g. the student profile timeline).

/**
 * A student's recent behavior events, newest first. Includes the narrative,
 * which is confidential: pass each row through readForViewer("behavior_events").
 */
export async function recentBehavior(db: Db, studentId: string, limit = 30) {
  return db
    .select({
      id: behaviorEvents.id, studentId: behaviorEvents.studentId, occurredAt: behaviorEvents.occurredAt, location: behaviorEvents.location,
      points: behaviorEvents.points, narrative: behaviorEvents.narrative, typeId: behaviorEvents.typeId,
      typeLabel: behaviorTypes.label, valence: behaviorTypes.valence,
      staffName: staff.preferredName, staffGiven: staff.givenName, staffFamily: staff.familyName,
    })
    .from(behaviorEvents)
    .innerJoin(behaviorTypes, eq(behaviorTypes.id, behaviorEvents.typeId))
    .leftJoin(staff, eq(staff.id, behaviorEvents.staffId))
    .orderBy(desc(behaviorEvents.occurredAt))
    .where(eq(behaviorEvents.studentId, studentId))
    .limit(limit);
}
