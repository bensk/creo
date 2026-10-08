import { HOMEROOMS } from "../../core/seed/names";
import { GRADES, type SeedBatch, type SeedContext, type StudentPlacement } from "../../core/seed/types";
import { groupMemberships, groups, groupStaff } from "./schema";

const TRANSFER_COUNT = 2;
const TRANSFER_LAST_DAY = "2026-10-02"; // a Friday
const TRANSFER_FIRST_DAY = "2026-10-05"; // the next Monday

export function buildCohortsSeed(ctx: SeedContext, placements: readonly StudentPlacement[]): SeedBatch[] {
  const { rng } = ctx;
  const by = { schoolId: ctx.schoolId, createdBy: ctx.systemUserId };

  const homeroomTeacher = new Map(ctx.staff.flatMap((s) => (s.homeroom ? [[s.homeroom, s.id] as const] : [])));
  const groupRows: Record<string, unknown>[] = [];
  const homeroomIds = new Map<string, string>();
  const teamIds = new Map<number, string>();

  for (const grade of GRADES) {
    for (const name of HOMEROOMS[grade]) {
      const id = rng.uuid();
      homeroomIds.set(name, id);
      groupRows.push({
        id, ...by, schoolYearId: ctx.schoolYearId, type: "homeroom", name, gradeLevel: grade,
        ownerStaffId: homeroomTeacher.get(name) ?? null,
      });
    }
    const teamId = rng.uuid();
    teamIds.set(grade, teamId);
    const lead = ctx.staff.find((s) => s.gradeTeam?.grade === grade && s.gradeTeam.lead);
    groupRows.push({
      id: teamId, ...by, schoolYearId: ctx.schoolYearId, type: "grade_team", name: `Grade ${grade} Team`,
      gradeLevel: grade, ownerStaffId: lead?.id ?? null, googleGroupEmail: `team-${grade}@creoprep.org`,
    });
  }

  // Two generated students switched homerooms (same grade) in October.
  const transfers = new Set(
    rng.shuffle(placements.filter((p) => !p.fixed && !p.withdrawnOn)).slice(0, TRANSFER_COUNT).map((p) => p.studentId),
  );

  const memberships: Record<string, unknown>[] = [];
  const member = (groupId: string, studentId: string, startsOn: string, endsOn: string | null) =>
    memberships.push({ id: rng.uuid(), ...by, groupId, studentId, startsOn, endsOn });

  for (const p of placements) {
    const endsOn = p.withdrawnOn ?? null;
    if (transfers.has(p.studentId)) {
      const next = rng.pick(HOMEROOMS[p.grade].filter((h) => h !== p.homeroom));
      member(homeroomIds.get(p.homeroom)!, p.studentId, ctx.yearStartsOn, TRANSFER_LAST_DAY);
      member(homeroomIds.get(next)!, p.studentId, TRANSFER_FIRST_DAY, endsOn);
    } else {
      member(homeroomIds.get(p.homeroom)!, p.studentId, ctx.yearStartsOn, endsOn);
    }
    member(teamIds.get(p.grade)!, p.studentId, ctx.yearStartsOn, endsOn);
  }

  const staffRows: Record<string, unknown>[] = [];
  for (const s of ctx.staff) {
    if (s.homeroom) {
      staffRows.push({
        id: rng.uuid(), ...by, groupId: homeroomIds.get(s.homeroom)!, staffId: s.id,
        function: "homeroom_teacher", startsOn: ctx.yearStartsOn,
      });
    }
    if (s.gradeTeam) {
      staffRows.push({
        id: rng.uuid(), ...by, groupId: teamIds.get(s.gradeTeam.grade)!, staffId: s.id,
        function: s.gradeTeam.lead ? "lead" : "member", startsOn: ctx.yearStartsOn,
      });
    }
  }

  return [
    { table: groups, rows: groupRows },
    { table: groupMemberships, rows: memberships },
    { table: groupStaff, rows: staffRows },
  ];
}
