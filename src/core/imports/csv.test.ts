import { describe, expect, it } from "vitest";
import { CsvError, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads quotes, commas, and line breaks inside quotes", () => {
    const t = parseCsv('A,B,C\r\n1,"two, three","say ""hi"""\n"multi\nline",x,\r\n');
    expect(t.headers).toEqual(["A", "B", "C"]);
    expect(t.rows).toEqual([
      { line: 2, values: { A: "1", B: "two, three", C: 'say "hi"' } },
      { line: 3, values: { A: "multi\nline", B: "x", C: "" } },
    ]);
  });

  it("handles a byte-order mark, CR line endings, blank lines, and short rows", () => {
    const t = parseCsv("﻿A,B\r1,2\r\r3\r");
    expect(t.headers).toEqual(["A", "B"]);
    expect(t.rows.map((r) => r.values)).toEqual([{ A: "1", B: "2" }, { A: "3", B: "" }]);
  });

  it("names the line for errors, never the content", () => {
    expect(() => parseCsv('A\n"open')).toThrow(/line 2/);
    expect(() => parseCsv("A,B\n1,2,3")).toThrow(/line 2: more values than columns/);
    expect(() => parseCsv("A,A\n1,2")).toThrow(CsvError);
    expect(() => parseCsv("")).toThrow(/empty/);
  });
});
