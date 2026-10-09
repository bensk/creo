// Read-only access to a Notion data source (database), through an internal
// integration that has only "Read content". The importer depends on this
// interface; tests use an in-memory fake.

/** A property value flattened to plain data. Unknown types come through as null. */
export type NotionValue = string | number | boolean | string[] | { start: string; end: string | null } | null;

export interface NotionPage {
  id: string;
  properties: Record<string, NotionValue>;
}

export interface NotionSource {
  listPages(): Promise<NotionPage[]>;
}

const NOTION_VERSION = "2025-09-03";

type RawProperty = { type: string } & Record<string, unknown>;

/** Flattens one Notion property object. Exported for tests. */
export function flattenProperty(p: RawProperty): NotionValue {
  const text = (parts: unknown) =>
    Array.isArray(parts) ? parts.map((r) => (r as { plain_text?: string }).plain_text ?? "").join("").trim() || null : null;
  switch (p.type) {
    case "title":
    case "rich_text":
      return text(p[p.type]);
    case "select":
    case "status":
      return (p[p.type] as { name?: string } | null)?.name ?? null;
    case "multi_select":
      return ((p.multi_select as { name: string }[] | null) ?? []).map((o) => o.name);
    case "number":
      return (p.number as number | null) ?? null;
    case "checkbox":
      return Boolean(p.checkbox);
    case "date": {
      const d = p.date as { start: string; end: string | null } | null;
      return d ? { start: d.start, end: d.end } : null;
    }
    case "email":
    case "phone_number":
    case "url":
      return (p[p.type] as string | null) ?? null;
    default:
      return null;
  }
}

/** The real source, via the Notion REST API. */
export function notionDataSource(options: { token: string; dataSourceId: string }): NotionSource {
  return {
    async listPages() {
      const pages: NotionPage[] = [];
      let cursor: string | undefined;
      do {
        const res = await fetch(`https://api.notion.com/v1/data_sources/${options.dataSourceId}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        });
        // Status only: Notion error bodies can echo request content.
        if (!res.ok) throw new Error(`Notion query failed with status ${res.status}`);
        const body = (await res.json()) as {
          results: { id: string; properties: Record<string, RawProperty> }[];
          has_more: boolean;
          next_cursor: string | null;
        };
        for (const r of body.results) {
          pages.push({
            id: r.id,
            properties: Object.fromEntries(Object.entries(r.properties).map(([k, v]) => [k, flattenProperty(v)])),
          });
        }
        cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
      } while (cursor);
      return pages;
    },
  };
}
