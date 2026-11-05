/**
 * BPMN in the language (plan U13). `shape: event`, `gateway`, `task` and `subprocess` take small choices
 * (`position`, `trigger`, `gateway`, `task`, `throwing`) that are expanded here into what the canvas already
 * draws: an outline with a border and a marker, or a semantic node with an icon. Nothing new is stored.
 */
export const BPMN_POSITIONS = ["start", "intermediate", "end"] as const;
export const BPMN_TRIGGERS: Record<string, string> = {
  none: "",
  message: "envelope",
  timer: "clock",
  error: "bolt",
  signal: "triangle",
  conditional: "lines",
  escalation: "arrow-up",
  terminate: "square",
  link: "arrow-right",
};
export const BPMN_GATEWAYS: Record<string, string> = { exclusive: "cross", parallel: "plus", inclusive: "circle", "event-based": "pentagon", complex: "asterisk" };
export const BPMN_TASKS: Record<string, string> = { user: "user", service: "settings", script: "file-code", manual: "wrench", send: "mail", receive: "mail", rule: "scale" };

export const BPMN_SHAPES = [
  { name: "event", aliases: ["bpmn-event"], summary: "A BPMN event: a ring whose border says where it is (`position: start|intermediate|end`) and whose symbol says what triggers it (`trigger: message|timer|error|signal|conditional|escalation|terminate|link`); `throwing: true` fills the symbol." },
  { name: "gateway", aliases: ["bpmn-gateway"], summary: "A BPMN gateway: a diamond whose symbol is its kind (`gateway: exclusive|parallel|inclusive|event-based|complex`)." },
  { name: "task", aliases: ["bpmn-task"], summary: "A BPMN task: a rounded step with the glyph of its type (`task: user|service|script|manual|send|receive|rule`)." },
  { name: "subprocess", aliases: ["sub-process"], summary: "A BPMN subprocess: a box with the plus marker." },
] as const;

export interface BpmnChoices {
  position?: string;
  trigger?: string;
  gatewayType?: string;
  taskType?: string;
  throwing?: boolean;
}

export interface BpmnExpansion {
  shape?: string;
  border?: "double" | "thick";
  marker?: string;
  icon?: string;
}

/** What a BPMN shape name and its choices draw as; undefined for any other shape. */
export const expandBpmn = (shape: string | undefined, c: BpmnChoices): BpmnExpansion | undefined => {
  if (shape === "event") {
    const marker = BPMN_TRIGGERS[c.trigger ?? "none"];
    return {
      shape: "ring",
      border: c.position === "end" ? "thick" : c.position === "intermediate" ? "double" : undefined,
      ...(marker ? { marker: c.throwing ? `${marker}-filled` : marker } : {}),
    };
  }
  if (shape === "gateway") return { shape: "rhombus", ...(BPMN_GATEWAYS[c.gatewayType ?? "exclusive"] ? { marker: BPMN_GATEWAYS[c.gatewayType ?? "exclusive"] } : {}) };
  if (shape === "subprocess") return { shape: "box", marker: "plus" };
  if (shape === "task") return { shape: undefined, ...(c.taskType && BPMN_TASKS[c.taskType] ? { icon: BPMN_TASKS[c.taskType] } : {}) };
  return undefined;
};
