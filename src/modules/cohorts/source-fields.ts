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

const current = (alias: "gm" | "se", ctx: { today: string }) => {
  const a = sql.raw(alias);
  return sql`${a}.starts_on <= ${ctx.today}::date and (${a}.ends_on is null or ${a}.ends_on >= ${ctx.today}::date)`;
};

cohortStudentFields.push(
  {
    key: "groups", label: "Groups", type: "text_list", sensitivity: "standard", group: "Enrollment",
    select: (ctx) => sql`coalesce((select array_agg(g.name order by g.type, g.name) from group_memberships gm join groups g on g.id = gm.group_id
      where gm.student_id = s.id and g.archived_at is null and ${current("gm", ctx)}), '{}')`,
  },
  {
    key: "classes", label: "Classes", type: "text_list", sensitivity: "standard", group: "Enrollment",
    select: (ctx) => sql`coalesce((select array_agg(sec.name order by sec.period, sec.name) from section_enrollments se join sections sec on sec.id = se.section_id
      where se.student_id = s.id and sec.archived_at is null and ${current("se", ctx)}), '{}')`,
  },
);
