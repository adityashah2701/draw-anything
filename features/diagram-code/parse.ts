import { parseDiagramType } from "@/features/ai/schemas";
import { slugId } from "@/features/ai/server/validation";
import type {
  DiagramCodeIssue,
  ParsedDiagramCode,
  ParsedEdge,
  ParsedGroup,
  ParsedNode,
} from "./types";

export const MAX_SOURCE_CHARS = 100_000;
export const MAX_SOURCE_LINES = 2_000;

type Connector = "<-->" | "-->" | "<>" | ">" | "<";
// Longest first so "<-->" is not read as "<" followed by "-->".
const CONNECTORS: Connector[] = ["<-->", "-->", "<>", ">", "<"];

const UNSUPPORTED_PROPS = new Set(["color", "shape", "colormode", "stylemode", "typeface", "icon-color"]);
const DIRECTIVE = /^(title|type|direction)\s+(.+)$/i;

/** Remove `//` comments (not inside quotes) and whole-line `#` comments. */
const stripComment = (raw: string): string => {
  if (raw.trimStart().startsWith("#")) return "";
  let quote = false;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '"') quote = !quote;
    // A comment starts at "//" at the line start or after whitespace, so a
    // URL in a label ("A > B: https://api") is not mistaken for one.
    else if (
      !quote &&
      raw[i] === "/" &&
      raw[i + 1] === "/" &&
      (i === 0 || /\s/.test(raw[i - 1]))
    ) {
      return raw.slice(0, i);
    }
  }
  return raw;
};

