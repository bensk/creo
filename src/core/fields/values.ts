// Typed values staff type into fields (custom fields, tracker columns): one
// set of rules for turning what someone typed into a stored value.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ValueType = "text" | "long_text" | "number" | "date" | "boolean" | "select" | "multi_select";

/** "Permission slip (DC trip)" → "permission_slip_dc_trip" */
export function keyFromLabel(label: string): string {
  const key = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(key) ? key : `field_${key}`).slice(0, 63);
}

/**
 * Turns what someone typed (or a typed value) into the stored value for a
 * field, or explains why it isn't valid. Null clears the value.
 */
export function coerceValue(def: { type: ValueType; options: readonly string[]; label: string }, raw: unknown): Result<unknown> {
  const bad = (what: string): Result<unknown> => ({ ok: false, error: `${def.label} needs ${what}.` });
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, data: null };
  const text = typeof raw === "string" ? raw.trim() : raw;
  switch (def.type) {
    case "text":
      return typeof text === "string" && text.length <= 500 ? { ok: true, data: text } : bad("text up to 500 characters");
    case "long_text":
      return typeof text === "string" && text.length <= 5000 ? { ok: true, data: text } : bad("text up to 5,000 characters");
    case "number": {
      const n = typeof text === "number" ? text : Number(String(text).replace(/,/g, ""));
      return Number.isFinite(n) ? { ok: true, data: n } : bad("a number");
    }
    case "date":
      return typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? { ok: true, data: text } : bad("a date (YYYY-MM-DD)");
    case "boolean": {
      if (typeof text === "boolean") return { ok: true, data: text };
      const t = String(text).toLowerCase();
      if (["yes", "y", "true", "1", "sí", "si"].includes(t)) return { ok: true, data: true };
      if (["no", "n", "false", "0"].includes(t)) return { ok: true, data: false };
      return bad("yes or no");
    }
    case "select": {
      const match = def.options.find((o) => o.toLowerCase() === String(text).toLowerCase());
      return match ? { ok: true, data: match } : bad(`one of: ${def.options.join(", ")}`);
    }
    case "multi_select": {
      const parts = (Array.isArray(text) ? text : String(text).split(",")).map((p) => String(p).trim()).filter(Boolean);
      const matched = parts.map((p) => def.options.find((o) => o.toLowerCase() === p.toLowerCase()));
      if (matched.some((m) => !m)) return bad(`values from: ${def.options.join(", ")}`);
      return { ok: true, data: [...new Set(matched as string[])] };
    }
  }
}

