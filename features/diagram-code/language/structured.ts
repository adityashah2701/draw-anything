/**
 * Structured shapes in the language (plan U11, U12, U14, U17): `entity` (a table of rows), `class` / `interface` / `enum`
 * (a classifier), `topic` (a mind-map topic) and `lifeline` (a sequence participant). Their content is plain text
 * properties: `rows: "id int pk; email text uq"`, `attributes: "-total: Money"`, `operations: "+pay(): Receipt"`,
 * `variant`, `stereotype`, `template`. They are kept in `IRNode.data` and turned into elements by the compiler.
 */
export const DATA_PROPERTIES = ["rows", "attributes", "operations", "variant", "stereotype", "template"] as const;

export const STRUCTURED_SHAPES = [
  { name: "entity", aliases: ["entity-table", "table"], summary: "An ER entity: a header and one line per column, from `rows: \"id int pk; name text; team_id int fk -> teams.id\"` (`variant: weak|associative|junction`)." },
  { name: "class", aliases: ["uml-class"], summary: "A UML class with compartments: `attributes: \"-total: Money\"` and `operations: \"+pay(m: Method): Receipt\"`, separated by `;` (`variant: abstract|template|object|datatype|record`, `stereotype`, `template`)." },
  { name: "interface", aliases: [], summary: "A UML interface: a class with the interface stereotype." },
  { name: "enum", aliases: ["enumeration"], summary: "A UML enumeration: the literals go in `attributes`." },
  { name: "topic", aliases: ["mindmap-topic", "branch"], summary: "A mind-map topic. Its role (centre, main branch, sub-topic) follows from where it sits in the tree; branches take colour from their main branch." },
  { name: "lifeline", aliases: ["participant"], summary: "A sequence participant with its lifeline; connections to and from it are messages in the order they are written." },
] as const;

/** `interface` and `enum` are classes with a variant; every other name is its own element. */
export const expandStructured = (shape: string | undefined, data: Record<string, string> | undefined): { shape: string; data: Record<string, string> } | undefined => {
  if (shape === "interface") return { shape: "class", data: { ...data, variant: "interface" } };
  if (shape === "enum") return { shape: "class", data: { ...data, variant: "enumeration" } };
  if (shape === "entity" || shape === "class" || shape === "topic" || shape === "lifeline") return { shape, data: data ?? {} };
  return undefined;
};
