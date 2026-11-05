import type { EntityRow } from "@/features/whiteboard/types/whiteboard.types";

/**
 * Entity rows as text, for diagram code and the AI: `id int pk; email text uq; team_id int fk -> teams.id; note text nullable`.
 * A row is a name, then an optional type, then any of `pk`, `fk`, `uq`, `nullable`, then an optional `-> table.column`.
 * The writer is canonical, so the same rows always give the same text.
 */
const KEYS = new Set(["pk", "fk", "uq"]);

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "col";

/** SQL-style constraint lines a model may write among the rows: `primary key (a, b)`, `foreign key (x) references t(y)`. */
const PRIMARY = /^\s*primary\s+key\s*\(([^)]*)\)/i;
const FOREIGN = /^\s*foreign\s+key\s*\(?\s*([\w.]+)\s*\)?\s*(?:references\s+([\w.]+)\s*(?:\(\s*([\w.]+)\s*\))?)?/i;

export const parseRows = (text: string | undefined): EntityRow[] => {
  if (!text) return [];
  // Models write rows with `;`, newlines or commas; a comma inside a type like numeric(10,2) is not a separator.
  const parts = text.split(/;|\n|,(?![^()]*\))/);
  const constraints = parts.filter((p) => PRIMARY.test(p) || FOREIGN.test(p));
  const rows = parseColumns(parts.filter((p) => !constraints.includes(p)));
  // Constraint lines are not columns: they mark the columns they name.
  for (const line of constraints) {
    const pk = PRIMARY.exec(line);
    const fk = pk ? null : FOREIGN.exec(line);
    const names = pk ? pk[1].split(/\s*,\s*/).filter(Boolean) : fk ? [fk[1]] : [];
    for (const name of names) {
      const row = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (!row) continue;
      const key = pk ? "pk" : "fk";
      if (!row.keys?.includes(key)) row.keys = [...(row.keys ?? []), key];
      if (fk?.[2] && !row.references) row.references = fk[3] ? `${fk[2]}.${fk[3]}` : fk[2];
    }
  }
  return rows;
};

const parseColumns = (parts: string[]): EntityRow[] => {
  const used = new Set<string>();
  return parts.flatMap((written) => {
    // SQL words a model may use inline: `id int primary key`, `email text unique not null`, `x int references t(y)`.
    const raw = written
      .replace(/\bprimary\s+key\b/gi, "pk")
      .replace(/\bforeign\s+key\b/gi, "fk")
      .replace(/\bunique\b/gi, "uq")
      .replace(/\bnot\s+null\b/gi, "")
      .replace(/\breferences\s+([\w.]+)\s*(?:\(\s*([\w.]+)\s*\))?/i, (_m, table: string, column?: string) => `-> ${column ? `${table}.${column}` : table}`);
    const [body, ref] = raw.split("->").map((s) => s.trim());
    const words = (body ?? "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const [name, ...rest] = words;
    const row: EntityRow = { id: "", name };
    for (const w of rest) {
      const lw = w.toLowerCase();
      if (KEYS.has(lw)) row.keys = [...(row.keys ?? []), lw as "pk" | "fk" | "uq"];
      else if (lw === "nullable" || lw === "null") row.nullable = true;
      else row.type = row.type ? `${row.type} ${w}` : w;
    }
    if (ref) {
      row.references = ref;
      if (!row.keys?.includes("fk")) row.keys = [...(row.keys ?? []), "fk"];
    }
    // Ids come from the name, made unique, so the same text always gives the same ids.
    let id = slug(name);
    for (let n = 2; used.has(id); n += 1) id = `${slug(name)}-${n}`;
    used.add(id);
    return [{ ...row, id }];
  });
};

export const writeRows = (rows: readonly EntityRow[]): string =>
  rows.map((r) => [r.name, r.type, ...(r.keys ?? []).filter((k) => !(k === "fk" && r.references)), r.nullable ? "nullable" : undefined].filter(Boolean).join(" ") + (r.references ? ` -> ${r.references}` : "")).join("; ");
