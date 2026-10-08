import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { allTables } from "./all-tables";

// Schema conventions from CLAUDE.md, checked for every table so a new module
// can't quietly skip them.

const WITHOUT_SCHOOL_ID = new Set(["schools"]);
// Append-only logs record actor_user_id; sessions are created by their own user.
const WITHOUT_CREATED_BY = new Set(["schools", "audit_log", "sensitive_reads", "sessions"]);

const tables = allTables().map((table) => getTableConfig(table));

describe("schema conventions", () => {
  it("finds every table", () => {
    expect(tables.length).toBeGreaterThanOrEqual(17);
  });

  it.each(tables.map((t) => [t.name, t] as const))("%s has a uuid primary key named id", (_, t) => {
    const idColumn = t.columns.find((c) => c.name === "id");
    expect(idColumn?.primary).toBe(true);
    expect(idColumn?.getSQLType()).toBe("uuid");
  });

  it.each(tables.filter((t) => !WITHOUT_SCHOOL_ID.has(t.name)).map((t) => [t.name, t] as const))(
    "%s carries a non-null school_id",
    (_, t) => {
      expect(t.columns.find((c) => c.name === "school_id")?.notNull).toBe(true);
    },
  );

  it.each(tables.filter((t) => !WITHOUT_CREATED_BY.has(t.name)).map((t) => [t.name, t] as const))(
    "%s carries non-null created_by, created_at, updated_at",
    (_, t) => {
      for (const name of ["created_by", "created_at", "updated_at"]) {
        expect(t.columns.find((c) => c.name === name)?.notNull, name).toBe(true);
      }
    },
  );

  it.each(tables.map((t) => [t.name, t] as const))("%s indexes every foreign key column", (_, t) => {
    // A column is covered if it leads some index (or is unique / the primary key).
    const leading = new Set<string>();
    for (const index of t.indexes) {
      const first = index.config.columns[0];
      if (first && "name" in first && typeof first.name === "string") leading.add(first.name);
    }
    for (const column of t.columns) {
      if (column.isUnique || column.primary) leading.add(column.name);
    }
    const unindexed = t.foreignKeys
      .flatMap((fk) => fk.reference().columns.map((c) => c.name))
      .filter((name) => !leading.has(name));
    expect(unindexed).toEqual([]);
  });
});
