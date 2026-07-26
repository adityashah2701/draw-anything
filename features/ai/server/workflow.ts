import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { AIStreamEvent, AIFrame, AIGenerateDiagramRequest } from "@/features/ai/types";
import {
  createAIChatModel,
  StructuredChatModel,
} from "@/features/ai/server/model-providers";
import {
  AIWorkflowState,
  AIWorkflowUpdate,
  AgentRuntime,
} from "@/features/ai/server/agents/types";
import { contextRetrieverAgent } from "@/features/ai/server/agents/context-retriever";
import { architecturePlannerAgent } from "@/features/ai/server/agents/architecture-planner";
import { domainModelerAgent } from "@/features/ai/server/agents/domain-modeler";
import { infrastructureExpanderAgent } from "@/features/ai/server/agents/infrastructure-expander";
import { relationshipAgent } from "@/features/ai/server/agents/relationship-agent";
import { diagramComposerAgent } from "@/features/ai/server/agents/diagram-composer";
import { layoutAgent } from "@/features/ai/server/agents/layout-agent";
import { validationAgent } from "@/features/ai/server/agents/validation-agent";
import { criticAgent } from "@/features/ai/server/agents/critic-agent";
import { repairAgent } from "@/features/ai/server/agents/repair-agent";
import { expansionAgent } from "@/features/ai/server/agents/expansion-agent";
import { intermediateCompileAgent } from "@/features/ai/server/agents/intermediate-compile-agent";
import { canvasCompilerAgent } from "@/features/ai/server/agents/canvas-compiler-agent";

export interface AIWorkflowOptions {
  request: AIGenerateDiagramRequest;
  model?: StructuredChatModel;
}

const eventReducer = (
  left: AIStreamEvent[],
  right: AIStreamEvent | AIStreamEvent[],
) => left.concat(Array.isArray(right) ? right : [right]);

const arrayReducer = <T>(left: T[], right: T | T[]) =>
  left.concat(Array.isArray(right) ? right : [right]);

