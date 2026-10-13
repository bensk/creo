import { sql } from "drizzle-orm";
import type { FieldDef } from "@/core/query/source";

// Fields the cohorts module adds to the "students" source.
export const cohortStudentFields: FieldDef[] = [
  {
    key: "homeroom", label: "Homeroom", type: "text", sensitivity: "standard", group: "Enrollment", defaultVisible: true,
    select: (ctx) => sql`(select g.name from group_memberships gm join groups g on g.id = gm.group_id
      where gm.student_id = s.id and g.type = 'homeroom'
        and gm.starts_on <= ${ctx.today}::date and (gm.ends_on is null or gm.ends_on >= ${ctx.today}::date)
      order by gm.starts_on desc limit 1)`,
  },
];
