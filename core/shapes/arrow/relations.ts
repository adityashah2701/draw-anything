import type {
  ArrowheadKind,
  Cardinality,
  ConnectorEnd,
  ConnectorRelation,
  RelationKind,
  RelationNotation,
} from "@/core/model";

/**
 * What a connector means, as data. A relation names a kind (generalization, ER relationship, sync message, ...),
 * optionally a notation, and per end a cardinality, a multiplicity and a role. The line style, the heads and the
 * end glyphs are derived from it (`relationLook`), so changing the notation re-draws the connector and leaves what
 * it says alone. Pure and total: any stored value gives a usable result, never a throw.
 */

export type LineStyle = "solid" | "dashed" | "dotted";

export interface RelationDef {
  kind: RelationKind;
  label: string;
  summary: string;
  line: LineStyle;
  /** The head at the source and at the target, when the kind draws one there. */
  start?: ArrowheadKind;
  end?: ArrowheadKind;
  /** Which end data the kind accepts. */
  accepts: { cardinality: boolean; multiplicity: boolean; role: boolean };
  /** The notation the kind is normally drawn in. */
  notation: RelationNotation;
  /** Both ends must be classifiers (generalization and the like); reported, not enforced. */
  needsClassifiers?: boolean;
}

const ENDS_ALL = { cardinality: true, multiplicity: true, role: true };
const ENDS_UML = { cardinality: false, multiplicity: true, role: true };
const ENDS_NONE = { cardinality: false, multiplicity: false, role: false };

/**
 * The aggregate or container (the whole) is the source of aggregation and composition: `Whole > Part`, so the
 * diamond sits at the start. Generalization, realization, dependency and directed association point at the target.
 */
export const RELATIONS: readonly RelationDef[] = [
  { kind: "association", label: "Association", summary: "Two things are related: a plain line, with optional multiplicity and role at each end.", line: "solid", accepts: ENDS_UML, notation: "uml" },
  { kind: "directed-association", label: "Directed association", summary: "One thing knows about the other: a line with an open arrow at the target.", line: "solid", end: "open", accepts: ENDS_UML, notation: "uml" },
  { kind: "generalization", label: "Generalization", summary: "Inheritance: a solid line with a hollow triangle at the parent (the target).", line: "solid", end: "hollow-triangle", accepts: ENDS_NONE, notation: "uml", needsClassifiers: true },
  { kind: "realization", label: "Realization", summary: "A class implements an interface: a dashed line with a hollow triangle at the interface (the target).", line: "dashed", end: "hollow-triangle", accepts: ENDS_NONE, notation: "uml", needsClassifiers: true },
  { kind: "dependency", label: "Dependency", summary: "One thing uses another: a dashed line with an open arrow at the target.", line: "dashed", end: "open", accepts: ENDS_NONE, notation: "uml" },
  { kind: "aggregation", label: "Aggregation", summary: "A whole has parts that can exist without it: a hollow diamond at the whole (the source).", line: "solid", start: "diamond", accepts: ENDS_UML, notation: "uml", needsClassifiers: true },
  { kind: "composition", label: "Composition", summary: "A whole owns its parts: a filled diamond at the whole (the source).", line: "solid", start: "diamond-filled", accepts: ENDS_UML, notation: "uml", needsClassifiers: true },
  { kind: "er-relationship", label: "ER relationship", summary: "An entity-relationship link with a cardinality at each end, in crow's foot or Chen notation.", line: "solid", accepts: ENDS_ALL, notation: "crows-foot" },
  { kind: "sequence-flow", label: "Sequence flow", summary: "BPMN: the order of steps in one process, a solid line with a filled arrow.", line: "solid", end: "triangle", accepts: ENDS_NONE, notation: "bpmn" },
  { kind: "message-flow", label: "Message flow", summary: "BPMN: a message between pools, a dashed line from a small circle to a hollow arrow.", line: "dashed", start: "circle", end: "hollow-triangle", accepts: ENDS_NONE, notation: "bpmn" },
  { kind: "bpmn-association", label: "BPMN association", summary: "BPMN: attaches a note or an artifact to something, a dotted line.", line: "dotted", accepts: ENDS_NONE, notation: "bpmn" },
  { kind: "assembly", label: "Assembly", summary: "UML: a provided interface (ball) plugged into a required one (socket).", line: "solid", start: "lollipop", end: "socket", accepts: ENDS_NONE, notation: "uml" },
  { kind: "sync-message", label: "Synchronous message", summary: "Sequence: the caller waits for the answer, a solid line with a filled arrow.", line: "solid", end: "triangle", accepts: ENDS_NONE, notation: "uml" },
  { kind: "async-message", label: "Asynchronous message", summary: "Sequence: the caller carries on, a solid line with an open arrow.", line: "solid", end: "open", accepts: ENDS_NONE, notation: "uml" },
  { kind: "return-message", label: "Return message", summary: "Sequence: the answer coming back, a dashed line with an open arrow.", line: "dashed", end: "open", accepts: ENDS_NONE, notation: "uml" },
  { kind: "create-message", label: "Create message", summary: "Sequence: makes the target exist, a dashed line with an open arrow.", line: "dashed", end: "open", accepts: ENDS_NONE, notation: "uml" },
  { kind: "destroy-message", label: "Destroy message", summary: "Sequence: ends the target's life, a solid line finishing in a cross.", line: "solid", end: "cross", accepts: ENDS_NONE, notation: "uml" },
];

