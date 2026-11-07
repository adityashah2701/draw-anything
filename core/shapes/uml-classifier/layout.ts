import { estimateTextWidth } from "@/core/text/estimate";
import type { UmlClassifierShape } from "@/core/model";
import { canonicalMember } from "./members";

export const LINE = 18;
export const PAD = 10;
const NAME_SIZE = 14;
const MEMBER_SIZE = 12;

export interface ClassifierLayout {
  /** The header: stereotype line (if any) and the name. */
  header: number;
  attributes: number;
  operations: number;
  minWidth: number;
  minHeight: number;
  showAttributes: boolean;
  showOperations: boolean;
}

const lines = (list: string[] | undefined): string[] => (Array.isArray(list) ? list.filter((s) => typeof s === "string").map(canonicalMember) : []);

export const stereotypeOf = (shape: Pick<UmlClassifierShape, "kind" | "stereotype">): string | undefined =>
  shape.stereotype ?? (shape.kind === "interface" ? "interface" : shape.kind === "enumeration" ? "enumeration" : shape.kind === "datatype" ? "dataType" : shape.kind === "record" ? "record" : undefined);

/** Compartments sized from their text: a compartment is a line per member plus padding, and a collapsed one takes no room. */
export const layoutClassifier = (shape: Pick<UmlClassifierShape, "kind" | "stereotype" | "name" | "attributes" | "operations" | "collapsed">): ClassifierLayout => {
  const attrs = lines(shape.attributes);
  const ops = lines(shape.operations);
  // An interface with no attributes shows only its operations, as UML draws it, instead of an empty box.
  const showAttributes = !shape.collapsed?.attributes && !(shape.kind === "interface" && attrs.length === 0);
  const showOperations = !shape.collapsed?.operations && shape.kind !== "enumeration";
  const header = (stereotypeOf(shape) ? LINE : 0) + 28;
  const attributes = showAttributes ? Math.max(attrs.length, 1) * LINE + 8 : 0;
  const operations = showOperations ? Math.max(ops.length, 1) * LINE + 8 : 0;
  const widest = Math.max(
    estimateTextWidth(shape.name ?? "Class", NAME_SIZE, "700"),
    ...(showAttributes ? attrs : []).map((l) => estimateTextWidth(l, MEMBER_SIZE, "400")),
    ...(showOperations ? ops : []).map((l) => estimateTextWidth(l, MEMBER_SIZE, "400")),
  );
  return { header, attributes, operations, minWidth: Math.max(110, Math.ceil(widest + PAD * 2)), minHeight: header + attributes + operations, showAttributes, showOperations };
};

export const classifierSize = (shape: Parameters<typeof layoutClassifier>[0]) => {
  const l = layoutClassifier(shape);
  return { width: l.minWidth, height: l.minHeight };
};

export const memberLines = lines;
