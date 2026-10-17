"use client";

import * as React from "react";
import { Check, ChevronRight, Copy, Download, Play, RefreshCw } from "lucide-react";
import { elementsFromDiagramCode, graphFromElements } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { findMovedNodes } from "@/features/diagram-code/pins";
import type { ApplyDiagramCodePayload, DiagramCodeIssue } from "@/features/diagram-code/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

interface DiagramCodeEditorProps {
  elements: DrawingElement[];
  selectedElementIds: string[];
  onApply: (payload: ApplyDiagramCodePayload) => void;
  disabled?: boolean;
  /** Changes each time something asks for the canvas to be loaded into the editor. */
  loadToken?: number;
}

const EXAMPLE = `type architecture
title Shop

Backend {
  API [kind: api]
  Orders [kind: service]
  Orders DB [kind: database, shape: icon]
}
Web App [icon: browser, shape: icon]

Web App > API: HTTPS
API > Orders
Orders > Orders DB: SQL [from: bottom, to: top]
`;

const REFERENCE: Array<[string, string]> = [
  ["Name", "a node"],
  ["Name [kind: database, icon: postgres]", "what it is, and its icon"],
  ["Name [shape: diamond | pill | icon]", "a decision, a terminator, or a bare icon"],
  ["Name [x: 120, y: 80, w: 200, h: 90]", "exact position (top-left) and size"],
  ["Name [color: blue, dashed: true]", "colour and outline"],
  ["Group { … }", "a group (nests)"],
  ["A > B   A < B   A <> B", "arrow, reversed, both ways"],
  ["A --> B   A - B   A -- B", "dashed, plain line, dashed line"],
  ["A > B: label", "a label on the line"],
  ["A > B: [from: right, to: left]", "which side it leaves and enters"],
  ["A > B: label [color: red, from: top]", "label, colour and sides together"],
  ["type architecture · title … ", "header lines, first in the file"],
  ["// comment", "ignored"],
];

