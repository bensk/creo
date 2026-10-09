"use server";

import { z } from "zod";
import { staffAction } from "@/core/actions/staff-action";
import { displayName } from "@/core/ui/StudentName";
import { currentHomerooms } from "../cohorts/queries";
import { searchStudents } from "./queries";

/** Student search for the command palette. Read-only; standard fields only. */
export const searchStudentsAction = staffAction(
  { permission: "students.view", input: z.object({ query: z.string().trim().min(1).max(60) }), readOnly: true },
  async ({ tx, viewer, input }) => {
    const found = await searchStudents(tx, viewer.schoolId, input.query);
    const homerooms = await currentHomerooms(tx, found.map((s) => s.id));
    return found.map((s) => ({
      id: s.id,
      name: displayName(s),
      grade: s.grade,
      homeroom: homerooms.get(s.id) ?? null,
      enrolled: s.enrolled,
    }));
  },
);
