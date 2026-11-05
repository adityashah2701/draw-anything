import type { VocabularyEntry, VocabularyFamily } from "./types";

const A: VocabularyFamily = "architecture";
const F: VocabularyFamily = "flowchart";
const E: VocabularyFamily = "er";
const U: VocabularyFamily = "uml";
const G: VocabularyFamily = "general";
const M: VocabularyFamily = "mind-map";
const S: VocabularyFamily = "sequence";

const outline = (
  id: string,
  category: string,
  name: string,
  aliases: string[],
  families: VocabularyFamily[],
  guidance: string,
): VocabularyEntry => ({ id, category, name, aliases, families, tier: 1, representation: { kind: "outline", variant: id }, guidance, status: "supported" });

const shape = (
  id: string,
  shapeName: "rectangle" | "diamond" | "pill" | "ellipse" | "icon",
  name: string,
  aliases: string[],
  families: VocabularyFamily[],
  guidance: string,
): VocabularyEntry => ({ id, category: "basic", name, aliases, families, tier: 4, representation: { kind: "shape", shape: shapeName }, guidance, status: "supported" });

const parametric = (
  id: string,
  category: string,
  name: string,
  aliases: string[],
  families: VocabularyFamily[],
  guidance: string,
  representation: Extract<VocabularyEntry["representation"], { kind: "parametric" }>,
): VocabularyEntry => ({ id, category, name, aliases, families, tier: 2, representation, guidance, status: "supported" });

/**
 * Words that stay out of `aliases` because the language already answers them with a hint: `database`
 * (use a kind or the cylinder), `circle`, `triangle`.
 */