const BY_KIND = new Map(RELATIONS.map((def) => [def.kind, def]));

export const RELATION_KINDS: readonly RelationKind[] = RELATIONS.map((def) => def.kind);
export const NOTATIONS: readonly RelationNotation[] = ["crows-foot", "chen", "uml", "bpmn"];
export const CARDINALITIES: readonly Cardinality[] = ["one", "exactly-one", "many", "zero-or-one", "zero-or-many", "one-or-many"];

export const isRelationKind = (value: unknown): value is RelationKind => typeof value === "string" && BY_KIND.has(value as RelationKind);
export const isNotation = (value: unknown): value is RelationNotation => typeof value === "string" && (NOTATIONS as readonly string[]).includes(value);
export const isCardinality = (value: unknown): value is Cardinality => typeof value === "string" && (CARDINALITIES as readonly string[]).includes(value);
export const relationDef = (kind: RelationKind): RelationDef => BY_KIND.get(kind)!;

/** Other words for a relation kind, for the language. */
const KIND_ALIASES: Record<string, RelationKind> = {
  inheritance: "generalization",
  extends: "generalization",
  inherits: "generalization",
  implements: "realization",
  realisation: "realization",
  uses: "dependency",
  depends: "dependency",
  aggregate: "aggregation",
  compose: "composition",
  relationship: "er-relationship",
  er: "er-relationship",
  sequence: "sequence-flow",
  message: "message-flow",
  sync: "sync-message",
  call: "sync-message",
  async: "async-message",
  return: "return-message",
  reply: "return-message",
  create: "create-message",
  destroy: "destroy-message",
  "directed": "directed-association",
};

const slug = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, "-");

export const parseRelationKind = (value: string): RelationKind | null => {
  const v = slug(value);
  if (isRelationKind(v)) return v;
  return KIND_ALIASES[v] ?? null;
};

export const parseNotation = (value: string): RelationNotation | null => {
  const v = slug(value).replace("crow's-foot", "crows-foot").replace("crow-foot", "crows-foot").replace("crowsfoot", "crows-foot");
  return isNotation(v) ? v : null;
};

/** Other spellings of a cardinality, for the language: `N`, `M`, `*`. */
const CARDINALITY_WORDS: Record<string, Cardinality> = {
  one: "one",
  "exactly-one": "exactly-one",
  many: "many",
  n: "many",
  m: "many",
  "zero-or-one": "zero-or-one",
  optional: "zero-or-one",
  "zero-or-many": "zero-or-many",
  "one-or-many": "one-or-many",
};

export const parseCardinality = (value: string): Cardinality | null => CARDINALITY_WORDS[slug(value)] ?? null;

const MULTIPLICITY = /^(\d{1,4}|\*)(\.\.(\d{1,4}|\*))?$/;
const MAX_ROLE = 40;

/** `1`, `*`, `0..1`, `0..*`, `2..5`: a number or `*`, optionally a range whose lower bound does not exceed its upper. Null for anything else (`3..`, `many-ish`). */
export const parseMultiplicity = (value: string): string | null => {
  const v = value.trim();
  const match = MULTIPLICITY.exec(v);
  if (!match) return null;
  const low = match[1];
  const high = match[3];
  if (high !== undefined && low !== "*" && high !== "*" && Number(low) > Number(high)) return null;
  if (low === "*" && high !== undefined) return null;
  return v;
};

