import {
  AIDiagramEdge,
  AIDiagramNode,
  AIGenerateDiagramRequest,
  AISemanticNodeKind,
} from "@/features/ai/types";

type InfraRule = {
  id: string;
  label: string;
  kind: AISemanticNodeKind;
  layer: AIDiagramNode["layer"];
  matches: RegExp;
};

const RULES: InfraRule[] = [
  { id: "dns", label: "DNS", kind: "dns", layer: "external", matches: /\b(web|domain|public|internet|ecommerce|customer)\b/i },
  { id: "waf", label: "WAF", kind: "waf", layer: "external", matches: /\b(public|secure|security|ecommerce|internet)\b/i },
  { id: "cdn", label: "CDN", kind: "cdn", layer: "external", matches: /\b(static|web|frontend|ecommerce|global)\b/i },
  { id: "load-balancer", label: "Load Balancer", kind: "load-balancer", layer: "edge", matches: /\b(scale|high availability|kubernetes|microservice|traffic|ecommerce)\b/i },
  { id: "cache", label: "Cache", kind: "cache", layer: "data", matches: /\b(scale|latency|fast|redis|cache|ecommerce)\b/i },
  { id: "queue", label: "Event Queue", kind: "queue", layer: "data", matches: /\b(async|event|order|job|worker|queue|ecommerce)\b/i },
  { id: "worker", label: "Workers", kind: "worker", layer: "application", matches: /\b(job|worker|background|async|order|notification)\b/i },
  { id: "observability", label: "Dashboards", kind: "dashboard", layer: "observability", matches: /\b(production|observability|monitor|alert|slo|system design|kubernetes)\b/i },
  { id: "alerting", label: "Alerting", kind: "alerting", layer: "observability", matches: /\b(production|alert|incident|pager|slo)\b/i },
  { id: "secrets", label: "Secrets", kind: "secrets", layer: "application", matches: /\b(secret|secure|kubernetes|production|oauth|token)\b/i },
  { id: "service-mesh", label: "Service Mesh", kind: "service-mesh", layer: "application", matches: /\b(kubernetes|service mesh|microservice|mesh)\b/i },
  { id: "namespace", label: "Namespace", kind: "namespace", layer: "application", matches: /\b(kubernetes|k8s|namespace)\b/i },
  { id: "deployment", label: "Deployment", kind: "deployment", layer: "application", matches: /\b(kubernetes|k8s|deployment|rollout)\b/i },
  { id: "cicd", label: "CI/CD", kind: "cicd", layer: "external", matches: /\b(cicd|ci\/cd|pipeline|deploy|github actions)\b/i },
];

const hasKind = (nodes: AIDiagramNode[], kind: AISemanticNodeKind) =>
  nodes.some((node) => node.kind === kind);

const firstByLayer = (nodes: AIDiagramNode[], layer: AIDiagramNode["layer"]) =>
  nodes.find((node) => node.layer === layer)?.id ?? nodes[0]?.id;

export const expandInfrastructure = (
  request: AIGenerateDiagramRequest,
  graph: { nodes: AIDiagramNode[]; edges: AIDiagramEdge[] },
) => {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const addedNodeIds: string[] = [];
  const prompt = request.prompt;

  RULES.forEach((rule) => {
    if (!rule.matches.test(prompt) || hasKind(nodes, rule.kind)) return;
    const target =
      rule.layer === "external"
        ? firstByLayer(nodes, "edge")
        : rule.layer === "data"
          ? firstByLayer(nodes, "application")
          : firstByLayer(nodes, "application") ?? firstByLayer(nodes, "edge");
    nodes.push({
      id: rule.id,
      label: rule.label,
      kind: rule.kind,
      layer: rule.layer,
      description: `Deterministically added ${rule.label} infrastructure.`,
      priority: rule.layer === "observability" ? 4 : 6,
    });
    addedNodeIds.push(rule.id);
    if (target) {
      edges.push({
        id: `edge-${rule.id}-${target}`,
        from: rule.layer === "external" ? rule.id : target,
        to: rule.layer === "external" ? target : rule.id,
        label: rule.kind === "queue" ? "events" : undefined,
        relationship: "infrastructure",
      });
    }
  });

  return {
    graph: { ...graph, nodes, edges },
    addedNodeIds,
    infrastructure: addedNodeIds,
  };
};