export const VOCABULARY: readonly VocabularyEntry[] = [
  shape("rectangle", "rectangle", "Box", ["box", "process", "task"], [A, F, U, G], "The default node: a step, a service, a class."),
  shape("diamond", "diamond", "Decision", ["decision", "choice", "gateway"], [F, U], "A question with two or more labelled ways out."),
  shape("pill", "pill", "Terminator", ["terminator", "oval"], [F, U], "Where a flow starts or ends."),
  shape("icon", "icon", "Icon", [], [A, G], "A recognisable thing (a service, a device) drawn as its icon with the name beneath."),

  outline("cylinder", "storage", "Cylinder", ["datastore", "db"], [A, E, F], "A database or any store of records."),
  outline("queue", "messaging", "Queue", [], [A], "A message queue, stream or channel that carries messages between parts."),
  outline("cloud", "network", "Cloud", ["internet", "provider"], [A, G], "The internet, a provider or anything outside your control."),
  outline("document", "documents", "Document", ["file", "report"], [F, G], "A single document, report or file."),
  outline("documents", "documents", "Documents", ["multiple-documents"], [F, G], "Several documents or a bundle of records."),
  outline("hexagon", "process", "Hexagon", ["preparation"], [F, A], "A preparation step, or a service or module that should stand out."),
  outline("parallelogram", "process", "Data", ["data", "input-output", "io"], [F], "Data going in or coming out of a flow."),
  outline("predefined-process", "process", "Predefined process", ["subroutine"], [F], "A step that is defined elsewhere, such as a subroutine or another diagram."),
  outline("manual-input", "process", "Manual input", [], [F], "Data typed in by a person."),
  outline("manual-operation", "process", "Manual operation", [], [F], "A step done by hand."),
  outline("delay", "process", "Delay", [], [F], "Waiting, a pause or a buffer."),
  outline("step", "process", "Step", ["chevron", "process-step"], [F, G], "A stage in a pipeline or a phase in a process, in order."),
  outline("package", "structure", "Package", ["namespace", "folder"], [U, A], "A group of things: a package, namespace or module that holds others."),
  outline("component", "structure", "Component", ["module", "subsystem"], [U, A], "A software component or module with an interface."),
  outline("person", "actors", "Person", ["actor", "stick-figure"], [U, A, S, G], "A user, an actor or a role."),
  outline("note", "annotation", "Note", ["sticky", "constraint", "artifact"], [G, U, F], "A note, a constraint or an annotation attached to something."),
  outline("callout", "annotation", "Callout", ["speech-bubble", "bubble"], [G, M], "A comment, a quote or an idea to point at."),

  // Pictures a plain shape cannot draw: an outline with a border, a marker or a stack.
  parametric("initial-state", "states", "Initial state", ["start-state", "initial"], [U], "Where a state machine begins: a filled dot.", { kind: "parametric", base: "ring", marker: "dot" }),
  parametric("final-state", "states", "Final state", ["end-state", "final"], [U], "Where a state machine ends: a ring around a dot.", { kind: "parametric", base: "ring", marker: "bullseye" }),
  parametric("identifying-relationship", "er", "Identifying relationship", ["weak-relationship"], [E], "The relationship that identifies a weak entity: a double diamond.", { kind: "parametric", base: "rhombus", border: "double" }),
  parametric("start-event", "bpmn", "Start event", ["bpmn-start"], [F], "Where a BPMN process begins: a thin circle.", { kind: "parametric", base: "ring" }),
  parametric("intermediate-event", "bpmn", "Intermediate event", ["bpmn-intermediate", "multivalued-attribute"], [F, E], "A double circle: something that happens during a BPMN process, or an ER attribute that can hold several values.", { kind: "parametric", base: "ring", border: "double" }),
  parametric("end-event", "bpmn", "End event", ["bpmn-end"], [F], "Where a BPMN process ends: a thick circle.", { kind: "parametric", base: "ring", border: "thick" }),
  parametric("timer-event", "bpmn", "Timer event", ["timer"], [F], "A BPMN event that waits for a time or a date: a double circle with a clock.", { kind: "parametric", base: "ring", border: "double", marker: "clock" }),
  parametric("message-event", "bpmn", "Message event", ["message"], [F], "A BPMN event that sends or receives a message: a double circle with an envelope.", { kind: "parametric", base: "ring", border: "double", marker: "envelope" }),
  parametric("exclusive-gateway", "bpmn", "Exclusive gateway", ["xor-gateway", "xor"], [F], "A BPMN split or join where exactly one way is taken: a diamond with a cross.", { kind: "parametric", base: "rhombus", marker: "cross" }),
  parametric("parallel-gateway", "bpmn", "Parallel gateway", ["and-gateway"], [F], "A BPMN split or join where every way is taken: a diamond with a plus.", { kind: "parametric", base: "rhombus", marker: "plus" }),
  parametric("inclusive-gateway", "bpmn", "Inclusive gateway", ["or-gateway"], [F], "A BPMN split or join where one or more ways are taken: a diamond with a circle.", { kind: "parametric", base: "rhombus", marker: "circle" }),
  parametric("event-based-gateway", "bpmn", "Event-based gateway", [], [F], "A BPMN split decided by which event happens first: a diamond with a pentagon.", { kind: "parametric", base: "rhombus", marker: "pentagon" }),
  parametric("complex-gateway", "bpmn", "Complex gateway", [], [F], "A BPMN split or join with its own condition: a diamond with an asterisk.", { kind: "parametric", base: "rhombus", marker: "asterisk" }),

  // Structured shapes that need their own data model are named here and listed nowhere until they exist.
  { id: "entity-table", category: "er", name: "Entity table", aliases: ["entity", "table"], families: [E], tier: 3, representation: { kind: "element", type: "entity-table" }, guidance: "An ER entity with rows for its attributes.", status: "planned" },
  { id: "uml-class", category: "uml", name: "Class", aliases: ["class", "interface"], families: [U], tier: 3, representation: { kind: "element", type: "uml-classifier" }, guidance: "A UML class with name, attribute and operation compartments.", status: "planned" },
  { id: "lifeline", category: "sequence", name: "Lifeline", aliases: ["participant"], families: [S], tier: 3, representation: { kind: "element", type: "lifeline" }, guidance: "A participant in a sequence diagram with its lifeline.", status: "planned" },
  { id: "mindmap-topic", category: "mind-map", name: "Topic", aliases: ["topic", "branch"], families: [M], tier: 3, representation: { kind: "element", type: "mindmap-node" }, guidance: "A topic in a mind map, drawn with its own branch.", status: "planned" },
];
