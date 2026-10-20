"use client";

import * as React from "react";
import { AlignLeft, Check, ChevronRight, Copy, Download, Play, RefreshCw } from "lucide-react";
import { canvasDrift, loadFromCanvas, planApply, type Conflict, type SyncState } from "@/features/diagram-code/apply";
import { listIcons } from "@/core/icons/registry";
import { compileDiagramCode } from "@/features/diagram-code/language/compile";
import { formatDiagramCode } from "@/features/diagram-code/language/format";
import { mapCaret } from "@/features/diagram-code/language/tooling/caret";
import type { Hover } from "@/features/diagram-code/language/tooling/hover";
import { iconCandidates } from "@/features/diagram-code/language/vocab";
import type { ApplyDiagramCodePayload } from "@/features/diagram-code/types";
import { DiagramCodeField, type DiagramCodeFieldHandle } from "@/features/whiteboard/components/overlays/diagram-code-field";
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
  ['Name [label: "Line 1\\nLine 2"]', "a label over several lines (\\n, \\\" and \\\\ inside quotes)"],
  ["// comment", "ignored"],
];

const newGenerationId = () => `code_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Icon ids and aliases offered by completion: what is loaded plus the on-demand library's names. */
let iconIdCache: string[] | null = null;
const iconIds = (): string[] => (iconIdCache ??= iconCandidates(listIcons().map((icon) => icon.id)));

const LIVE_DELAY_MS = 700;

export const DiagramCodeEditor: React.FC<DiagramCodeEditorProps> = ({ elements, selectedElementIds, onApply, disabled = false, loadToken = 0 }) => {
  const [code, setCode] = React.useState("");
  // What the code was last synchronised with: which elements it owns and what it produced. "Update"
  // changes exactly these, keeping their ids; see features/diagram-code/apply.ts.
  const [sync, setSync] = React.useState<SyncState | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [conflicts, setConflicts] = React.useState<Conflict[] | null>(null);
  const [confirmReload, setConfirmReload] = React.useState(false);
  const [includeLayout, setIncludeLayout] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const [caretInfo, setCaretInfo] = React.useState<Hover | null>(null);
  const fieldRef = React.useRef<DiagramCodeFieldHandle>(null);

  const compiled = React.useMemo(() => compileDiagramCode(code), [code]);
  const issues = compiled.diagnostics;
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  const canRun = !disabled && code.trim() !== "" && errors === 0;

  // Read when asked, not on every change of the board: the code is the person's to edit.
  const latest = React.useRef({ elements, selectedElementIds, includeLayout });
  latest.current = { elements, selectedElementIds, includeLayout };

  const drift = React.useMemo(() => (sync ? canvasDrift(elements, sync) : null), [elements, sync]);
  const drifted = drift ? drift.edited.length + drift.missing.length : 0;

  const loadFromBoard = React.useCallback(() => {
    const { elements: all, selectedElementIds: selected, includeLayout: layout } = latest.current;
    const loaded = loadFromCanvas(all, { selectedIds: selected, layout, generationId: newGenerationId() });
    if (!loaded) {
      setNotice("No shapes to convert. Draw some labelled shapes, or select a diagram.");
      return;
    }
    setCode(loaded.code);
    setSync(loaded.sync);
    setConflicts(null);
    setConfirmReload(false);
    setNotice(
      `Loaded ${loaded.nodeCount} node${loaded.nodeCount === 1 ? "" : "s"} and ${loaded.edgeCount} connection${loaded.edgeCount === 1 ? "" : "s"}` +
        (selected.length > 0 ? " from your selection" : " from the canvas") +
        (layout ? ", with position, size and sides." : "."),
    );
  }, []);

  const lastToken = React.useRef(loadToken);
  React.useEffect(() => {
    if (loadToken === lastToken.current) return;
    lastToken.current = loadToken;
    loadFromBoard();
  }, [loadToken, loadFromBoard]);

  /** Plan the change against the board as it is now; nothing is written unless the code is valid and unambiguous. */
  const run = (mode: "add" | "update", resolve?: "code" | "canvas") => {
    const outcome = planApply({
      code,
      canvas: elements,
      sync: mode === "update" ? sync : null,
      resolve,
      generationId: newGenerationId(),
    });
    if (outcome.status === "invalid") {
      setConflicts(null);
      setNotice(`Nothing was drawn, the canvas is unchanged: ${outcome.diagnostics[0]?.message ?? "fix the errors first."}`);
      return;
    }
    if (outcome.status === "conflict") {
      setConflicts(outcome.conflicts);
      setNotice("The canvas and the code both changed the same thing. Choose which to keep; nothing was changed yet.");
      return;
    }
    const { plan } = outcome;
    setConflicts(null);
    setConfirmReload(false);
    if (mode === "update" && sync) {
      onApply({ elements: [], replaceIds: [], anchored: true, patch: plan.patch });
    } else {
      // A new diagram: placed at the viewport, unless every node was positioned in code.
      onApply({ elements: plan.patch.add, replaceIds: [], anchored: plan.anchored });
    }
    setSync(plan.sync);
    const { added, updated, removed, restored } = plan.summary;
    setNotice(
      mode === "add" || !sync
        ? "Added to the canvas."
        : added + updated + removed + restored === 0
          ? "Already up to date."
          : `Updated: ${[added && `${added} added`, updated && `${updated} changed`, removed && `${removed} removed`, restored && `${restored} restored`].filter(Boolean).join(", ")}.`,
    );
  };

  const primary = sync ? "update" : "add";

  const format = () => {
    const result = formatDiagramCode(code);
    if (result.refused) {
      setNotice(result.refused.reason);
      const first = result.refused.diagnostics[0];
      if (first) fieldRef.current?.select(first.span.start, first.span.end);
      return;
    }
    if (!result.changed) {
      setNotice("Already formatted.");
      return;
    }
    const caret = mapCaret(code, fieldRef.current?.selectionStart() ?? 0, result.text);
    setCode(result.text);
    setNotice("Formatted.");
    fieldRef.current?.select(caret, caret);
  };

  // Live preview: once a diagram is on the canvas, valid code updates it a moment after typing stops.
  // Invalid code never reaches the canvas, so it keeps the last valid picture; a conflict pauses live
  // updates until the person has chosen a side.
  const runRef = React.useRef(run);
  runRef.current = run;
  React.useEffect(() => {
    if (!live || !sync || disabled || !canRun || conflicts || code === sync.code) return;
    const timer = setTimeout(() => runRef.current("update"), LIVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [live, sync, disabled, canRun, conflicts, code]);
  React.useEffect(() => {
    if (conflicts) setLive(false);
  }, [conflicts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={loadFromBoard}
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
        <button
          type="button"
          onClick={format}
          disabled={disabled || code.trim() === ""}
          title="Format the code (Shift+Alt+F)"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <AlignLeft size={13} />
          Format
        </button>
        <label className={`inline-flex items-center gap-1.5 text-[12px] ${sync ? "cursor-pointer text-muted-foreground" : "cursor-not-allowed text-muted-foreground/50"}`} title={sync ? "Update the canvas a moment after you stop typing" : "Add the diagram to the canvas first"}>
          <input type="checkbox" checked={live} disabled={!sync} onChange={(e) => setLive(e.target.checked)} className="h-3.5 w-3.5 accent-foreground" />
          Live
        </label>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setCode(EXAMPLE);
            setSync(null);
            setConflicts(null);
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

      <DiagramCodeField
        ref={fieldRef}
        value={code}
        onChange={(value) => {
          setCode(value);
          setNotice(null);
          setConflicts(null);
        }}
        onSubmit={() => canRun && run(primary)}
        onFormat={format}
        compiled={compiled}
        iconIds={iconIds()}
        onCaretInfo={setCaretInfo}
        disabled={disabled}
        describedBy="diagram-code-status diagram-code-hint"
      />

      <div id="diagram-code-status" className="flex items-center justify-between font-mono text-[11px]" aria-live="polite">
        <span className={errors > 0 ? "text-destructive" : warnings > 0 ? "text-warning" : "text-muted-foreground"}>
          {code.trim() === "" ? "Empty" : errors > 0 ? `${errors} error${errors === 1 ? "" : "s"}` : warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "Valid"}
        </span>
        {notice && <span className="truncate pl-3 text-muted-foreground">{notice}</span>}
      </div>

      <p id="diagram-code-hint" className="min-h-[1.25rem] shrink-0 text-[11.5px] leading-snug text-muted-foreground">
        {caretInfo && (caretInfo.lines.length > 0 || caretInfo.diagnostics.length > 0) ? (
          <>
            <span className="font-mono text-foreground">{caretInfo.title}</span> {caretInfo.diagnostics[0]?.message ?? caretInfo.lines[0]}
          </>
        ) : (
          "Ctrl+Space suggests, Shift+Alt+F formats, Tab indents, Esc leaves the field."
        )}
      </p>

      {conflicts && (
        <div role="alert" className="shrink-0 space-y-2 rounded-md border border-warning/50 bg-warning/10 p-2 text-[12px]">
          <p className="font-medium text-foreground">Changed in both places</p>
          <ul className="max-h-24 space-y-1 overflow-y-auto">
            {conflicts.slice(0, 6).map((c) => (
              <li key={`${c.elementId}-${c.field}`} className="leading-snug text-foreground/85">
                <span className="font-mono text-[11px]">{c.key.replace(/^[a-z-]+:/, "")}.{c.field}</span>: canvas has <q>{String(c.canvas ?? "none")}</q>, code says <q>{String(c.code ?? "none")}</q>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => run("update", "code")} className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 font-medium transition-colors hover:bg-muted">
              Use the code
            </button>
            <button type="button" onClick={() => run("update", "canvas")} className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 font-medium transition-colors hover:bg-muted">
              Keep the canvas
            </button>
          </div>
        </div>
      )}

      {drifted > 0 && !conflicts && (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[12px]" aria-live="polite">
          <span className="text-foreground/85">
            The canvas has {drifted} change{drifted === 1 ? "" : "s"} the code does not show.
          </span>
          {confirmReload || code === sync?.code ? (
            <button type="button" onClick={loadFromBoard} className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline">
              {code === sync?.code ? "Reload from canvas" : "Replace my code edits"}
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmReload(true)} className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline">
              Reload from canvas
            </button>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <ul className="max-h-28 shrink-0 space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-1 text-[12px]">
          {issues.slice(0, 20).map((issue, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => fieldRef.current?.select(issue.span.start, issue.span.end)}
                className="flex w-full gap-2 rounded-sm px-1 py-0.5 text-left leading-snug transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`shrink-0 font-mono text-[11px] ${issue.severity === "error" ? "text-destructive" : "text-warning"}`}>
                  {issue.line}:{issue.column}
                </span>
                <span className="text-foreground/85">
                  {issue.message}
                  {issue.suggestion && !issue.message.includes(issue.suggestion) ? ` (${issue.suggestion}?)` : ""}
                </span>
              </button>
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
