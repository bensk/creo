import { uuid } from "drizzle-orm/pg-core";
import { schools, users } from "../identity/schema";
import { id, timestamps } from "./columns";

export const schoolId = () =>
  uuid("school_id")
    .notNull()
    .references(() => schools.id);

export const createdBy = () =>
  uuid("created_by")
    .notNull()
    .references(() => users.id);

/** The columns every school-data table carries. */
export const base = () => ({
  id: id(),
  schoolId: schoolId(),
  ...timestamps(),
  createdBy: createdBy(),
});
