import { cn } from "@/lib/utils";
import { MARK_NODE_PATHS, MARK_RING_PATH, MARK_VIEWBOX } from "@/lib/brand";

/**
 * The Draw Anything mark: a D whose stem ends are two selection-handle nodes and whose bowl is the connector
 * between them. A drawing tool's two primitives, a node and a line that joins nodes, spelled as the initial.
 * It follows the theme's ink (`--primary`), so it reads on paper and on graphite. Orange belongs to the agent
 * and is not used here. Geometry lives in `lib/brand.ts`; rules in `docs/design/brand.md`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} fill="none" aria-hidden="true" focusable="false" className={cn("size-6 shrink-0", className)}>
      <path d={MARK_RING_PATH} className="fill-primary" />
      {MARK_NODE_PATHS.map((d) => (
        <path key={d} d={d} className="fill-primary" />
      ))}
    </svg>
  );
}

/**
 * The mark as a loading indicator: the two nodes take turns dimming, like a connection being made. Opacity
 * only, and still under `prefers-reduced-motion` (see `.brand-node` in globals.css).
 */
export function LogoLoader({ className, label }: { className?: string; label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3">
      <svg viewBox={MARK_VIEWBOX} fill="none" aria-hidden="true" focusable="false" className={cn("size-10 shrink-0", className)}>
        <path d={MARK_RING_PATH} className="fill-primary" />
        {MARK_NODE_PATHS.map((d, i) => (
          <path key={d} d={d} className="brand-node fill-primary" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
      </svg>
      <p className="label-mono">{label}</p>
    </div>
  );
}
