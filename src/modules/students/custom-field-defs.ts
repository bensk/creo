import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/core/db/types";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import { customFieldDefinitions, type CUSTOM_FIELD_TYPES } from "./schema";

// Reading custom field definitions. Kept free of permission imports so the
// students query source can load it without an import cycle.

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDef {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  sensitivity: Sensitivity;
  helpText: string | null;
  position: number;
  archived: boolean;
}


export async function listCustomFields(db: Db, schoolId: string, options: { includeArchived?: boolean } = {}): Promise<CustomFieldDef[]> {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.schoolId, schoolId),
      eq(customFieldDefinitions.entity, "students"),
      options.includeArchived ? undefined : isNull(customFieldDefinitions.archivedAt),
    ))
    .orderBy(asc(customFieldDefinitions.position), asc(customFieldDefinitions.label));
  return rows.map((r) => ({
    id: r.id, key: r.key, label: r.label, type: r.type as CustomFieldType, options: (r.options as string[]) ?? [],
    required: r.required, sensitivity: r.sensitivity as Sensitivity, helpText: r.helpText, position: r.position,
    archived: r.archivedAt !== null,
  }));
}
