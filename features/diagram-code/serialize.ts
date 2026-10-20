import type { AIDiagramType } from "@/features/ai/types";
import { escapeString } from "./language/strings";

export interface SerializableGraph {
  diagramType?: AIDiagramType;
  title?: string;
  nodes: Array<{ id: string; label: string; kind?: string; icon?: string; shape?: "diamond" | "pill" | "icon"; color?: string; x?: number; y?: number; width?: number; height?: number }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    dashed?: boolean;
    bidirectional?: boolean;
    plain?: boolean;
    color?: string;
    fromSide?: "top" | "right" | "bottom" | "left";
    toSide?: "top" | "right" | "bottom" | "left";
  }>;
  groups: Array<{ id: string; label: string; nodeIds: string[] }>;
  /** Frames that hold at least one node. `nodeIds` includes the nodes of the frames inside it. */
  frames?: SerializableFrame[];
}

export interface SerializableFrame {
  id: string;
  title: string;
  parentId?: string;
  nodeIds: string[];
  /** The box, written only when the graph carries geometry. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  /** Written only when it is not the frame default. */
  color?: string;
}

const CONNECTOR_IN_NAME = /(^|\s)(<-->|-->|<>|--|-|>|<)(\s|$)/;
const DIRECTIVE_LOOKALIKE = /^(title|type|direction)\s/i;
/** `frame Name {` and `group Name {` are block keywords, so a name that starts like one is quoted. */
const BLOCK_KEYWORD_LOOKALIKE = /^(frame|group)\s+\S/;

const IMPLIED_SHAPE: Record<string, string> = { decision: "diamond", start: "pill", end: "pill" };

