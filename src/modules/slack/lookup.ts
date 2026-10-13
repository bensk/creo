import { z } from "zod";
import { runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { Forbidden } from "@/core/permissions";
import { currentHomerooms } from "../cohorts/queries";
import { searchStudents } from "../students/queries";
import { studentCardBlocks } from "./blocks";

const SHOWN = 5;
const lookupInput = z.object({ query: z.string().trim().min(1).max(60) });

/**
 * `/student <name>`: up to five matches, standard fields only, shown only to
 * the person who asked (ephemeral). The lookup is audited with via: slack.
 */
export async function studentLookup(db: Db, viewer: StaffViewer, query: string, appUrl: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { text: "Type a name after /student, for example: /student Cami", blocks: undefined };
  }
  try {
    return await runStaffAction(
      db, viewer,
      { permission: "students.view", input: lookupInput },
      async ({ tx, input, audit }) => {
        const found = await searchStudents(tx, viewer.schoolId, input.query, SHOWN + 1);
        const shown = found.slice(0, SHOWN);
        const homerooms = await currentHomerooms(tx, shown.map((s) => s.id));
        await audit({ action: "slack.student_lookup", entity: "students", after: { shown: shown.map((s) => s.id) } });
        const cards = shown.map((s) => ({
          id: s.id, phonetic: s.phonetic, grade: s.grade, enrolled: s.enrolled, homeroom: homerooms.get(s.id) ?? null,
          name: { legalFirstName: s.legalFirstName, legalLastName: s.legalLastName, preferredFirstName: s.preferredFirstName, preferredLastName: s.preferredLastName },
        }));
        const text = found.length === 0 ? "No matches" : `${shown.length}${found.length > SHOWN ? "+" : ""} ${shown.length === 1 ? "match" : "matches"}`;
        return { text, blocks: studentCardBlocks(appUrl, cards, found.length > SHOWN, input.query) };
      },
      { query: trimmed.slice(0, 60) },
      "slack",
    );
  } catch (error) {
    if (error instanceof Forbidden) return { text: "Your SIS role can't look up students.", blocks: undefined };
    throw error;
  }
}
