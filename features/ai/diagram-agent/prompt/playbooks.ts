/** How a good diagram of each type is composed. Judgement guidance, not limits. */
export const PLAYBOOKS: Record<string, string> = {
  architecture:
    "Actors and entry points first (users, clients, CDN), then the edge (gateway, load balancer), services, then data stores and external systems. Put each tier in a group with a plain name. Show the main request path left to right in declaration order; put cross-cutting parts (monitoring, secrets, CI/CD) in their own group and connect them once, not to everything. Label a connection only when the protocol or meaning is not obvious.",
  flowchart:
    "One start, one or more ends. Every decision is a question ending in ? with each outgoing branch labelled (yes/no or the condition). Keep the happy path straight; loops go back with a short label (retry). Steps are short verb phrases. Use kind decision ONLY for branching questions; steps are kind workflow, never decision. No groups unless there are clear phases.",
  network:
    "Group by zone (internet, DMZ, internal, cloud). Show firewalls and load balancers on the boundaries between zones. One connection per link; avoid labelling every link.",
  "entity-relationship":
    "One node per entity, named in the singular. Connect related entities once with a label naming the relationship (has, belongs to). Group by bounded context when there are many.",
  "mind-map":
    "A single central idea, 4-7 main branches, each with 2-4 children. Short noun phrases. No labels on connections.",
  concept:
    "The core concept in the middle of the story, supporting ideas around it, connected with short verbs. Group related ideas.",
  workflow:
    "Phases as groups, steps as short verb phrases in order, handoffs between teams or systems labelled. Decisions are questions with labelled branches.",
  dependency:
    "Arrows point from the dependent to what it depends on. Group by package or layer. Show only direct dependencies.",
  organization:
    "Top of the hierarchy first; one connection from each manager to each report. Group by department.",
  sequence:
    "Order matters: declare participants left to right in the order they first act, and connections in time order. Label every message with the action.",
  class:
    "One node per class or interface, grouped by module. Connect with labelled relationships (extends, uses).",
};

export const playbookFor = (diagramType: string | undefined): string | undefined => PLAYBOOKS[(diagramType ?? "").toLowerCase()];
