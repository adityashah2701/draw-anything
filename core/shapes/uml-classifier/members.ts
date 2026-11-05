/**
 * UML member lines. The text is the stored form (`+pay(method: Method): Receipt`, `-total: Money`, `+{static} count: int`,
 * `+{abstract} area(): float`); this reads it into parts for drawing and writes it back canonically.
 */
export type Visibility = "+" | "-" | "#" | "~";

export interface Member {
  visibility: Visibility;
  name: string;
  type?: string;
  /** Present (possibly empty) for an operation. */
  params?: string;
  static: boolean;
  abstract: boolean;
}

const LINE = /^\s*([+\-#~])?\s*(?:\{(static|abstract)\}\s*)?([A-Za-z_$][\w$]*)\s*(?:\(([^)]*)\))?\s*(?::\s*(.+?))?\s*$/;

/** The member a line says, or null when it is not one (the editor then keeps the previous value and shows why). */
export const parseMember = (text: string): Member | null => {
  const m = LINE.exec(text);
  if (!m) return null;
  const [, visibility, flag, name, params, type] = m;
  return { visibility: (visibility as Visibility) ?? "+", name, ...(type ? { type: type.trim() } : {}), ...(params !== undefined ? { params: params.trim() } : {}), static: flag === "static", abstract: flag === "abstract" };
};

/** The canonical line of a member: the same meaning always writes the same text. */
export const writeMember = (member: Member): string => {
  const flag = member.static ? "{static} " : member.abstract ? "{abstract} " : "";
  return `${member.visibility}${flag}${member.name}${member.params !== undefined ? `(${member.params})` : ""}${member.type ? `: ${member.type}` : ""}`;
};

/** A line that does not parse is shown as typed rather than dropped. */
export const canonicalMember = (text: string): string => {
  const parsed = parseMember(text);
  return parsed ? writeMember(parsed) : text;
};
