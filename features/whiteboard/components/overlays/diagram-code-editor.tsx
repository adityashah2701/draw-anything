"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, Code2, Download, Play, RefreshCw } from "lucide-react";
import {
  elementsFromDiagramCode,
  graphFromElements,
} from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import type { ApplyDiagramCodePayload } from "@/features/diagram-code/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

interface DiagramCodeEditorProps {
  elements: DrawingElement[];
  selectedElementIds: string[];
  onApply: (payload: ApplyDiagramCodePayload) => void;
  disabled?: boolean;
}

const EXAMPLE = `type architecture

Backend {
  API [kind: api]
  Orders [kind: service]
  Orders DB [kind: database]
}
Web App [kind: browser]

Web App > API: HTTPS
API > Orders
Orders > Orders DB: SQL
`;

const newGenerationId = () =>
  `code_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const DiagramCodeEditor: React.FC<DiagramCodeEditorProps> = ({
  elements,
  selectedElementIds,
  onApply,
  disabled = false,
}) => {
  const [code, setCode] = React.useState("");
  // Elements the current code was loaded from; "Update" replaces exactly these.
  const [sourceIds, setSourceIds] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  const issues = React.useMemo(() => parseDiagramCode(code).issues, [code]);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const canRun = !disabled && code.trim() !== "" && !hasErrors;

  const loadFromCanvas = () => {
    const scope =
      selectedElementIds.length > 0
        ? elements.filter((el) => selectedElementIds.includes(el.id))
        : elements;
    const { graph, consumedIds } = graphFromElements(scope);
    if (graph.nodes.length === 0) {
      setNotice("No shapes to convert. Draw some labelled shapes, or select a diagram.");
      return;
    }
    setCode(serializeDiagramCode(graph));
    setSourceIds(consumedIds);
    setNotice(
      `Loaded ${graph.nodes.length} node(s) and ${graph.edges.length} connection(s)` +
        (selectedElementIds.length > 0 ? " from your selection." : " from the canvas."),
    );
  };

  const run = (mode: "add" | "update") => {
    const result = elementsFromDiagramCode(code, {
      generationId: newGenerationId(),
      frameId: "diagram-code",
    });
    if (result.elements.length === 0) {
      setNotice("Nothing was drawn. Fix the errors above first.");
      return;
    }
    onApply({ elements: result.elements, replaceIds: mode === "update" ? sourceIds : [] });
    // Later updates replace what was just drawn.
    setSourceIds(result.elements.map((el) => el.id));
    setNotice(mode === "update" ? "Diagram updated." : "Added to the canvas.");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={loadFromCanvas}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Download size={12} />
          {selectedElementIds.length > 0 ? "From selection" : "From canvas"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCode(EXAMPLE);
            setSourceIds([]);
            setNotice(null);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Code2 size={12} />
          Example
        </button>
      </div>

      <textarea
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setNotice(null);
        }}
        spellCheck={false}
        disabled={disabled}
        aria-label="Diagram code"
        placeholder={"Web App > API: HTTPS\nAPI > Database"}
        className="min-h-[200px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
      />

      {issues.length > 0 && (
        <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-[11px]">
          {issues.slice(0, 20).map((issue, i) => (
            <li key={i} className="flex items-start gap-1.5">
              {issue.severity === "error" ? (
                <AlertCircle size={12} className="mt-0.5 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
              )}
              <span className="text-foreground/80">
                <span className="font-mono text-muted-foreground">Line {issue.line}:</span>{" "}
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="text-[11px] text-muted-foreground">{notice}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run("add")}
          disabled={!canRun}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={12} />
          Add to canvas
        </button>
        <button
          type="button"
          onClick={() => run("update")}
          disabled={!canRun || sourceIds.length === 0}
          title={
            sourceIds.length === 0
              ? "Load a diagram with “From canvas” first"
              : "Replace the diagram this code was loaded from"
          }
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-400"
        >
          <RefreshCw size={12} />
          Update diagram
        </button>
      </div>

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Syntax</summary>
        <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 font-mono leading-relaxed">{`type architecture        (optional header)
Name [kind: database]    a node
Group {  ...  }          a group (can nest)
A > B, C: label          connect (fan-out + label)
A <> B   A --> B   A < B both ways / dashed / reverse
// comment`}</pre>
      </details>
    </div>
  );
};
