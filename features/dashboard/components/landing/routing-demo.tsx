"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "./reveal";

const AUTO_ROUTE_DELAY_MS = 700;

const BOX = { fill: "var(--card)", stroke: "var(--foreground)", strokeWidth: 1.5 } as const;

/** One connector between two shapes with a third in the way: straight crosses it, routed goes around. */
export function RoutingDemo() {
  const [routed, setRouted] = useState(false);
  const touched = useRef(false);
  const reduceMotion = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.5, rootMargin: "0px" });

  // Show the problem first, then the fix, once. A click before that decides for itself.
  useEffect(() => {
    if (!inView || touched.current) return;
    if (reduceMotion) {
      setRouted(true);
      return;
    }
    const timer = setTimeout(() => {
      if (!touched.current) setRouted(true);
    }, AUTO_ROUTE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [inView, reduceMotion]);

  const choose = (next: boolean) => {
    touched.current = true;
    setRouted(next);
  };

  return (
    <div ref={ref} className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="label-mono">Connector</span>
        <div className="flex items-center gap-1" role="group" aria-label="Connector style">
          <Button size="sm" variant={routed ? "ghost" : "secondary"} aria-pressed={!routed} onClick={() => choose(false)}>
            Straight
          </Button>
          <Button size="sm" variant={routed ? "secondary" : "ghost"} aria-pressed={routed} onClick={() => choose(true)}>
            Routed
          </Button>
        </div>
      </div>
      <div className="bg-sheet">
        <svg viewBox="0 0 360 190" className="block h-auto w-full" role="img" aria-label={routed ? "A connector routed around a shape" : "A straight connector passing through a shape"}>
          <rect x={24} y={75} width={72} height={40} rx={6} {...BOX} />
          <rect x={264} y={75} width={72} height={40} rx={6} {...BOX} />
          <rect x={150} y={65} width={60} height={60} rx={6} {...BOX} />
          <g fontSize={11} fontWeight={500} textAnchor="middle" style={{ fill: "var(--foreground)" }}>
            <text x={60} y={99}>API</text>
            <text x={300} y={99}>Queue</text>
            <text x={180} y={99}>Auth</text>
          </g>
          <path className="route-straight" d="M96 95H258" data-on={!routed} />
          <polygon className="route-straight" points="264,95 256,90.5 256,99.5" data-on={!routed} style={{ fill: "var(--destructive)", strokeDasharray: "none", stroke: "none" }} />
          <path className="route-path" d="M96 95H123V38H237V95H258" pathLength={1} data-on={routed} />
          <polygon className="route-head" points="264,95 256,90.5 256,99.5" data-on={routed} style={{ fill: "var(--primary)" }} />
        </svg>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <span className="label-mono">Shapes crossed</span>
        <span className={cn("label-mono tnum transition-colors duration-200", routed ? "text-success" : "text-destructive")} aria-live="polite">
          {routed ? "0" : "1"}
        </span>
      </div>
    </div>
  );
}
