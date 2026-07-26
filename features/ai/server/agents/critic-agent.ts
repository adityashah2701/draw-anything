import { AICriticNote, AIMissingComponent } from "@/features/ai/types";
import { analyzeDiagram } from "@/features/ai/server/tools/diagram-analyzer";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

const REQUIRED_KINDS_BY_LAYER: Record<string, string[]> = {
  edge: ["user", "browser", "mobile", "cdn", "dns"],
  application: ["api", "gateway", "authentication", "service", "worker", "lambda"],
  data: ["database", "cache", "queue", "storage", "message-broker", "event-bus", "vector-store"],
  observability: ["dashboard", "alerting"],
  external: ["external", "firewall", "waf", "load-balancer"],
};

const detectMissingByLayer = (
  existingNodeKinds: Set<string>,
  existingLayers: Set<string>,
): AIMissingComponent[] => {
  const missing: AIMissingComponent[] = [];

  for (const [layer, requiredKinds] of Object.entries(REQUIRED_KINDS_BY_LAYER)) {
    const layerExists = existingLayers.has(layer);
    const hasAnyRequired = requiredKinds.some((kind) => existingNodeKinds.has(kind));

    if (!layerExists || !hasAnyRequired) {
      const suggestions: Array<{ kind: string; label: string; reason: string }> = [];

      if (layer === "edge") {
        if (!existingNodeKinds.has("user") && !existingNodeKinds.has("browser")) {
          suggestions.push({ kind: "browser", label: "Web Client", reason: "Edge layer needs client representation" });
        }
        if (!existingNodeKinds.has("cdn")) {
          suggestions.push({ kind: "cdn", label: "CDN", reason: "Content delivery for static assets" });
        }
      }
      if (layer === "application") {
        if (!existingNodeKinds.has("gateway") && !existingNodeKinds.has("api")) {
          suggestions.push({ kind: "gateway", label: "API Gateway", reason: "Single entry point for client requests" });
        }
        if (!existingNodeKinds.has("authentication")) {
          suggestions.push({ kind: "authentication", label: "Auth Service", reason: "Authentication and authorization layer" });
        }
      }
      if (layer === "data") {
        if (!existingNodeKinds.has("database")) {
          suggestions.push({ kind: "database", label: "Primary Database", reason: "Persistent data storage" });
        }
        if (!existingNodeKinds.has("cache")) {
          suggestions.push({ kind: "cache", label: "Cache (Redis)", reason: "Performance optimization via caching" });
        }
        if (!existingNodeKinds.has("queue") && !existingNodeKinds.has("message-broker")) {
          suggestions.push({ kind: "queue", label: "Message Queue", reason: "Async processing and decoupling" });
        }
      }
      if (layer === "observability") {
        if (!existingNodeKinds.has("dashboard")) {
          suggestions.push({ kind: "dashboard", label: "Monitoring Dashboard", reason: "Visibility into system health" });
        }
        if (!existingNodeKinds.has("alerting")) {
          suggestions.push({ kind: "alerting", label: "Alerting System", reason: "Proactive incident detection" });
        }
      }

      suggestions.forEach((s) => {
        missing.push({
          label: s.label,
          kind: s.kind as AIMissingComponent["kind"],
          layer: layer as AIMissingComponent["layer"],
          reason: s.reason,
        });
      });
    }
  }

  return missing;
};

export const criticAgent = async (
  state: AIWorkflowState,
  _runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.document) throw new Error("Critic agent needs a document.");
  const frame = { ...state.frame, currentPhase: "criticAgent" as const };
  logAIPhase(frame.frameId, "criticAgent", "Critiquing architecture graph completeness");

  const analysis = analyzeDiagram(state.document);
  const notes: AICriticNote[] = [
    ...state.document.validation.issues.map((issue, index) => ({
      id: `validation-note-${index + 1}`,
      severity: issue.severity,
      message: issue.message,
      targetId: issue.targetId,
    })),
  ];

  if (analysis.graph.orphanNodeIds.length > 0) {
    notes.push({
      id: "critic-orphans",
      severity: "warning",
      message: `${analysis.graph.orphanNodeIds.length} orphan nodes should be connected or removed.`,
    });
  }

  const existingKinds = new Set(state.document.nodes.map((n) => n.kind));
  const existingLayers = new Set(
    state.document.nodes.map((n) => n.layer).filter((l): l is NonNullable<typeof l> => l != null),
  );

  const layerMissing = detectMissingByLayer(existingKinds, existingLayers);
  const completenessIssues: AIMissingComponent[] = [...layerMissing];

  if (state.document.nodes.length < 10) {
    notes.push({
      id: "critic-too-small",
      severity: "warning",
      message: `Architecture diagram has only ${state.document.nodes.length} nodes. Production architectures typically have 25+ components. Consider adding: monitoring, caching, queue, auth, load balancer, CI/CD.`,
    });
  }

  if (completenessIssues.length > 0) {
    notes.push({
      id: "critic-incomplete",
      severity: "warning",
      message: `Diagram is missing ${completenessIssues.length} architectural components across layers: ${[...new Set(completenessIssues.map((c) => c.layer))].join(", ")}.`,
    });
  }

  if (state.document.edges.length < state.document.nodes.length * 0.8) {
    notes.push({
      id: "critic-sparse-edges",
      severity: "info",
      message: `Diagram has ${state.document.edges.length} edges for ${state.document.nodes.length} nodes. Consider adding more connection labels and edge relationships.`,
    });
  }

  let completenessScore = 10;
  const layerNames: Array<"edge" | "application" | "data" | "observability" | "external"> = ["edge", "application", "data", "observability", "external"];
  const coveredLayers = layerNames.filter((l) => existingLayers.has(l));
  completenessScore -= (layerNames.length - coveredLayers.length) * 1.5;
  completenessScore -= Math.min(3, completenessIssues.length * 0.5);
  completenessScore = Math.max(0, Math.min(10, completenessScore));

  const isComplete = completenessScore >= 5 && completenessIssues.length <= 2;

  return {
    frame,
    criticNotes: notes,
    missingComponents: completenessIssues ?? [],
    isComplete: Boolean(isComplete),
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Completeness Analyzer",
        summary: `Score: ${completenessScore.toFixed(1)}/10, ${completenessIssues.length} missing components, ${coveredLayers.length}/${layerNames.length} layers covered`,
        data: { completenessScore, missingComponents: completenessIssues, coveredLayers },
      },
    ],
    events: [
      phaseStarted(frame.frameId, "criticAgent", "Reviewing architecture completeness"),
      { type: "critic.report", frameId: frame.frameId, notes },
      phaseCompleted(
        frame.frameId,
        "criticAgent",
        isComplete
          ? `Architecture complete (${completenessScore.toFixed(1)}/10)`
          : `Found ${completenessIssues.length} gaps (score: ${completenessScore.toFixed(1)}/10)`,
      ),
    ],
    checkpoints: [checkpoint("criticAgent", `Completeness score: ${completenessScore.toFixed(1)}/10, ${completenessIssues.length} missing components`)],
  };
};
