import { AISemanticNodeKind } from "@/features/ai/types";

export const resolveIconLabel = (kind: AISemanticNodeKind) => {
  const labels: Partial<Record<AISemanticNodeKind, string>> = {
    database: "DB",
    cache: "CA",
    queue: "Q",
    dns: "DNS",
    firewall: "FW",
    waf: "WAF",
    "load-balancer": "LB",
    worker: "WK",
    "service-mesh": "SM",
    deployment: "DEP",
    namespace: "NS",
    dashboard: "DASH",
    alerting: "AL",
    config: "CFG",
    cicd: "CI",
    region: "REG",
    "availability-zone": "AZ",
  };
  return labels[kind] ?? kind.slice(0, 3).toUpperCase();
};
