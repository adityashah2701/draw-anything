import { cn } from "@/lib/utils";

/**
 * The Draw Anything mark: four quarter forms that tile a square, set in ink at four strengths.
 * It follows the theme's ink (`--primary`), so it reads on paper and on graphite. Orange belongs
 * to the agent and is not used here.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 49 48" fill="none" aria-hidden="true" focusable="false" className={cn("size-6 shrink-0", className)}>
      <path d="M1.98 29.29a17.21 17.21 0 0 1 17.21-17.21v17.21H1.98Z" className="fill-primary/75" />
      <path d="M1.98 29.29a17.21 17.21 0 0 0 17.21 17.21V29.29H1.98Z" className="fill-primary/50" />
      <path d="M36.4 29.29a17.21 17.21 0 0 1-17.21 17.21V29.29H36.4Z" className="fill-primary/25" />
      <path d="M47.02 14.42c0 7.14-5.79 12.92-12.93 12.92H21.17V14.42C21.17 7.29 26.96 1.5 34.09 1.5s12.93 5.79 12.93 12.92Z" className="fill-primary" />
    </svg>
  );
}