const clean = (text: string) => text.replace(/\s+/g, " ").replace(/"/g, "'").trim();

/** A label that may span lines: whitespace is tidied within each line, line breaks are kept. */
const cleanMultiline = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter((line) => line !== "")
    .join("\n");

/** Quote a name only when the parser would otherwise misread it. */
export const writeName = (name: string): string =>
  name === "" ||
  /[\[\]{}",:]/.test(name) ||
  /^(\/\/|#)/.test(name) ||
  DIRECTIVE_LOOKALIKE.test(name) ||
  BLOCK_KEYWORD_LOOKALIKE.test(name) ||
  CONNECTOR_IN_NAME.test(name)
    ? `"${escapeString(name)}"`
    : name;

const connectorFor = (edge: { dashed?: boolean; bidirectional?: boolean; plain?: boolean }) =>
  edge.plain ? (edge.dashed ? "--" : "-") : edge.bidirectional ? (edge.dashed ? "<-->" : "<>") : edge.dashed ? "-->" : ">";

/**
 * Write a graph as diagram code. The output parses back to the same nodes,
 * kinds, connections, labels, flags and nested groups.
 */
export const serializeDiagramCode = (graph: SerializableGraph): string => serializeDiagramCodeDetailed(graph).code;

export interface SerializedDiagramCode {
  code: string;
  /** The name each node was written under (graph node id to name); connections in the code refer to these. */
  names: Map<string, string>;
  /** The name each frame was written under (graph frame id to name). */
  frameNames: Map<string, string>;
}

export const serializeDiagramCodeDetailed = (graph: SerializableGraph): SerializedDiagramCode => {
  // Unique display names; the real label goes in a property when they differ.
  const nameOf = new Map<string, string>();
  const used = new Set<string>();
  graph.nodes.forEach((node, index) => {
    const base = clean(node.label) || `Untitled ${index + 1}`;
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} ${n}`;
    used.add(name);
    nameOf.set(node.id, name);
  });
  const known = new Set(nameOf.keys());

  // Frames: only ones that hold known nodes, named uniquely (frame names share the node namespace).
  const frames = (graph.frames ?? [])
    .map((frame) => ({ ...frame, nodeIds: Array.from(new Set(frame.nodeIds.filter((id) => known.has(id)))) }))
    .filter((frame) => frame.nodeIds.length > 0);
  const frameIds = new Set(frames.map((frame) => frame.id));
  const frameNameOf = new Map<string, string>();
  for (const frame of frames) {
    const base = clean(frame.title) || "Frame";
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} ${n}`;
    used.add(name);
    frameNameOf.set(frame.id, name);
  }
  const frameParent = (frame: (typeof frames)[number]) => (frame.parentId && frameIds.has(frame.parentId) ? frame.parentId : undefined);
  const depthOfFrame = (frame: (typeof frames)[number]): number => {
    let depth = 0;
    for (let at = frameParent(frame), guard = 0; at && guard < 100; guard += 1) {
      depth += 1;
      at = frameParent(frames.find((f) => f.id === at)!);
    }
    return depth;
  };
  // Each node's innermost frame: the deepest one that holds it.
  const innermostFrame = new Map<string, string>();
  for (const frame of [...frames].sort((a, b) => depthOfFrame(a) - depthOfFrame(b))) {
    for (const id of frame.nodeIds) innermostFrame.set(id, frame.id);
  }

  const declaration = (node: SerializableGraph["nodes"][number]) => {
    const name = nameOf.get(node.id)!;
    const props: string[] = [];
    if (node.kind && node.kind !== "generic") props.push(`kind: ${node.kind}`);
    if (node.icon) props.push(`icon: ${node.icon}`);
    // A kind already implies its shape (decision: diamond, start/end: pill), so only say it when it adds something.
    if (node.shape && node.shape !== IMPLIED_SHAPE[node.kind ?? ""]) props.push(`shape: ${node.shape}`);
    if (node.color) props.push(`color: ${node.color}`);
    // Where it is and how big, so the code can reproduce the picture exactly.
    if (node.x !== undefined) props.push(`x: ${Math.round(node.x)}`);
    if (node.y !== undefined) props.push(`y: ${Math.round(node.y)}`);
    if (node.width !== undefined) props.push(`w: ${Math.round(node.width)}`);
    if (node.height !== undefined) props.push(`h: ${Math.round(node.height)}`);
    const label = cleanMultiline(node.label);
    if (label !== name) props.push(`label: "${escapeString(label)}"`);
    return props.length > 0 ? `${writeName(name)} [${props.join(", ")}]` : writeName(name);
  };

  // Groups: members limited to known nodes, identical sets dropped, nesting by containment.
  const seen = new Set<string>();
  const groups = graph.groups
    .map((group) => ({
      ...group,
      label: clean(group.label) || "Group",
      nodeIds: Array.from(new Set(group.nodeIds.filter((id) => known.has(id)))),
    }))
    .filter((group) => {
      if (group.nodeIds.length === 0) return false;
      // A group cannot span frames (frames cannot be inside groups); one that does is left out.
      if (new Set(group.nodeIds.map((id) => innermostFrame.get(id))).size > 1) return false;
      const key = [...group.nodeIds].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length);

  const parentOf = new Map<string, string | undefined>();
  groups.forEach((group, i) => {
    const members = new Set(group.nodeIds);
    // The smallest earlier (larger) group that contains all of this group's nodes.
    for (let j = i - 1; j >= 0; j -= 1) {
      const candidate = groups[j];
      if (candidate.nodeIds.length > members.size && group.nodeIds.every((id) => candidate.nodeIds.includes(id))) {
        parentOf.set(group.id, candidate.id);
        break;
      }
    }
  });
  // Groups are sorted largest first, so later (smaller) groups overwrite: the
  // result is each node's innermost group.
  const innermost = new Map<string, string>();
  groups.forEach((group) => group.nodeIds.forEach((id) => innermost.set(id, group.id)));

  const frameOfGroup = (group: (typeof groups)[number]) => innermostFrame.get(group.nodeIds[0]);

  const lines: string[] = [];
  const emitGroup = (group: (typeof groups)[number], depth: number) => {
    const pad = "  ".repeat(depth);
    lines.push(`${pad}${writeName(group.label)} {`);
    graph.nodes
      .filter((node) => innermost.get(node.id) === group.id)
      .forEach((node) => lines.push(`${pad}  ${declaration(node)}`));
    groups
      .filter((child) => parentOf.get(child.id) === group.id)
      .forEach((child) => emitGroup(child, depth + 1));
    lines.push(`${pad}}`);
  };

  if (graph.diagramType) lines.push(`type ${graph.diagramType}`);
  if (graph.title) lines.push(`title ${clean(graph.title)}`);
  if (lines.length > 0) lines.push("");

  const emitFrame = (frame: (typeof frames)[number], depth: number) => {
    const pad = "  ".repeat(depth);
    const name = frameNameOf.get(frame.id)!;
    const props: string[] = [];
    if (frame.color) props.push(`color: ${frame.color}`);
    if (frame.x !== undefined) props.push(`x: ${Math.round(frame.x)}`);
    if (frame.y !== undefined) props.push(`y: ${Math.round(frame.y)}`);
    if (frame.width !== undefined) props.push(`w: ${Math.round(frame.width)}`);
    if (frame.height !== undefined) props.push(`h: ${Math.round(frame.height)}`);
    if (frame.padding !== undefined) props.push(`padding: ${Math.round(frame.padding)}`);
    const title = clean(frame.title) || "Frame";
    if (title !== name) props.push(`label: "${escapeString(title)}"`);
    lines.push(`${pad}frame ${writeName(name)}${props.length > 0 ? ` [${props.join(", ")}]` : ""} {`);
    graph.nodes
      .filter((node) => innermostFrame.get(node.id) === frame.id && !innermost.has(node.id))
      .forEach((node) => lines.push(`${pad}  ${declaration(node)}`));
    groups
      .filter((group) => !parentOf.has(group.id) && frameOfGroup(group) === frame.id)
      .forEach((group) => emitGroup(group, depth + 1));
    frames.filter((child) => frameParent(child) === frame.id).forEach((child) => emitFrame(child, depth + 1));
    lines.push(`${pad}}`);
  };

  frames.filter((frame) => !frameParent(frame)).forEach((frame) => emitFrame(frame, 0));
  groups.filter((group) => !parentOf.has(group.id) && frameOfGroup(group) === undefined).forEach((group) => emitGroup(group, 0));
  graph.nodes
    .filter((node) => !innermost.has(node.id) && !innermostFrame.has(node.id))
    .forEach((node) => lines.push(declaration(node)));

  const edgeLines = graph.edges
    .filter((edge) => known.has(edge.from) && known.has(edge.to))
    .map((edge) => {
      const edgeProps = [
        ...(edge.color ? [`color: ${edge.color}`] : []),
        ...(edge.fromSide ? [`from: ${edge.fromSide}`] : []),
        ...(edge.toSide ? [`to: ${edge.toSide}`] : []),
      ];
      const props = edgeProps.length > 0 ? ` [${edgeProps.join(", ")}]` : "";
      const text = edge.label ? cleanMultiline(edge.label) : "";
      // A label with a line break must be quoted to say so.
      const shown = text.includes("\n") ? `"${escapeString(text)}"` : text;
      const label = shown ? `: ${shown}${props}` : props ? `:${props}` : "";
      return `${writeName(nameOf.get(edge.from)!)} ${connectorFor(edge)} ${writeName(nameOf.get(edge.to)!)}${label}`;
    });
  if (edgeLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...edgeLines);
  }
  return { code: lines.length > 0 ? `${lines.join("\n")}\n` : "", names: nameOf, frameNames: frameNameOf };
};
