export type SceneNode = {
  id: string;
  kind: "pill" | "rect" | "diamond";
  cx: number;
  cy: number;
  w: number;
  h: number;
  label: string;
};

export type Direction = "up" | "down" | "left" | "right";

export type SceneEdge = {
  id: string;
  d: string;
  /** The arrowhead tip, drawn separately so it appears after the line reaches it. */
  head: { x: number; y: number; dir: Direction };
  label?: { text: string; x: number; y: number; anchor?: "start" | "middle" };
};

export type Scene = {
  id: string;
  title: string;
  prompt: string;
  nodes: SceneNode[];
  edges: SceneEdge[];
  /** Build order: a connector always follows the shapes it joins. */
  order: string[];
};

export const VIEW = { w: 520, h: 370 } as const;

export const scenes: Scene[] = [
  {
    id: "login",
    title: "Login flow",
    prompt: "Create a login flow with a retry path when the password is wrong",
    nodes: [
      { id: "start", kind: "pill", cx: 260, cy: 28, w: 84, h: 32, label: "Start" },
      { id: "login", kind: "rect", cx: 260, cy: 100, w: 140, h: 36, label: "Enter credentials" },
      { id: "valid", kind: "diamond", cx: 260, cy: 186, w: 140, h: 72, label: "Valid?" },
      { id: "error", kind: "rect", cx: 110, cy: 282, w: 140, h: 36, label: "Show error" },
      { id: "dash", kind: "rect", cx: 410, cy: 282, w: 140, h: 36, label: "Open dashboard" },
      { id: "end", kind: "pill", cx: 410, cy: 344, w: 84, h: 32, label: "End" },
    ],
    edges: [
      { id: "e1", d: "M260 44V82", head: { x: 260, y: 82, dir: "down" } },
      { id: "e2", d: "M260 118V150", head: { x: 260, y: 150, dir: "down" } },
      { id: "e3", d: "M190 186H110V264", head: { x: 110, y: 264, dir: "down" }, label: { text: "No", x: 150, y: 177, anchor: "middle" } },
      { id: "e4", d: "M330 186H410V264", head: { x: 410, y: 264, dir: "down" }, label: { text: "Yes", x: 368, y: 177, anchor: "middle" } },
      { id: "e5", d: "M410 300V328", head: { x: 410, y: 328, dir: "down" } },
      { id: "e6", d: "M40 282H18V100H190", head: { x: 190, y: 100, dir: "right" }, label: { text: "Retry", x: 26, y: 200, anchor: "start" } },
    ],
    order: ["start", "login", "e1", "valid", "e2", "error", "e3", "dash", "e4", "end", "e5", "e6"],
  },
  {
    id: "approval",
    title: "Approval flow",
    prompt: "Draw an expense approval flow: anything over $1,000 goes to a manager",
    nodes: [
      { id: "start", kind: "pill", cx: 260, cy: 28, w: 150, h: 32, label: "Expense submitted" },
      { id: "amount", kind: "diamond", cx: 260, cy: 120, w: 200, h: 84, label: "Over $1,000?" },
      { id: "auto", kind: "rect", cx: 110, cy: 236, w: 150, h: 36, label: "Auto-approve" },
      { id: "manager", kind: "rect", cx: 410, cy: 236, w: 150, h: 36, label: "Manager review" },
      { id: "done", kind: "pill", cx: 260, cy: 330, w: 120, h: 32, label: "Approved" },
    ],
    edges: [
      { id: "e1", d: "M260 44V80", head: { x: 260, y: 80, dir: "down" } },
      { id: "e2", d: "M160 120H110V218", head: { x: 110, y: 218, dir: "down" }, label: { text: "No", x: 135, y: 111, anchor: "middle" } },
      { id: "e3", d: "M360 120H410V218", head: { x: 410, y: 218, dir: "down" }, label: { text: "Yes", x: 385, y: 111, anchor: "middle" } },
      { id: "e4", d: "M110 254V330H200", head: { x: 200, y: 330, dir: "right" } },
      { id: "e5", d: "M410 254V330H320", head: { x: 320, y: 330, dir: "left" } },
    ],
    order: ["start", "amount", "e1", "auto", "e2", "manager", "e3", "done", "e4", "e5"],
  },
];

/** Triangle points for an arrowhead whose tip is at (x, y), pointing in `dir`. */
export function arrowPoints({ x, y, dir }: SceneEdge["head"]): string {
  const len = 8;
  const half = 4.5;
  switch (dir) {
    case "down":
      return `${x},${y} ${x - half},${y - len} ${x + half},${y - len}`;
    case "up":
      return `${x},${y} ${x - half},${y + len} ${x + half},${y + len}`;
    case "right":
      return `${x},${y} ${x - len},${y - half} ${x - len},${y + half}`;
    case "left":
      return `${x},${y} ${x + len},${y - half} ${x + len},${y + half}`;
  }
}
