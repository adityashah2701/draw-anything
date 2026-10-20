"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { arrowPoints, scenes, VIEW, type SceneNode } from "./hero-scenes";
import { useInView, usePrefersReducedMotion } from "./reveal";

const START_DELAY_MS = 250;
const STEP_MS = 150;
const SETTLE_MS = 450;

function NodeShape({ node }: { node: SceneNode }) {
  const { cx, cy, w, h } = node;
  const x = cx - w / 2;
  const y = cy - h / 2;
  if (node.kind === "diamond") {
    return <polygon className="demo-shape" points={`${cx},${y} ${cx + w / 2},${cy} ${cx},${y + h} ${x},${cy}`} />;
  }
  return <rect className="demo-shape" x={x} y={y} width={w} height={h} rx={node.kind === "pill" ? h / 2 : 6} />;
}

/** Four handles, the same ink selection the editor draws: corners of the box, or the points of a diamond. */
function Handles({ node }: { node: SceneNode }) {
  const { cx, cy, w, h } = node;
  const corners =
    node.kind === "diamond"
      ? [
          [cx, cy - h / 2],
          [cx + w / 2, cy],
          [cx, cy + h / 2],
          [cx - w / 2, cy],
        ]
      : [
          [cx - w / 2, cy - h / 2],
          [cx + w / 2, cy - h / 2],
          [cx - w / 2, cy + h / 2],
          [cx + w / 2, cy + h / 2],
        ];
  return (
    <>
      {corners.map(([x, y]) => (
        <rect key={`${x}-${y}`} className="demo-handle" x={x - 3.5} y={y - 3.5} width={7} height={7} rx={1} />
      ))}
    </>
  );
}

export function HeroDemo() {
  const [sceneId, setSceneId] = useState(scenes[0].id);
  const [run, setRun] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Progress is stored with the run it belongs to, so switching scene never flashes the old count.
  const [progress, setProgress] = useState({ key: "", steps: 0, settled: false });
  const reduceMotion = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, rootMargin: "0px" });

  const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0];
  const total = scene.order.length;
  const runKey = `${scene.id}:${run}`;
  const current = progress.key === runKey ? progress : { key: runKey, steps: 0, settled: false };
  const steps = reduceMotion ? total : current.steps;
  const settled = reduceMotion || current.settled;
  const drawing = steps < total || !settled;

  // Build the diagram one step at a time. Any change to the scene or a replay clears the timers
  // and starts over from the first step, so a click is never queued behind a running build.
  useEffect(() => {
    if (!inView || reduceMotion) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      step += 1;
      setProgress({ key: runKey, steps: step, settled: false });
      timer = setTimeout(step < total ? tick : () => setProgress({ key: runKey, steps: total, settled: true }), step < total ? STEP_MS : SETTLE_MS);
    };
    timer = setTimeout(tick, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [inView, reduceMotion, runKey, total]);

  const stepOf = useMemo(() => new Map(scene.order.map((id, index) => [id, index])), [scene]);
  const isShown = (id: string) => (stepOf.get(id) ?? Infinity) < steps;
  const isLatest = (id: string) => drawing && stepOf.get(id) === steps - 1;

  const selected = scene.nodes.find((n) => n.id === selectedId) ?? null;
  const shapeCount = scene.nodes.length;
  const connectorCount = scene.edges.length;

  const chooseScene = (id: string) => {
    if (id === sceneId) return;
    setSceneId(id);
    setSelectedId(null);
  };
  const replay = () => {
    setSelectedId(null);
    setRun((r) => r + 1);
  };

  return (
    <div ref={ref} className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="label-mono">Board / {scene.title}</span>
        <span className="label-mono flex min-w-[11.5rem] items-center justify-end gap-2" aria-live="polite">
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-[1px] transition-colors duration-200", drawing ? "bg-agent" : "bg-success")}
          />
          {drawing ? (
            <span>Agent drawing {Math.min(steps, total)}/{total}</span>
          ) : (
            <span>
              {shapeCount} shapes · {connectorCount} connectors
            </span>
          )}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="label-mono mb-1.5">Prompt</p>
          <p className="text-[13px] leading-snug text-foreground">{scene.prompt}</p>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={replay} aria-label="Replay the drawing">
          <RotateCcw />
        </Button>
      </div>

      <div className="bg-sheet">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          role="group"
          aria-label={`Diagram: ${scene.title}`}
          className="block h-auto w-full select-none"
          onPointerDown={(event) => event.target === event.currentTarget && setSelectedId(null)}
        >
          {scene.edges.map((edge) => (
            <g key={`${scene.id}-${edge.id}`} aria-hidden="true">
              <path className="demo-edge" d={edge.d} pathLength={1} data-shown={isShown(edge.id)} data-latest={isLatest(edge.id)} />
              <polygon className="demo-head" points={arrowPoints(edge.head)} data-shown={isShown(edge.id)} data-latest={isLatest(edge.id)} />
              {edge.label && (
                <text
                  className="demo-label label-mono"
                  x={edge.label.x}
                  y={edge.label.y}
                  textAnchor={edge.label.anchor ?? "middle"}
                  fontSize={12}
                  data-shown={isShown(edge.id)}
                  style={{ fill: "var(--muted-foreground)" }}
                >
                  {edge.label.text}
                </text>
              )}
            </g>
          ))}
          {scene.nodes.map((node) => (
            <g
              key={`${scene.id}-${node.id}`}
              className={cn("demo-node", isShown(node.id) && "cursor-pointer")}
              data-shown={isShown(node.id)}
              data-latest={isLatest(node.id)}
              data-selected={selectedId === node.id}
              role="button"
              tabIndex={isShown(node.id) ? 0 : -1}
              aria-hidden={!isShown(node.id)}
              aria-pressed={selectedId === node.id}
              aria-label={node.label}
              onClick={() => setSelectedId(selectedId === node.id ? null : node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(selectedId === node.id ? null : node.id);
                } else if (event.key === "Escape") {
                  setSelectedId(null);
                }
              }}
              style={{ pointerEvents: isShown(node.id) ? "auto" : "none" }}
            >
              <NodeShape node={node} />
              <text
                x={node.cx}
                y={node.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={15}
                fontWeight={500}
                style={{ fill: "var(--foreground)", pointerEvents: "none" }}
              >
                {node.label}
              </text>
              <Handles node={node} />
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-1" role="group" aria-label="Example prompts">
          {scenes.map((s) => (
            <Button
              key={s.id}
              variant={s.id === sceneId ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={s.id === sceneId}
              onClick={() => chooseScene(s.id)}
            >
              {s.title}
            </Button>
          ))}
        </div>
        <p className="label-mono min-h-3 text-right" aria-live="polite">
          {selected ? `Selected · ${selected.label} · ${selected.w} × ${selected.h}` : drawing ? " " : "Click a shape to select it"}
        </p>
      </div>
    </div>
  );
}
