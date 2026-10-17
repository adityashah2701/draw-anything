import { Bot, Code2 } from "lucide-react";

interface CanvasEmptyStateProps {
  canEdit: boolean;
  onGenerate: () => void;
  onOpenCode?: () => void;
}

/** Shown on an empty, loaded board: says what to do next instead of a blank grid. */
export const CanvasEmptyState = ({ canEdit, onGenerate, onOpenCode }: CanvasEmptyStateProps) => (
  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
    <div className="max-w-sm rounded-xl border border-dashed border-border bg-card/80 px-6 py-5 text-center shadow-sm backdrop-blur">
      <h2 className="text-base font-semibold text-foreground">{canEdit ? "Nothing here yet" : "This board is empty"}</h2>
      {canEdit && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a tool on the left (<kbd className="rounded border px-1">R</kbd> rectangle,{" "}
            <kbd className="rounded border px-1">T</kbd> text,{" "}
            <kbd className="rounded border px-1">A</kbd> arrow), or have the agent draw a first version, or write it as code. Press{" "}
            <kbd className="rounded border px-1">?</kbd> for every shortcut.
          </p>
          <div className="pointer-events-auto mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onGenerate}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Bot size={14} /> Ask the agent
            </button>
            {onOpenCode && (
              <button
                type="button"
                onClick={onOpenCode}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Code2 size={14} /> Write code
              </button>
            )}
          </div>
        </>
      )}
    </div>
  </div>
);

export default CanvasEmptyState;