/** What a written end value means: a multiplicity (`0..*`) or a cardinality word (`many`); null when it is neither. */
export const parseEndValue = (value: string): Pick<ConnectorEnd, "cardinality" | "multiplicity"> | null => {
  const multiplicity = parseMultiplicity(value);
  if (multiplicity !== null) return { multiplicity };
  const cardinality = parseCardinality(value);
  return cardinality ? { cardinality } : null;
};

/** The ER cardinality an end stands for: its own, else the nearest one to its multiplicity. */
export const cardinalityOf = (end: ConnectorEnd | undefined): Cardinality | undefined => {
  if (!end) return undefined;
  if (end.cardinality) return end.cardinality;
  const m = end.multiplicity;
  if (m === undefined) return undefined;
  if (m === "1") return "one";
  if (m === "0..1") return "zero-or-one";
  if (m === "*" || m === "0..*") return "zero-or-many";
  if (m === "1..*") return "one-or-many";
  const [low, high] = m.split("..");
  if (high === undefined) return Number(low) > 1 ? "many" : "one";
  return low === "0" ? (high === "1" ? "zero-or-one" : "zero-or-many") : high === "1" ? "one" : "one-or-many";
};

/** Crow's-foot head for a cardinality. */
const CROW: Record<Cardinality, ArrowheadKind> = {
  one: "crow-one",
  "exactly-one": "crow-exactly-one",
  many: "crow-many",
  "zero-or-one": "crow-zero-one",
  "zero-or-many": "crow-zero-many",
  "one-or-many": "crow-one-many",
};

/** What Chen notation writes beside a line. */
const CHEN_LABEL: Record<Cardinality, string> = {
  one: "1",
  "exactly-one": "1",
  many: "N",
  "zero-or-one": "0..1",
  "zero-or-many": "0..N",
  "one-or-many": "1..N",
};

const cleanRole = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  // Control characters out, whitespace tidied; a role is a short label, not a paragraph.
  const role = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ROLE);
  return role === "" ? undefined : role;
};

const normalizeEnd = (value: unknown, accepts: RelationDef["accepts"]): ConnectorEnd | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const end: ConnectorEnd = {};
  if (accepts.cardinality && isCardinality(v.cardinality)) end.cardinality = v.cardinality;
  if (accepts.multiplicity && typeof v.multiplicity === "string") {
    const m = parseMultiplicity(v.multiplicity);
    if (m !== null) end.multiplicity = m;
  }
  if (accepts.role) {
    const role = cleanRole(v.role);
    if (role) end.role = role;
  }
  return Object.keys(end).length > 0 ? end : undefined;
};

/**
 * The valid part of a stored relation: an unknown kind gives undefined (the connector is drawn from its flags),
 * and invalid fields are dropped. An end the kind does not accept is dropped too. Never throws.
 */
export const normalizeRelation = (value: unknown): ConnectorRelation | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (!isRelationKind(v.kind)) return undefined;
  const def = relationDef(v.kind);
  const out: ConnectorRelation = { kind: v.kind };
  if (isNotation(v.notation)) out.notation = v.notation;
  const start = normalizeEnd(v.start, def.accepts);
  const end = normalizeEnd(v.end, def.accepts);
  if (start) out.start = start;
  if (end) out.end = end;
  return out;
};

/** The same relation with its ends swapped, for a connector that is reversed. */
export const reverseRelation = (relation: ConnectorRelation): ConnectorRelation => {
  const { start, end, ...rest } = relation;
  return { ...rest, ...(end ? { start: end } : {}), ...(start ? { end: start } : {}) };
};

export type EndSlot = "start" | "end";
export interface EndLabel {
  end: EndSlot;
  text: string;
  /** Beside the line (cardinality, multiplicity) or under it (role). */
  slot: "above" | "below";
}

export interface RelationLook {
  line: LineStyle;
  /** The head at each end; undefined = no head there. */
  start?: ArrowheadKind;
  end?: ArrowheadKind;
  labels: EndLabel[];
}

/**
 * How a relation is drawn. ER relationships in crow's foot put a glyph from the cardinality at each end; in Chen
 * they write 1, N or 0..N beside the line; every other kind keeps the heads of its table row and writes a
 * multiplicity beside the line. A role is always written under the line. The stored data is the same in each.
 */
