// A small RFC 4180 CSV reader for imports: quoted fields, doubled quotes,
// commas and line breaks inside quotes, CRLF / LF / CR line endings, and a
// UTF-8 byte-order mark. Errors name the line, never the content.

export interface CsvTable {
  headers: string[];
  /** One object per data row, keyed by header. Line numbers count the header as line 1. */
  rows: { line: number; values: Record<string, string> }[];
}

export class CsvError extends Error {}

export function parseCsv(text: string): CsvTable {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: { line: number; fields: string[] }[] = [];
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;

  const endRecord = () => {
    fields.push(field);
    // Skip blank lines (a single empty field).
    if (!(fields.length === 1 && fields[0] === "")) records.push({ line: recordLine, fields });
    fields = [];
    field = "";
  };

  while (i < input.length) {
    const c = input[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (c === "\n" || (c === "\r" && input[i + 1] !== "\n")) line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field !== "") throw new CsvError(`line ${line}: a quote appears in the middle of a field`);
      inQuotes = true;
      i++;
    } else if (c === ",") {
      fields.push(field);
      field = "";
      i++;
    } else if (c === "\r" || c === "\n") {
      endRecord();
      i += c === "\r" && input[i + 1] === "\n" ? 2 : 1;
      line++;
      recordLine = line;
    } else {
      field += c;
      i++;
    }
  }
  if (inQuotes) throw new CsvError(`line ${recordLine}: a quoted field is never closed`);
  if (field !== "" || fields.length > 0) endRecord();

  const [header, ...data] = records;
  if (!header) throw new CsvError("the file is empty");
  const headers = header.fields.map((h) => h.trim());
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) throw new CsvError(`the column "${h}" appears twice`);
    seen.add(h);
  }
  return {
    headers,
    rows: data.map((r) => {
      if (r.fields.length > headers.length) throw new CsvError(`line ${r.line}: more values than columns`);
      return { line: r.line, values: Object.fromEntries(headers.map((h, j) => [h, (r.fields[j] ?? "").trim()])) };
    }),
  };
}
