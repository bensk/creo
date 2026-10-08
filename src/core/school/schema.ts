import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { base } from "../db/base";

export const schoolYears = pgTable(
  "school_years",
  {
    ...base(),
    label: text("label").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
  },
  (t) => [
    uniqueIndex("school_years_school_label_idx").on(t.schoolId, t.label),
    index("school_years_created_by_idx").on(t.createdBy),
    check("school_years_dates_check", sql`${t.endsOn} > ${t.startsOn}`),
  ],
);
