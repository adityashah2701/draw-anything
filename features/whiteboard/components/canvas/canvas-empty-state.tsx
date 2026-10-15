import { Sparkles } from "lucide-react";

interface CanvasEmptyStateProps {
  canEdit: boolean;
  onGenerate: () => void;
}

/** Shown on an empty, loaded board: says what to do next instead of a blank grid. */
export const CanvasEmptyState = ({ canEdit, onGenerate }: CanvasEmptyStateProps) => (
  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
    <div className="max-w-sm rounded-xl border border-dashed border-border bg-card/80 px-6 py-5 text-center shadow-sm backdrop-blur">
      <h2 className="text-base font-semibold text-foreground">{canEdit ? "Nothing here yet" : "This board is empty"}</h2>
      {canEdit && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a tool on the left (<kbd className="rounded border px-1">R</kbd> rectangle,{" "}
            <kbd className="rounded border px-1">T</kbd> text,{" "}
            <kbd className="rounded border px-1">A</kbd> arrow), or let AI draw a first version. Press{" "}
            <kbd className="rounded border px-1">?</kbd> for every shortcut.
          </p>
          <button
            type="button"
            onClick={onGenerate}
            className="pointer-events-auto mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Sparkles size={14} /> Generate a diagram
          </button>
        </>
      )}
    </div>
  </div>
);

export default CanvasEmptyState;
