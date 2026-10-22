import type { AIDiagramType } from "@/features/ai/types";
import type { Span } from "./source";

/**
 * The validated diagram the language produces. Plain data: no canvas types, no source text. Every
 * layer after the parser (layout, canvas, formatter, agent tools) reads this and nothing else, so
 * there is exactly one meaning of a program.
 *
 * Containment has a single owner: a node, group or frame names its innermost container in
 * `parent`. A container's members are derived (`membersOf`), never stored twice.
 */

export type EdgeSide = "top" | "right" | "bottom" | "left";

export interface ContainerRef {
  type: "group" | "frame";
  id: string;
}

export interface IRNode {
  /** Stable id derived from the name; what edges and the canvas refer to. */
  id: string;
  /** The name as written; connections refer to this. */
  name: string;
  /** Text shown on the canvas (the `label` property, else the name). */
  label: string;
  /** Raw `kind` value; normalised later against the known kinds. */
  kind?: string;
  icon?: string;
  dashed?: boolean;
  /** diamond, pill, icon, or an outline variant id (core/shapes/outline/variants.ts). */
  shape?: string;
  /** #rrggbb */
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parent?: ContainerRef;
  /** Where the node was first written. */
  span: Span;
}

export interface IREdge {
  /** Stable across edits that leave its two ends alone: `from-to-to`, numbered when the same pair repeats. */
  id: string;
  from: string;
  to: string;
  label?: string;
  bidirectional?: boolean;
  dashed?: boolean;
  /** `-` / `--`: a line with no arrowhead. */
  plain?: boolean;
  color?: string;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  line: number;
  span: Span;
}

export interface IRGroup {
  id: string;
  name: string;
  label: string;
  parent?: ContainerRef;
  span: Span;
}

export interface IRFrame {
  id: string;
  name: string;
  /** The title shown in the frame's header (the `label` property, else the name). */
  title: string;
  /** A frame's parent is always a frame: a group cannot contain one. */
  parent?: ContainerRef;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Space between the border and the contents. */
  padding?: number;
  color?: string;
  span: Span;
}

export interface DiagramIR {
  title?: string;
  diagramType?: AIDiagramType;
  direction?: "down" | "right";
  nodes: IRNode[];
  edges: IREdge[];
  groups: IRGroup[];
  frames: IRFrame[];
}

export type SymbolKind = "node" | "group" | "frame";

/** Every place a name is written, for hover, go-to-definition and rename. */
export interface SymbolReference {
  kind: SymbolKind;
  id: string;
  span: Span;
  /** True where the name is declared (nodes: the first mention). */
  definition: boolean;
}

export const emptyIR = (): DiagramIR => ({ nodes: [], edges: [], groups: [], frames: [] });

/** Ids of every node inside a container, at any depth, in declaration order. */
export const membersOf = (ir: DiagramIR, container: ContainerRef): string[] => {
  const parents = new Map<string, ContainerRef | undefined>();
  for (const group of ir.groups) parents.set(`group:${group.id}`, group.parent);
  for (const frame of ir.frames) parents.set(`frame:${frame.id}`, frame.parent);
  const inside = (start: ContainerRef | undefined): boolean => {
    for (let at = start, guard = 0; at && guard < 1_000; guard += 1) {
      if (at.type === container.type && at.id === container.id) return true;
      at = parents.get(`${at.type}:${at.id}`);
    }
    return false;
  };
  return ir.nodes.filter((node) => inside(node.parent)).map((node) => node.id);
};

/** The meaning of a diagram as a string: the IR without source positions. Equal fingerprints mean equal diagrams. */
export const irFingerprint = (ir: DiagramIR): string =>
  JSON.stringify(ir, (key, value) => (key === "span" || key === "line" ? undefined : value));
