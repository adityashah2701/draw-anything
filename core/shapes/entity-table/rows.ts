import type { EntityRow } from "@/features/whiteboard/types/whiteboard.types";

/**
 * Entity rows as text, for diagram code and the AI: `id int pk; email text uq; team_id int fk -> teams.id; note text nullable`.
 * A row is a name, then an optional type, then any of `pk`, `fk`, `uq`, `nullable`, then an optional `-> table.column`.
 * The writer is canonical, so the same rows always give the same text.
 */
const KEYS = new Set(["pk", "fk", "uq"]);

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "col";

export const parseRows = (text: string | undefined): EntityRow[] => {
  if (!text) return [];
  const used = new Set<string>();
  // Models write rows with `;`, newlines or commas; a comma inside a type like numeric(10,2) is not a separator.
  return text.split(/;|\n|,(?![^()]*\))/).flatMap((raw) => {
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
