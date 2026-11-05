import type { AIDiagramType } from "@/features/ai/types";

/**
 * How each diagram type is drawn, in one table: its family, the direction it reads in, how its connectors
 * look, and the guidance the agent is given. The prompt, the compiler and the evaluation read it, so they
 * cannot disagree. A header in the diagram's own code (`direction right`) or an option from the caller
 * beats the profile; nothing here is a constant of the layout engine.
 */
export type ProfileFamily = "architecture" | "flowchart" | "er" | "uml" | "sequence" | "mind-map";
export type ConnectorStyle = "elbow" | "straight" | "curved";
export type ProfileDirection = "top-to-bottom" | "left-to-right";

export interface DiagramProfile {
  family: ProfileFamily;
  direction: ProfileDirection;
  /** elbow: right-angle routes with soft corners; straight: direct lines; curved: smoothed routes. */
  connector: ConnectorStyle;
  /** How the agent should compose a diagram of this type. Judgement guidance, not limits. */
  guidance: string;
}

const profile = (family: ProfileFamily, guidance: string, connector: ConnectorStyle = "elbow"): DiagramProfile => ({
  family,
  direction: "top-to-bottom",
  connector,
  guidance,
});

export const PROFILES: Record<AIDiagramType, DiagramProfile> = {
  architecture: profile(
    "architecture",
    "Actors and entry points first (users, clients, CDN), then the edge (gateway, load balancer), services, then data stores and external systems. Put each tier in a group with a plain name. Show the main request path left to right in declaration order; put cross-cutting parts (monitoring, secrets, CI/CD) in their own group and connect them once, not to everything. Label a connection only when the protocol or meaning is not obvious.",
  ),
  flowchart: profile(
    "flowchart",
    "One start (kind: start) and one or more ends (kind: end); they are drawn as rounded terminators. Every decision is a question ending in ? with each outgoing branch labelled (yes/no or the condition). Keep the happy path straight; loops go back with a short label (retry). Steps are short verb phrases. Use kind decision ONLY for branching questions; steps are kind workflow, never decision. No groups unless there are clear phases.",
  ),
  network: profile(
    "architecture",
    "Group by zone (internet, DMZ, internal, cloud). Show firewalls and load balancers on the boundaries between zones. One connection per link; avoid labelling every link.",
  ),
  "entity-relationship": profile(
    "er",
    "One node per entity, named in the singular. Connect related entities once with a label naming the relationship (has, belongs to). Group by bounded context when there are many.",
  ),
  "mind-map": profile(
    "mind-map",
    "A single central idea, 4-7 main branches, each with 2-4 children. Short noun phrases. No labels on connections.",
    "curved",
  ),
  concept: profile(
    "mind-map",
    "The core concept in the middle of the story, supporting ideas around it, connected with short verbs. Group related ideas.",
    "curved",
  ),
  workflow: profile(
    "flowchart",
    "Phases as groups, steps as short verb phrases in order, handoffs between teams or systems labelled. Decisions are questions with labelled branches.",
  ),
  dependency: profile(
    "architecture",
    "Arrows point from the dependent to what it depends on. Group by package or layer. Show only direct dependencies.",
  ),
  organization: profile(
    "architecture",
    "Top of the hierarchy first; one connection from each manager to each report. Group by department.",
  ),
  sequence: profile(
    "sequence",
    "Order matters: declare participants left to right in the order they first act, and connections in time order. Label every message with the action.",
  ),
  class: profile(
    "uml",
    "One node per class or interface, grouped by module. Connect with labelled relationships (extends, uses).",
  ),
};

/** The profile for a diagram type; anything unknown or missing is drawn as an architecture. */
export const profileFor = (diagramType: string | undefined): DiagramProfile =>
  (PROFILES as Record<string, DiagramProfile>)[(diagramType ?? "").toLowerCase()] ?? PROFILES.architecture;
