"use server";

import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import type { QuerySpecInput } from "@/core/query/spec";
import { deleteStudentView, listStudentViews, queryStudents, saveStudentView, updateStudentCell, type cellInput, type viewInput } from "./grid";
import type { z } from "zod";

// Thin server-action wrappers: session first, then the tested logic in grid.ts.

export async function queryStudentsAction(spec: QuerySpecInput) {
  return queryStudents(getDb(), await requireViewer("staff"), spec);
}

export async function updateStudentCellAction(input: z.input<typeof cellInput>) {
  return updateStudentCell(getDb(), await requireViewer("staff"), input);
}

export async function listStudentViewsAction() {
  return listStudentViews(getDb(), await requireViewer("staff"));
}

export async function saveStudentViewAction(input: z.input<typeof viewInput>) {
  return saveStudentView(getDb(), await requireViewer("staff"), input);
}

export async function deleteStudentViewAction(id: string) {
  return deleteStudentView(getDb(), await requireViewer("staff"), id);
}