const newGenerationId = () => `code_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const LINE_HEIGHT = 20;

/** Line numbers beside a textarea, kept in step with its scroll; lines with a problem are marked. */
const CodeArea: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  issues: DiagramCodeIssue[];
  disabled?: boolean;
}> = ({ value, onChange, onSubmit, issues, disabled }) => {
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lines = Math.max(1, value.split("\n").length);
  const worst = React.useMemo(() => {
    const byLine = new Map<number, DiagramCodeIssue["severity"]>();
    for (const issue of issues) {
      if (byLine.get(issue.line) !== "error") byLine.set(issue.line, issue.severity);
    }
    return byLine;
  }, [issues]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-background focus-within:border-foreground/40">
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r border-border bg-muted/40 py-2 pl-2 pr-2 text-right font-mono text-[11px] text-muted-foreground"
        style={{ lineHeight: `${LINE_HEIGHT}px`, minWidth: `${String(lines).length * 8 + 22}px` }}
      >
        {Array.from({ length: lines }, (_, i) => {
          const severity = worst.get(i + 1);
          return (
            <div key={i} className={severity === "error" ? "text-destructive" : severity === "warning" ? "text-amber-600 dark:text-amber-400" : undefined}>
              {i + 1}
            </div>
          );
        })}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape") {
            e.currentTarget.blur();
          } else if (e.key === "Tab" && !e.shiftKey) {
            // Indent like an editor; Escape leaves the field for keyboard users.
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: from, selectionEnd: to } = el;
            onChange(`${value.slice(0, from)}  ${value.slice(to)}`);
            requestAnimationFrame(() => el.setSelectionRange(from + 2, from + 2));
          }
        }}
        spellCheck={false}
        wrap="off"
        disabled={disabled}
        aria-label="Diagram code"
        placeholder={"Web App > API: HTTPS\nAPI > Database"}
        className="min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-2 font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        style={{ lineHeight: `${LINE_HEIGHT}px`, tabSize: 2 }}
      />
    </div>
  );
};

export const DiagramCodeEditor: React.FC<DiagramCodeEditorProps> = ({ elements, selectedElementIds, onApply, disabled = false, loadToken = 0 }) => {
  const [code, setCode] = React.useState("");
  // Elements the current code was loaded from; "Update" replaces exactly these.
  const [sourceIds, setSourceIds] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [includeLayout, setIncludeLayout] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [referenceOpen, setReferenceOpen] = React.useState(false);

  const issues = React.useMemo(() => parseDiagramCode(code).issues, [code]);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  const canRun = !disabled && code.trim() !== "" && errors === 0;

  // Read when asked, not on every change of the board: the code is the person's to edit.
  const latest = React.useRef({ elements, selectedElementIds, includeLayout });
  latest.current = { elements, selectedElementIds, includeLayout };

  const loadFromCanvas = React.useCallback(() => {
    const { elements: all, selectedElementIds: selected, includeLayout: layout } = latest.current;
    const scope = selected.length > 0 ? all.filter((el) => selected.includes(el.id)) : all;
    const { graph, consumedIds } = graphFromElements(scope, { layout });
    if (graph.nodes.length === 0) {
      setNotice("No shapes to convert. Draw some labelled shapes, or select a diagram.");
      return;
    }
    setCode(serializeDiagramCode(graph));
    setSourceIds(consumedIds);
    setNotice(
      `Loaded ${graph.nodes.length} node${graph.nodes.length === 1 ? "" : "s"} and ${graph.edges.length} connection${graph.edges.length === 1 ? "" : "s"}` +
        (selected.length > 0 ? " from your selection" : " from the canvas") +
        (layout ? ", with position, size and sides." : "."),
    );
  }, []);

  const lastToken = React.useRef(loadToken);
  React.useEffect(() => {
    if (loadToken === lastToken.current) return;
    lastToken.current = loadToken;
    loadFromCanvas();
  }, [loadToken, loadFromCanvas]);

  const run = (mode: "add" | "update") => {
    // Updating keeps nodes where the user dragged them. Read at apply time, from the elements as
    // they are now, so moves made after the code was loaded count.
    const pins = mode === "update" && sourceIds.length > 0 ? findMovedNodes(elements.filter((el) => sourceIds.includes(el.id))) : undefined;
    const result = elementsFromDiagramCode(code, { generationId: newGenerationId(), frameId: "diagram-code", pins });
    if (result.elements.length === 0) {
      setNotice("Nothing was drawn. Fix the errors first.");
      return;
    }
    // Every node placed by x and y is already where it belongs: do not slide the diagram to the viewport.
    const allPlaced = parseDiagramCode(code).nodes.every((n) => n.x !== undefined && n.y !== undefined);
    onApply({
      elements: result.elements,
      replaceIds: mode === "update" ? sourceIds : [],
      anchored: allPlaced || Boolean(pins && pins.size > 0),
    });
    // Later updates replace what was just drawn.
    setSourceIds(result.elements.map((el) => el.id));
    setNotice(mode === "update" ? "Diagram updated." : "Added to the canvas.");
  };

  const primary = sourceIds.length > 0 ? "update" : "add";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={loadFromCanvas}
          disabled={disabled}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Download size={13} />
          {selectedElementIds.length > 0 ? "Load selection" : "Load canvas"}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
          <input type="checkbox" checked={includeLayout} onChange={(e) => setIncludeLayout(e.target.checked)} className="h-3.5 w-3.5 accent-foreground" />
          Position, size and sides
        </label>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setCode(EXAMPLE);
            setSourceIds([]);
            setNotice(null);
          }}
          disabled={disabled}
          className="text-[12px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
        >
          Example
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          disabled={code === ""}
          aria-label="Copy the code"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      <CodeArea
        value={code}
        onChange={(value) => {
          setCode(value);
          setNotice(null);
        }}
        onSubmit={() => canRun && run(primary)}
        issues={issues}
        disabled={disabled}
      />

      <div className="flex items-center justify-between font-mono text-[11px]" aria-live="polite">
        <span className={errors > 0 ? "text-destructive" : warnings > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
          {code.trim() === "" ? "Empty" : errors > 0 ? `${errors} error${errors === 1 ? "" : "s"}` : warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "Valid"}
        </span>
        {notice && <span className="truncate pl-3 text-muted-foreground">{notice}</span>}
      </div>

      {issues.length > 0 && (
        <ul className="max-h-28 shrink-0 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-[12px]">
          {issues.slice(0, 20).map((issue, i) => (
            <li key={i} className="flex gap-2 leading-snug">
              <span className={`shrink-0 font-mono text-[11px] ${issue.severity === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>L{issue.line}</span>
              <span className="text-foreground/85">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run(primary)}
          disabled={!canRun}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {primary === "update" ? <RefreshCw size={13} /> : <Play size={13} />}
          {primary === "update" ? "Update diagram" : "Add to canvas"}
          <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 font-mono text-[10px] font-normal opacity-70">⌘↵</kbd>
        </button>
        {primary === "update" && (
          <button
            type="button"
            onClick={() => run("add")}
            disabled={!canRun}
            title="Draw it again as a new diagram and keep the current one"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add as new
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setReferenceOpen((v) => !v)}
          aria-expanded={referenceOpen}
          className="flex w-full items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight size={13} className={`transition-transform ${referenceOpen ? "rotate-90" : ""}`} />
          Syntax reference
        </button>
        {referenceOpen && (
          <dl className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {REFERENCE.map(([syntax, meaning]) => (
              <div key={syntax} className="grid grid-cols-[1fr_auto] items-baseline gap-3">
                <dt className="min-w-0 break-words font-mono text-[11.5px] text-foreground">{syntax}</dt>
                <dd className="text-right text-[11.5px] text-muted-foreground">{meaning}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
};