const unquote = (text: string): string => {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"')
    ? t.slice(1, -1).replace(/\\"/g, '"')
    : t;
};

/** Split `text` on `separator` outside quotes and brackets. */
const splitTopLevel = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let quote = false;
  let depth = 0;
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    if (!quote) {
      if (ch === "[") depth += 1;
      else if (ch === "]") depth = Math.max(0, depth - 1);
      else if (ch === separator && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

interface EdgeTokens {
  parts: string[];
  connectors: Connector[];
  label?: string;
}

/**
 * Break a line into endpoints, the connectors between them and an optional
 * trailing `: label`. A connector must stand alone (whitespace or line edge on
 * both sides) so `x>y` stays a name; quoted text and `[...]` are never split.
 */
const tokenizeEdge = (line: string): EdgeTokens | null => {
  const parts: string[] = [];
  const connectors: Connector[] = [];
  let current = "";
  let quote = false;
  let depth = 0;
  let label: string | undefined;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quote = !quote;
      current += ch;
      continue;
    }
    if (!quote) {
      if (ch === "[") depth += 1;
      else if (ch === "]") depth = Math.max(0, depth - 1);
      else if (depth === 0) {
        if (ch === ":" && connectors.length > 0) {
          label = line.slice(i + 1).trim();
          break;
        }
        if (ch === "<" || ch === "-" || ch === ">") {
          const found = CONNECTORS.find((c) => line.startsWith(c, i));
          const before = i === 0 || /\s/.test(line[i - 1]);
          const after = found ? i + found.length >= line.length || /\s/.test(line[i + found.length]) : false;
          if (found && before && after) {
            parts.push(current.trim());
            current = "";
            connectors.push(found);
            i += found.length - 1;
            continue;
          }
        }
      }
    }
    current += ch;
  }
  if (connectors.length === 0) return null;
  parts.push(current.trim());
  return { parts, connectors, label };
};

export const parseDiagramCode = (source: string): ParsedDiagramCode => {
  const issues: DiagramCodeIssue[] = [];
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];
  const groups: ParsedGroup[] = [];
  const result: ParsedDiagramCode = { nodes, edges, groups, issues };
  const add = (line: number, severity: DiagramCodeIssue["severity"], message: string) =>
    issues.push({ line, severity, message });

  const lines = source.split(/\r?\n/);
  if (source.length > MAX_SOURCE_CHARS || lines.length > MAX_SOURCE_LINES) {
    add(1, "error", `The code is too large (limit ${MAX_SOURCE_LINES} lines / ${MAX_SOURCE_CHARS} characters).`);
    return result;
  }

  const nodeByName = new Map<string, ParsedNode>();
  const nodeGroup = new Map<string, string>(); // node id -> innermost group label, for warnings
  const usedNodeIds = new Set<string>();
  const usedGroupIds = new Set<string>();
  const stack: Array<{ group: ParsedGroup; line: number }> = [];

  const uniqueId = (base: string, used: Set<string>) => {
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  /** `kind: db, label: "X"` -> map; reports unknown / unsupported keys. */
  const parseProps = (inner: string, line: number) => {
    const props: Record<string, string> = {};
    for (const entry of splitTopLevel(inner, ",")) {
      if (entry.trim() === "") continue;
      const colon = entry.indexOf(":");
      if (colon === -1) {
        add(line, "warning", `Property "${entry.trim()}" needs a value (key: value).`);
        continue;
      }
      const key = entry.slice(0, colon).trim().toLowerCase();
      const value = unquote(entry.slice(colon + 1));
      if (UNSUPPORTED_PROPS.has(key)) {
        add(line, "warning", `"${key}" is not supported yet and was ignored.`);
      } else if (["kind", "icon", "label", "dashed"].includes(key)) {
        props[key === "icon" ? "kind" : key] = value;
      } else {
        add(line, "warning", `Unknown property "${key}" was ignored.`);
      }
    }
    return props;
  };

  /** `Name [props]` -> name + props, or null (with an error) when malformed. */
  const parseRef = (text: string, line: number) => {
    const t = text.trim();
    if (t === "") {
      add(line, "error", "A node name is missing.");
      return null;
    }
    let quote = false;
    let bracket = -1;
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] === '"') quote = !quote;
      else if (!quote && t[i] === "[") {
        bracket = i;
        break;
      }
    }
    if (quote) {
      add(line, "error", 'A quoted name is missing its closing ".');
      return null;
    }
    let namePart = t;
    let props: Record<string, string> = {};
    if (bracket !== -1) {
      namePart = t.slice(0, bracket).trim();
      const rest = t.slice(bracket);
      if (!rest.endsWith("]")) {
        add(line, "error", "A property list is missing its closing ].");
        return null;
      }
      props = parseProps(rest.slice(1, -1), line);
    }
    const name = unquote(namePart);
    if (name === "") {
      add(line, "error", "A node name is missing.");
      return null;
    }
    // Braces mean "group" unless the name is quoted.
    if (!namePart.trim().startsWith('"') && /[{}]/.test(name)) {
      add(line, "error", 'A name cannot contain { or } unless it is in "quotes".');
      return null;
    }
    return { name, props };
  };

  const applyProps = (node: ParsedNode, props: Record<string, string>) => {
    if (props.kind !== undefined) node.kind = props.kind;
    if (props.label !== undefined) node.label = props.label;
    if (props.dashed !== undefined) node.dashed = props.dashed.toLowerCase() === "true";
  };

  /** Find or create a node; new nodes join every group currently open. */
  const resolveNode = (
    ref: { name: string; props: Record<string, string> },
    line: number,
    explicit: boolean,
  ): ParsedNode => {
    let node = nodeByName.get(ref.name);
    if (node) {
      if (explicit) {
        add(line, "warning", `"${ref.name}" was already declared; the properties were merged.`);
        const current = stack[stack.length - 1]?.group.label;
        const original = nodeGroup.get(node.id);
        if (current && original && current !== original) {
          add(line, "warning", `"${ref.name}" already belongs to "${original}"; it was not moved.`);
        }
      }
    } else {
      node = {
        id: uniqueId(slugId(ref.name, "node"), usedNodeIds),
        name: ref.name,
        label: ref.name,
      };
      nodes.push(node);
      nodeByName.set(ref.name, node);
      const innermost = stack[stack.length - 1];
      if (innermost) nodeGroup.set(node.id, innermost.group.label);
      stack.forEach(({ group }) => group.nodeIds.push(node!.id));
    }
    applyProps(node, ref.props);
    return node;
  };

  let inHeader = true;

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = stripComment(raw).trim();
    if (text === "") return;

    // Directives are only recognised before the diagram body starts, so a node
    // that happens to be called "type checker" stays a node.
    if (inHeader) {
      const directive = DIRECTIVE.exec(text);
      if (directive) {
        const key = directive[1].toLowerCase();
        const value = unquote(directive[2]);
        if (key === "title") result.title = value;
        else if (key === "type") {
          const type = parseDiagramType(value);
          if (type) result.diagramType = type;
          else add(line, "warning", `Unknown diagram type "${value}" was ignored.`);
        } else {
          const dir = value.toLowerCase();
          if (["down", "tb", "top-to-bottom", "vertical"].includes(dir)) result.direction = "down";
          else if (["right", "lr", "left-to-right", "horizontal"].includes(dir)) result.direction = "right";
          else add(line, "warning", `Unknown direction "${value}" was ignored.`);
        }
        return;
      }
    }
    inHeader = false;

    if (text === "}") {
      if (stack.length === 0) add(line, "error", "Unmatched } (no group is open).");
      else stack.pop();
      return;
    }

    const edgeTokens = tokenizeEdge(text);
    if (edgeTokens) {
      const sides = edgeTokens.parts.map((part) =>
        splitTopLevel(part, ",")
          .map((item) => parseRef(item, line))
          .filter((ref): ref is NonNullable<typeof ref> => ref !== null),
      );
      if (sides.some((side, i) => side.length === 0 && edgeTokens.parts[i].trim() === "")) {
        // parseRef already reported the missing name
        return;
      }
      const resolved = sides.map((side) => side.map((ref) => resolveNode(ref, line, false)));
      edgeTokens.connectors.forEach((connector, i) => {
        for (const left of resolved[i]) {
          for (const right of resolved[i + 1]) {
            const [from, to] = connector === "<" ? [right, left] : [left, right];
            if (from.id === to.id) {
              add(line, "warning", `"${from.name}" cannot connect to itself; the connection was ignored.`);
              continue;
            }
            edges.push({
              from: from.id,
              to: to.id,
              label: edgeTokens.label || undefined,
              bidirectional: connector === "<>" || connector === "<-->" ? true : undefined,
              dashed: connector === "-->" || connector === "<-->" ? true : undefined,
              line,
            });
          }
        }
      });
      return;
    }

    if (text.endsWith("{")) {
      const ref = parseRef(text.slice(0, -1), line);
      if (!ref) return;
      const group: ParsedGroup = {
        id: uniqueId(slugId(ref.name, "group"), usedGroupIds),
        label: ref.props.label ?? ref.name,
        nodeIds: [],
        parentId: stack[stack.length - 1]?.group.id,
      };
      groups.push(group);
      stack.push({ group, line });
      return;
    }

    for (const item of splitTopLevel(text, ",")) {
      const ref = parseRef(item, line);
      if (ref) resolveNode(ref, line, nodeByName.has(ref.name));
    }
  });

  stack.forEach(({ group, line }) =>
    add(line, "error", `The group "${group.label}" is never closed (missing }).`),
  );
  return result;
};
