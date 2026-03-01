import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

/* ============================================================
   SYSTEM PROMPT
============================================================ */

const SYSTEM_PROMPT = `
You are an expert system architect and diagram designer.
You generate a logical Nodes and Edges JSON structure.

Output ONLY valid JSON:
{
  "nodes": [...],
  "edges": [...]
}

Rules:
- No markdown.
- No explanations.
- Unique node ids.
- Labels 1-3 words only.
- Use "rectangle" for ALL services and infrastructure.
- Use "circle" ONLY for Start, End, or Database.
- Do NOT create a text element type.

Node format:
{
  "id": "string",
  "type": "rectangle" | "circle",
  "label": "1-3 words",
  "layer": number,
  "column": number
}

Edge format:
{
  "from": "node_id",
  "to": "node_id"
}
`;

/* ============================================================
   TYPES
============================================================ */

interface NodeJson {
  id: string;
  type: "rectangle" | "circle";
  label: string;
  layer: number;
  column: number;
}

interface EdgeJson {
  from: string;
  to: string;
}

interface DiagramJson {
  nodes: NodeJson[];
  edges: EdgeJson[];
}

type CanvasElement = {
  id: string;
  type: "rectangle" | "circle" | "arrow";
  label?: string;
  points: { x: number; y: number }[];
  fill?: string;
  color: string;
  strokeWidth: number;
  startConnection?: { elementId: string; handle: string };
  endConnection?: { elementId: string; handle: string };
};

/* ============================================================
   ID GENERATOR
============================================================ */

function generateShortId(index: number): string {
  return `ai_${Date.now()}_${index}`;
}

/* ============================================================
   API ROUTE
============================================================ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Generate a diagram for: ${prompt}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    const cleaned = raw
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("Invalid JSON from AI");
    }

    const parsed = JSON.parse(
      cleaned.slice(jsonStart, jsonEnd + 1),
    ) as DiagramJson;

    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error("Invalid nodes/edges format");
    }

    /* ============================================================
       LAYOUT CONSTANTS
    ============================================================ */

    const NODE_WIDTH = 160;
    const NODE_HEIGHT = 60;
    const LAYER_GAP_Y = 120;
    const COL_GAP_X = 120;
    const START_Y = 80;
    const CANVAS_WIDTH = 1000;

    const elements: CanvasElement[] = [];
    const nodeMap = new Map<string, CanvasElement>();

    /* ============================================================
       GROUP NODES BY LAYER
    ============================================================ */

    const layers = new Map<number, NodeJson[]>();

    parsed.nodes.forEach((node) => {
      if (!layers.has(node.layer)) {
        layers.set(node.layer, []);
      }
      layers.get(node.layer)!.push(node);
    });

    const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);

    /* ============================================================
       CREATE NODES (CENTERED PER LAYER)
    ============================================================ */

    sortedLayers.forEach((layer) => {
      const nodesInLayer = layers.get(layer)!;

      const count = nodesInLayer.length;

      const totalWidth = count * NODE_WIDTH + (count - 1) * COL_GAP_X;

      const startX = (CANVAS_WIDTH - totalWidth) / 2;

      const y = START_Y + layer * (NODE_HEIGHT + LAYER_GAP_Y);

      nodesInLayer.forEach((node, index) => {
        const id = generateShortId(elements.length);

        const x = startX + index * (NODE_WIDTH + COL_GAP_X);

        const isCircle = node.type === "circle";

        const width = isCircle ? NODE_HEIGHT : NODE_WIDTH;

        const element: CanvasElement = {
          id,
          type: node.type,
          label: node.label,
          points: [
            { x, y },
            { x: x + width, y: y + NODE_HEIGHT },
          ],
          fill: isCircle ? "#fef3c7" : "#dbeafe",
          color: "#1e293b",
          strokeWidth: 2,
        };

        nodeMap.set(node.id, element);
        elements.push(element);
      });
    });

    /* ============================================================
       CREATE EDGES (CLEAN VERTICAL TREE STYLE)
    ============================================================ */

    parsed.edges.forEach((edge, index) => {
      const source = nodeMap.get(edge.from);
      const target = nodeMap.get(edge.to);
      if (!source || !target) return;

      const id = generateShortId(elements.length + index);

      const sTop = source.points[0];
      const sBottom = source.points[1];
      const tTop = target.points[0];
      const tBottom = target.points[1];

      const sMidX = (sTop.x + sBottom.x) / 2;
      const tMidX = (tTop.x + tBottom.x) / 2;

      const startPoint = { x: sMidX, y: sBottom.y };
      const endPoint = { x: tMidX, y: tTop.y };

      const arrow: CanvasElement = {
        id,
        type: "arrow",
        points: [startPoint, endPoint],
        color: "#64748b",
        strokeWidth: 2,
        startConnection: {
          elementId: source.id,
          handle: "bottom",
        },
        endConnection: {
          elementId: target.id,
          handle: "top",
        },
      };

      elements.push(arrow);
    });

    return NextResponse.json({ elements });
  } catch (error) {
    console.error("generate-diagram error:", error);
    return NextResponse.json(
      { error: "Failed to generate diagram." },
      { status: 500 },
    );
  }
}
