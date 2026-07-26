import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type AIModelProvider =
  | "gemini"
  | "groq"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "local";

export type AIDiagramType =
  | "architecture"
  | "flowchart"
  | "concept"
  | "mind-map"
  | "sequence"
  | "network"
  | "entity-relationship"
  | "workflow"
  | "class"
  | "organization"
  | "dependency";

export type AISemanticNodeKind =
  | "service"
  | "database"
  | "server"
  | "api"
  | "queue"
  | "cache"
  | "storage"
  | "cdn"
  | "dns"
  | "firewall"
  | "waf"
  | "load-balancer"
  | "internet"
  | "kubernetes"
  | "pod"
  | "cluster"
  | "container"
  | "worker"
  | "service-mesh"
  | "deployment"
  | "namespace"
  | "region"
  | "availability-zone"
  | "vm"
  | "user"
  | "mobile"
  | "browser"
  | "lambda"
  | "event-bus"
  | "secrets"
  | "authentication"
  | "gateway"
  | "message-broker"
  | "ai-model"
  | "agent"
  | "tool"
  | "memory"
  | "knowledge-base"
  | "vector-store"
  | "dashboard"
  | "alerting"
  | "config"
  | "cicd"
  | "workflow"
  | "decision"
  | "parallel"
  | "retry"
  | "loop"
  | "external"
  | "generic";

export type AILayoutStrategy =
  | "layered"
  | "hierarchical"
  | "radial"
  | "tree"
  | "grid"
  | "dag"
  | "swimlane";

export interface AIDiagramNode {
  id: string;
  label: string;
  kind: AISemanticNodeKind;
  layer?: "edge" | "application" | "data" | "observability" | "external";
  column?: number;
  parentId?: string;
  description?: string;
  priority?: number;
}

export interface AIDiagramEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  relationship?: string;
  bidirectional?: boolean;
  dashed?: boolean;
}

export interface AIDiagramGroup {
  id: string;
  label: string;
  nodeIds: string[];
  kind?: string;
}

export interface AIRequirement {
  id: string;
  text: string;
  priority: "must" | "should" | "could";
  source: "prompt" | "canvas" | "memory" | "inferred";
}

export interface AIArchitectureComponent {
  id: string;
  label: string;
  responsibility: string;
  kind: AISemanticNodeKind;
  criticality?: "low" | "medium" | "high";
}

export interface AIContainer {
  id: string;
  label: string;
  nodeIds: string[];
  kind: "system" | "boundary" | "deployment" | "data" | "team";
}

export interface AIAnnotation {
  id: string;
  targetId?: string;
  text: string;
  severity?: "info" | "warning" | "risk";
}

export interface AITrustBoundary {
  id: string;
  label: string;
  nodeIds: string[];
  riskLevel?: "low" | "medium" | "high";
}

export interface AICommunicationProtocol {
  id: string;
  from: string;
  to: string;
  protocol: string;
  pattern?: "sync" | "async" | "streaming" | "batch";
}

export interface AIVisualImportance {
  nodeId: string;
  score: number;
  reason?: string;
}

export interface AIReasoningMetadata {
  requirementsSummary: string;
  architectureSummary: string;
  risks: string[];
  criticNotes: string[];
  toolResults: Array<{
    toolName: string;
    summary: string;
  }>;
}

export interface AIMemoryContext {
  memories: Array<{
    id: string;
    summary: string;
    tags: string[];
  }>;
  canvasSummary?: string;
  fallbackUsed: boolean;
}

export interface AIToolResult {
  toolName: string;
  summary: string;
  data?: unknown;
}

export interface AICriticNote {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  targetId?: string;
}

export interface AIDiagramValidationIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  targetId?: string;
}

export interface AIDiagramValidationReport {
  valid: boolean;
  repaired: boolean;
  issues: AIDiagramValidationIssue[];
  metrics: {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
    disconnectedComponents: number;
    duplicateIds: number;
    invalidEdges: number;
    overlapCount: number;
    orphanNodes: number;
    oversizedRows: number;
    poorSpacing: number;
  };
}

