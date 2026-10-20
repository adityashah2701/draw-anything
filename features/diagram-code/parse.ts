import { compileDiagramCode, membersOf } from "./language";
import type { DiagramIR } from "./language/ir";
import type { ParsedDiagramCode, ParsedEdge, ParsedFrame, ParsedGroup, ParsedNode } from "./types";

/**
 * The shape the canvas layer and the agent tools consume, projected from the validated diagram.
 * All parsing and validation lives in `language/`; this file only reshapes the result.
 */
export const parsedFromIR = (ir: DiagramIR, issues: ParsedDiagramCode["issues"]): ParsedDiagramCode => {
  const nodes: ParsedNode[] = ir.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    label: node.label,
    kind: node.kind,
    icon: node.icon,
    dashed: node.dashed,
    shape: node.shape,
    color: node.color,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));
  const edges: ParsedEdge[] = ir.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    bidirectional: edge.bidirectional,
    dashed: edge.dashed,
    plain: edge.plain,
    color: edge.color,
    fromSide: edge.fromSide,
    toSide: edge.toSide,
    line: edge.line,
  }));
  const groups: ParsedGroup[] = ir.groups.map((group) => ({
    id: group.id,
    label: group.label,
    nodeIds: membersOf(ir, { type: "group", id: group.id }),
    // A group inside a frame is a top-level group as far as groups are concerned.
    parentId: group.parent?.type === "group" ? group.parent.id : undefined,
  }));
  const frames: ParsedFrame[] = ir.frames.map((frame) => ({
    id: frame.id,
    title: frame.title,
    parentId: frame.parent?.id,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    padding: frame.padding,
    color: frame.color,
    nodeIds: membersOf(ir, { type: "frame", id: frame.id }),
  }));
  return { title: ir.title, diagramType: ir.diagramType, direction: ir.direction, nodes, edges, groups, frames, issues };
};

export const parseDiagramCode = (source: string): ParsedDiagramCode => {
  const { ir, diagnostics } = compileDiagramCode(source);
  return parsedFromIR(ir, diagnostics);
};
