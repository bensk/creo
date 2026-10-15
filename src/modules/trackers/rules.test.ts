import { describe, expect, it } from "vitest";
import { evaluateRule, holds, type Condition } from "./rules";

const c = (op: Condition["op"], value: Condition["value"] = null): Condition => ({ column: "x", op, value });

describe("rule conditions", () => {
  it.each([
    [c("is_true"), true, true], [c("is_true"), null, false], [c("is_false"), false, true],
    [c("gte", 90), "91.3", true], [c("gte", 90), 89.9, false], [c("gte", 90), null, false],
    [c("lt", 10), 3, true], [c("eq", "Done"), "done", true], [c("eq", "Bus"), ["Walker", "Bus"], true],
    [c("neq", "Done"), null, true], [c("is_empty"), "", true], [c("is_not_empty"), ["a"], true],
    [c("lte", "2026-11-01"), "2026-10-15", true], [c("gt", "2026-11-01"), "2026-10-15", false],
  ] as const)("%o on %o → %s", (cond, actual, expected) => {
    expect(holds(cond, actual)).toBe(expected);
  });

  it("passes only when every condition holds, and names what's missing", () => {
    const rule = { kind: "rule" as const, all: [{ column: "slip", op: "is_true" as const, value: null }, { column: "deposit", op: "gte" as const, value: 50 }] };
    const labels = { slip: "Permission slip", deposit: "Deposit" };
    expect(evaluateRule(rule, { slip: true, deposit: 50 }, labels)).toEqual({ pass: true, missing: [] });
    expect(evaluateRule(rule, { slip: null, deposit: 20 }, labels)).toEqual({ pass: false, missing: ["Permission slip is yes", "Deposit is at least 50"] });
  });
});