export const relationLook = (relation: ConnectorRelation): RelationLook => {
  const def = relationDef(relation.kind);
  const notation = relation.notation ?? def.notation;
  const look: RelationLook = { line: def.line, start: def.start, end: def.end, labels: [] };
  const ends: Array<[EndSlot, ConnectorEnd | undefined]> = [["start", relation.start], ["end", relation.end]];

  for (const [slot, data] of ends) {
    if (!data) continue;
    if (relation.kind === "er-relationship") {
      const c = cardinalityOf(data);
      if (c && notation === "chen") look.labels.push({ end: slot, text: CHEN_LABEL[c], slot: "above" });
      else if (c) look[slot] = CROW[c];
    } else if (data.multiplicity ?? data.cardinality) {
      look.labels.push({ end: slot, text: data.multiplicity ?? CHEN_LABEL[data.cardinality!], slot: "above" });
    }
    if (data.role) look.labels.push({ end: slot, text: data.role, slot: "below" });
  }
  return look;
};

/** Shapes that are not classifiers: flow-control shapes, markers and annotations. */
const NON_CLASSIFIER_SHAPES = new Set(["diamond", "pill", "icon", "ring", "rhombus", "note", "callout", "step", "delay", "cloud", "person", "parallelogram"]);
const NON_CLASSIFIER_KINDS = new Set(["decision", "start", "end", "user"]);

/** True when a node can be a classifier (a class, an interface, a component, a package). Unknown shapes are given the benefit of the doubt. */
export const isClassifier = (node: { shape?: string; kind?: string }): boolean =>
  !(node.shape && NON_CLASSIFIER_SHAPES.has(node.shape)) && !(node.kind && NON_CLASSIFIER_KINDS.has(node.kind));

/** A sentence saying why a relation does not fit its two ends, or null when it does. Reported as a diagnostic; the connector is still drawn. */
export const relationProblem = (
  kind: RelationKind,
  source: { shape?: string; kind?: string; name: string },
  target: { shape?: string; kind?: string; name: string },
): string | null => {
  if (!relationDef(kind).needsClassifiers) return null;
  const bad = [source, target].filter((node) => !isClassifier(node)).map((node) => `"${node.name}"`);
  return bad.length === 0 ? null : `A ${kind} joins classifiers (classes, interfaces, components), but ${bad.join(" and ")} ${bad.length === 1 ? "is not one" : "are not"}.`;
};

// ── editing ─────────────────────────────────────────────────────────────────────────────────────

/** A change to one end: a value sets the field, `undefined` clears it. */
export type EndPatch = { [K in keyof ConnectorEnd]?: ConnectorEnd[K] | undefined };

/**
 * `current` with another kind: the notation and whatever end data the new kind can show stay, the rest is dropped.
 * Null removes the meaning (the connector is drawn from its flags again).
 */
export const withRelationKind = (current: ConnectorRelation | undefined, kind: RelationKind | null): ConnectorRelation | undefined => {
  if (kind === null) return undefined;
  return normalizeRelation({ ...(current ?? {}), kind });
};

/** `current` with another notation, or the kind's own when null. The end data is untouched. */
export const withNotation = (current: ConnectorRelation | undefined, notation: RelationNotation | null): ConnectorRelation | undefined => {
  if (!current) return undefined;
  const { notation: _old, ...rest } = current;
  void _old;
  return { ...rest, ...(notation ? { notation } : {}) };
};

/** `current` with one end changed. With no relation yet the connection becomes an association, the kind that carries end data. */
export const withEnd = (current: ConnectorRelation | undefined, which: EndSlot, patch: EndPatch): ConnectorRelation | undefined => {
  const base: ConnectorRelation = current ?? { kind: "association" };
  const merged: ConnectorEnd = { ...(base[which] ?? {}) };
  for (const key of ["cardinality", "multiplicity", "role"] as const) {
    if (key in patch) {
      if (patch[key] === undefined) delete merged[key];
      else (merged as Record<string, unknown>)[key] = patch[key];
    }
  }
  const next: ConnectorRelation = { ...base };
  if (Object.keys(merged).length > 0) next[which] = merged;
  else delete next[which];
  return normalizeRelation(next);
};

/** Whether a kind takes each sort of end data, for the editor to show only what applies. */
export const endsAccepted = (kind: RelationKind) => relationDef(kind).accepts;
