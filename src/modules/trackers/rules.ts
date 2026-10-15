import { z } from "zod";

// Rule columns: a yes/no answer worked out from the tracker's own columns,
// e.g. eligible for the trip = permission slip is yes AND deposit is at least
// 50 AND attendance rate is at least 90. Every condition must hold. When the
// answer is no, the cell says which conditions weren't met.

export const RULE_OPS = ["is_true", "is_false", "eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"] as const;
export type RuleOp = (typeof RULE_OPS)[number];

export const conditionSchema = z.object({
  column: z.string().min(1).max(80),
  op: z.enum(RULE_OPS),
  value: z.union([z.string().max(200), z.number(), z.boolean()]).nullable().default(null),
});
export type Condition = z.infer<typeof conditionSchema>;

export const ruleFieldSchema = z.object({
  type: z.literal("rule"),
  label: z.string().trim().min(1).max(80),
  all: z.array(conditionSchema).min(1).max(10),
});
export type RuleField = z.infer<typeof ruleFieldSchema>;

/** How a rule is stored in tracker_fields.computed (type "computed"). */
export interface StoredRule {
  kind: "rule";
  all: Condition[];
}

export const isStoredRule = (computed: unknown): computed is StoredRule =>
  typeof computed === "object" && computed !== null && (computed as { kind?: unknown }).kind === "rule";

const OP_TEXT: Record<RuleOp, string> = {
  is_true: "is yes", is_false: "is no", eq: "is", neq: "is not", gt: "is more than", gte: "is at least",
  lt: "is less than", lte: "is at most", is_empty: "is empty", is_not_empty: "is filled in",
};
export const NEEDS_VALUE: ReadonlySet<RuleOp> = new Set(["eq", "neq", "gt", "gte", "lt", "lte"]);

export function describeCondition(c: Condition, label: string): string {
  return `${label} ${OP_TEXT[c.op]}${NEEDS_VALUE.has(c.op) && c.value !== null ? ` ${String(c.value)}` : ""}`;
}

const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const asNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : NaN);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function compare(actual: unknown, expected: unknown): number | null {
  if (isDate(actual) && isDate(expected)) return (actual as string).localeCompare(expected as string);
  const a = asNumber(actual);
  const b = asNumber(expected);
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
}

function same(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((x) => same(x, expected));
  if (typeof actual === "boolean") return actual === (expected === true || /^(y|yes|true)$/i.test(String(expected)));
  const n = compare(actual, expected);
  if (n !== null && typeof actual !== "string") return n === 0;
  return String(actual ?? "").trim().toLowerCase() === String(expected ?? "").trim().toLowerCase();
}

export function holds(c: Condition, actual: unknown): boolean {
  switch (c.op) {
    case "is_true": return actual === true || (typeof actual === "string" && /^(y|yes|true)$/i.test(actual));
    case "is_false": return actual === false || (typeof actual === "string" && /^(n|no|false)$/i.test(actual));
    case "is_empty": return empty(actual);
    case "is_not_empty": return !empty(actual);
    case "eq": return !empty(actual) && same(actual, c.value);
    case "neq": return empty(actual) || !same(actual, c.value);
    default: {
      if (empty(actual)) return false;
      const n = compare(actual, c.value);
      if (n === null) return false;
      return c.op === "gt" ? n > 0 : c.op === "gte" ? n >= 0 : c.op === "lt" ? n < 0 : n <= 0;
    }
  }
}

export interface RuleResult {
  pass: boolean;
  /** Descriptions of the conditions that weren't met. */
  missing: string[];
}

export function evaluateRule(rule: StoredRule, values: Record<string, unknown>, labels: Record<string, string>): RuleResult {
  const missing = rule.all.filter((c) => !holds(c, values[c.column])).map((c) => describeCondition(c, labels[c.column] ?? c.column));
  return { pass: missing.length === 0, missing };
}
