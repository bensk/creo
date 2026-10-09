import { SEED_HISTORY_THROUGH, schoolDays, type SeedBatch, type SeedContext, type StudentPlacement } from "../../core/seed/types";
import { behaviorEvents, behaviorTypes } from "./schema";

// Configurable data, seeded: the five schoolwide skills as positives, plus common negatives.
const TYPES = [
  { label: "Perseverance", valence: "positive", points: 2, skill: "perseverance" },
  { label: "Respect", valence: "positive", points: 2, skill: "respect" },
  { label: "Integrity", valence: "positive", points: 2, skill: "integrity" },
  { label: "Self-control", valence: "positive", points: 2, skill: "self-control" },
  { label: "Empathy", valence: "positive", points: 2, skill: "empathy" },
  { label: "Off task", valence: "negative", points: -1, skill: "self-control" },
  { label: "Out of area", valence: "negative", points: -1, skill: "integrity" },
  { label: "Phone out", valence: "negative", points: -2, skill: "self-control" },
  { label: "Disrespect toward staff", valence: "negative", points: -3, skill: "respect", requiresFollowup: true },
  { label: "Unsafe behavior", valence: "negative", points: -5, skill: "self-control", requiresFollowup: true },
] as const;

const LOCATIONS = ["Classroom", "Classroom", "Classroom", "Hallway", "Cafeteria", "Gym", "Dismissal"];
const NARRATIVES = [
  "Talked over the teacher during the mini-lesson after two reminders.",
  "Left the classroom without a pass and was found in the stairwell.",
  "Used a phone during independent work and would not put it away.",
  "Raised voice at a staff member when asked to move seats.",
  "Pushed a classmate in line at dismissal.",
];

/** Behavior types and about a month of events: mostly positive, some negative, a few with narratives. */
export function buildBehaviorSeed(ctx: SeedContext, placements: readonly StudentPlacement[]): SeedBatch[] {
  const { rng } = ctx;
  const by = { schoolId: ctx.schoolId, createdBy: ctx.systemUserId };
  const types = TYPES.map((t, i) => ({
    id: rng.uuid(), ...by, label: t.label, valence: t.valence, points: t.points, skill: t.skill,
    requiresFollowup: "requiresFollowup" in t ? t.requiresFollowup : false, position: i,
  }));
  const positives = types.filter((t) => t.valence === "positive");
  const negatives = types.filter((t) => t.valence === "negative");
  const days = schoolDays(ctx.yearStartsOn, SEED_HISTORY_THROUGH);
  const teachersByGrade = new Map<number, string[]>();
  for (const s of ctx.staff) {
    if (s.gradeTeam) teachersByGrade.set(s.gradeTeam.grade, [...(teachersByGrade.get(s.gradeTeam.grade) ?? []), s.id]);
  }

  const events: Record<string, unknown>[] = [];
  for (const p of placements) {
    const count = rng.int(0, 8);
    const struggling = rng.chance(0.15);
    for (let i = 0; i < count; i++) {
      const negative = rng.chance(struggling ? 0.55 : 0.2);
      const type = rng.pick(negative ? negatives : positives);
      const day = rng.pick(p.withdrawnOn ? days.filter((d) => d <= p.withdrawnOn!) : days);
      // 8:00 a.m.–3:00 p.m. New York (EDT, UTC−4) in September and October.
      const minutes = rng.int(8 * 60, 15 * 60);
      const occurredAt = new Date(Date.parse(`${day}T00:00:00Z`) + (minutes + 240) * 60_000);
      events.push({
        id: rng.uuid(), ...by, studentId: p.studentId, typeId: type.id, occurredAt, location: rng.pick(LOCATIONS),
        staffId: rng.pick(teachersByGrade.get(p.grade) ?? [null]), points: type.points,
        narrative: negative && rng.chance(0.4) ? rng.pick(NARRATIVES) : null, source: "sis",
      });
    }
  }
  return [
    { table: behaviorTypes, rows: types },
    { table: behaviorEvents, rows: events },
  ];
}