const StateAnnotation = Annotation.Root({
  request: Annotation<AIWorkflowState["request"]>(),
  frame: Annotation<AIWorkflowState["frame"]>(),
  events: Annotation<AIWorkflowState["events"]>({
    reducer: eventReducer,
    default: () => [],
  }),
  checkpoints: Annotation<AIWorkflowState["checkpoints"]>({
    reducer: arrayReducer,
    default: () => [],
  }),
  plan: Annotation<AIWorkflowState["plan"]>(),
  graph: Annotation<AIWorkflowState["graph"]>(),
  document: Annotation<AIWorkflowState["document"]>(),
  elements: Annotation<AIWorkflowState["elements"]>(),
  improvementPasses: Annotation<number>(),
  expansionRound: Annotation<number>(),
  isComplete: Annotation<boolean>(),
  missingComponents: Annotation<AIWorkflowState["missingComponents"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  requirements: Annotation<AIWorkflowState["requirements"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  actors: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  systems: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  infrastructure: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  nonFunctionalRequirements: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  trustBoundaries: Annotation<AIWorkflowState["trustBoundaries"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  communicationPaths: Annotation<AIWorkflowState["communicationPaths"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  risks: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  memoryContext: Annotation<AIWorkflowState["memoryContext"]>(),
  toolResults: Annotation<AIWorkflowState["toolResults"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  criticNotes: Annotation<AIWorkflowState["criticNotes"]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});

type GraphState = typeof StateAnnotation.State;

const createFrameId = () => `ai_frame_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
const createGenerationId = () => `ai_gen_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

export const createInitialAIFrame = (
  request: AIGenerateDiagramRequest,
): AIFrame => {
  const provider = request.provider ?? request.model ?? "gemini";
  return {
    frameId: createFrameId(),
    whiteboardId: request.whiteboardId,
    prompt: request.prompt,
    provider,
    status: "queued",
    currentPhase: null,
    events: [],
    checkpoints: [],
    finalElementIds: [],
  };
};

const withRuntime =
  (
    runtime: AgentRuntime,
    agent: (state: AIWorkflowState, runtime: AgentRuntime) => Promise<AIWorkflowUpdate>,
  ) =>
  (state: GraphState) =>
    agent(state as AIWorkflowState, runtime);

const withoutRuntime =
  (agent: (state: AIWorkflowState) => Promise<AIWorkflowUpdate>) =>
  (state: GraphState) =>
    agent(state as AIWorkflowState);

const shouldExpand = (state: GraphState): "expand" | "finalize" => {
  const s = state as AIWorkflowState;
  const canExpand =
    !s.isComplete &&
    s.missingComponents &&
    s.missingComponents.length > 0 &&
    (s.expansionRound ?? 0) < 1;
  return canExpand ? "expand" : "finalize";
};

export const createAIDiagramWorkflow = (model: StructuredChatModel) => {
  const runtime: AgentRuntime = {
    model,
    createGenerationId,
  };

  return new StateGraph(StateAnnotation)
    .addNode("contextRetriever", withoutRuntime(contextRetrieverAgent))
    .addNode("architecturePlanner", withRuntime(runtime, architecturePlannerAgent), {
      retryPolicy: { maxAttempts: 2 },
    })
    .addNode("domainModeler", withRuntime(runtime, domainModelerAgent), {
      retryPolicy: { maxAttempts: 2 },
    })
    .addNode("infrastructureExpander", withoutRuntime(infrastructureExpanderAgent))
    .addNode("relationshipAgent", withRuntime(runtime, relationshipAgent), {
      retryPolicy: { maxAttempts: 2 },
    })
    .addNode("diagramComposer", withoutRuntime(diagramComposerAgent))
    .addNode("layoutAgent", withoutRuntime(layoutAgent))
    .addNode("validationAgent", withRuntime(runtime, validationAgent))
    .addNode("criticAgent", withRuntime(runtime, criticAgent))
    .addNode("intermediateCompile", withoutRuntime(intermediateCompileAgent))
    .addNode("expansionAgent", withRuntime(runtime, expansionAgent), {
      retryPolicy: { maxAttempts: 2 },
    })
    .addNode("repairAgent", withRuntime(runtime, repairAgent), {
      retryPolicy: { maxAttempts: 2 },
    })
    .addNode("canvasCompiler", withoutRuntime(canvasCompilerAgent))
    .addEdge(START, "contextRetriever")
    .addEdge("contextRetriever", "architecturePlanner")
    .addEdge("architecturePlanner", "domainModeler")
    .addEdge("domainModeler", "infrastructureExpander")
    .addEdge("infrastructureExpander", "relationshipAgent")
    .addEdge("relationshipAgent", "diagramComposer")
    .addEdge("diagramComposer", "layoutAgent")
    .addEdge("layoutAgent", "validationAgent")
    .addEdge("validationAgent", "intermediateCompile")
    .addEdge("intermediateCompile", "criticAgent")
    .addConditionalEdges("criticAgent", shouldExpand, {
      expand: "expansionAgent",
      finalize: "repairAgent",
    })
    .addEdge("expansionAgent", "relationshipAgent")
    .addEdge("repairAgent", "canvasCompiler")
    .addEdge("canvasCompiler", END)
    .compile({
      checkpointer: new MemorySaver(),
    });
};

export const createAIWorkflowInput = (request: AIGenerateDiagramRequest) => {
  const frame = createInitialAIFrame(request);
  return {
    input: {
      request,
      frame,
      events: [],
      checkpoints: [],
      improvementPasses: 0,
      expansionRound: 0,
      isComplete: false,
      missingComponents: [],
      requirements: [],
      actors: [],
      systems: [],
      infrastructure: [],
      nonFunctionalRequirements: [],
      trustBoundaries: [],
      communicationPaths: [],
      risks: [],
      toolResults: [],
      criticNotes: [],
    },
    config: {
      configurable: {
        thread_id: frame.frameId,
      },
    } satisfies RunnableConfig,
  };
};

const extractEventsFromUpdate = (chunk: unknown): AIStreamEvent[] => {
  const events: AIStreamEvent[] = [];
  if (!chunk || typeof chunk !== "object") return events;

  Object.values(chunk as Record<string, unknown>).forEach((value) => {
    if (!value || typeof value !== "object") return;
    const maybeEvents = (value as { events?: unknown }).events;
    if (Array.isArray(maybeEvents)) {
      events.push(...(maybeEvents as AIStreamEvent[]));
    }
  });

  return events;
};

export async function* streamAIDiagramWorkflowEvents({
  request,
  model = createAIChatModel(request.provider ?? request.model),
}: AIWorkflowOptions): AsyncGenerator<AIStreamEvent> {
  const app = createAIDiagramWorkflow(model);
  const { input, config } = createAIWorkflowInput(request);
  const stream = await app.stream(input, {
    ...config,
    streamMode: "updates",
  });

  for await (const chunk of stream) {
    for (const event of extractEventsFromUpdate(chunk)) {
      yield event;
    }
  }
}

export const runAIDiagramWorkflow = async ({
  request,
  model = createAIChatModel(request.provider ?? request.model),
}: AIWorkflowOptions): Promise<GraphState> => {
  const app = createAIDiagramWorkflow(model);
  const { input, config } = createAIWorkflowInput(request);
  return app.invoke(input, config);
};