export interface AIDiagramDocumentV1 {
  schemaVersion: "ai-diagram-v1";
  diagramType: AIDiagramType;
  intent: {
    prompt: string;
    summary: string;
    audience?: string;
  };
  nodes: AIDiagramNode[];
  edges: AIDiagramEdge[];
  groups: AIDiagramGroup[];
  requirements: AIRequirement[];
  architecture: AIArchitectureComponent[];
  containers: AIContainer[];
  annotations: AIAnnotation[];
  trustBoundaries: AITrustBoundary[];
  communicationProtocols: AICommunicationProtocol[];
  visualImportance: AIVisualImportance[];
  layoutHints: {
    strategy: AILayoutStrategy;
    direction: "left-to-right" | "top-to-bottom" | "radial";
  };
  styleHints: {
    theme: "default" | "technical" | "product" | "minimal";
    density: "compact" | "balanced" | "spacious";
  };
  validation: AIDiagramValidationReport;
  metadata: {
    generationId: string;
    createdAt: string;
    provider: AIModelProvider;
    model: string;
    improvementPasses: number;
  };
  reasoningMetadata: AIReasoningMetadata;
}

export type AIFrameStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AIWorkflowPhase =
  | "contextRetriever"
  | "architecturePlanner"
  | "domainModeler"
  | "infrastructureExpander"
  | "relationshipAgent"
  | "diagramComposer"
  | "layoutAgent"
  | "validationAgent"
  | "intermediateCompile"
  | "criticAgent"
  | "repairAgent"
  | "expansionAgent"
  | "completenessCheck"
  | "canvasCompiler";

export interface AIMissingComponent {
  label: string;
  kind: AISemanticNodeKind;
  layer: "edge" | "application" | "data" | "observability" | "external";
  reason: string;
}

export interface AIFrameCheckpoint {
  phase: AIWorkflowPhase;
  at: string;
  summary: string;
}

export interface AIFrame {
  frameId: string;
  whiteboardId?: string;
  prompt: string;
  provider: AIModelProvider;
  status: AIFrameStatus;
  currentPhase: AIWorkflowPhase | null;
  events: AIStreamEvent[];
  checkpoints: AIFrameCheckpoint[];
  finalGraph?: AIDiagramDocumentV1;
  finalElementIds: string[];
}

export type AIStreamEvent =
  | {
      type: "frame.created";
      frame: Pick<
        AIFrame,
        "frameId" | "whiteboardId" | "prompt" | "provider" | "status"
      >;
    }
  | {
      type: "phase.started" | "phase.completed";
      frameId: string;
      phase: AIWorkflowPhase;
      message: string;
    }
  | {
      type: "graph.delta";
      frameId: string;
      phase: AIWorkflowPhase;
      graph: Pick<AIDiagramDocumentV1, "diagramType" | "nodes" | "edges" | "groups">;
    }
  | {
      type: "validation.report";
      frameId: string;
      report: AIDiagramValidationReport;
    }
  | {
      type: "memory.loaded";
      frameId: string;
      memory: AIMemoryContext;
    }
  | {
      type: "requirements.extracted";
      frameId: string;
      requirements: AIRequirement[];
      actors: string[];
      systems: string[];
    }
  | {
      type: "infrastructure.expanded";
      frameId: string;
      addedNodeIds: string[];
      infrastructure: string[];
    }
  | {
      type: "critic.report";
      frameId: string;
      notes: AICriticNote[];
    }
  | {
      type: "repair.applied";
      frameId: string;
      pass: number;
      summary: string;
    }
  | {
      type: "node.created";
      frameId: string;
      node: AIDiagramNode;
    }
  | {
      type: "element.batch";
      frameId: string;
      elements: DrawingElement[];
    }
  | {
      type: "frame.done";
      frameId: string;
      count: number;
      graph: AIDiagramDocumentV1;
    }
  | {
      type: "frame.error";
      frameId: string;
      message: string;
    };

export interface AIGenerateDiagramRequest {
  prompt: string;
  model?: AIModelProvider;
  provider?: AIModelProvider;
  whiteboardId?: string;
  canvasContext?: {
    elements?: DrawingElement[];
    selectedElementIds?: string[];
    viewport?: {
      zoom: number;
      panOffset: { x: number; y: number };
      width: number;
      height: number;
    };
  };
}
