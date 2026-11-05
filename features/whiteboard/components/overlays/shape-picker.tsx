"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { VocabularyEntry, VocabularyFamily } from "@/core/shapes/vocabulary";
import { moveGridIndex, type GridKey } from "@/features/whiteboard/utils/icon-picker";
import {
  FAMILY_LABELS,
  categoryLabel,
  loadRecentShapeIds,
  pickerShapes,
  recentShapes,
  saveRecentShapeIds,
  shapeCategories,
  shapeFamilies,
  shapeLabel,
  withRecentShape,
} from "@/features/whiteboard/utils/shape-picker";
import { PREVIEW, shapePreview } from "@/features/whiteboard/utils/shape-preview";

const COLUMNS = 5;
const GRID_KEYS = new Set<string>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/** A shape's picture, drawn from the same geometry the canvas uses (`shapePreview`). */
export function ShapeGlyph({ entry, size = 40 }: { entry: VocabularyEntry; size?: number }) {
  const preview = shapePreview(entry);
  if (!preview) return null;
  return (
    <svg
      width={size}
      height={(size * PREVIEW.height) / PREVIEW.width}
      viewBox={`0 0 ${PREVIEW.width} ${PREVIEW.height}`}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      {preview.outlines.map((outline, i) => (
        <path key={i} d={outline.d} strokeWidth={outline.width} />
      ))}
      {preview.marks.map((mark, i) => (
        <path key={`m${i}`} d={mark.d} strokeWidth={1.4} fill={mark.filled ? "currentColor" : "none"} />
      ))}
      {preview.circles.map((c, i) => (
        <circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r} strokeWidth={1.4} fill={c.filled ? "currentColor" : "none"} />
      ))}
    </svg>
  );
}

interface ShapePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (entry: VocabularyEntry) => void;
}

/**
 * Search + family filter + category tabs + recents + grid. Focus stays in the search box; arrows move the
 * highlight, Enter inserts. What it lists is the vocabulary's supported entries, nothing else.
 */
export function ShapePicker({ open, onOpenChange, onPick }: ShapePickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [family, setFamily] = useState<VocabularyFamily | null>(null);
  const [active, setActive] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(shapeCategories, []);
  const families = useMemo(shapeFamilies, []);
  const shapes = useMemo(() => pickerShapes(query, category, family), [query, category, family]);
  const current = shapes[Math.min(active, shapes.length - 1)];
  const recent = useMemo(() => recentShapes(recentIds), [recentIds]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory(null);
    setFamily(null);
    setActive(0);
    setRecentIds(loadRecentShapeIds());
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, shapes]);

  const insert = (entry: VocabularyEntry) => {
    const ids = withRecentShape(recentIds, entry.id);
    setRecentIds(ids);
    saveRecentShapeIds(ids);
    onPick(entry);
    onOpenChange(false);
  };

  const chip = (selected: boolean) =>
    `rounded-full px-2.5 py-1 text-xs transition-colors ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-4 sm:max-w-[560px]" showCloseButton={false}>
        <DialogTitle className="sr-only">Insert shape</DialogTitle>
        <DialogDescription className="sr-only">
          Search shapes by name or alias, filter by diagram type or category, move with the arrow keys and press Enter to add the highlighted one to the board.
        </DialogDescription>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3">
          <Search size={16} className="text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (GRID_KEYS.has(e.key) && shapes.length > 0) {
                e.preventDefault();
                setActive((i) => moveGridIndex(i, e.key as GridKey, COLUMNS, shapes.length));
              } else if (e.key === "Enter" && current) {
                e.preventDefault();
                insert(current);
              }
            }}
            placeholder="Search shapes (try “gateway” or “queue”)"
            aria-label="Search shapes"
            aria-controls="shape-picker-grid"
            aria-activedescendant={current ? `shape-option-${current.id}` : undefined}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Diagram type">
          {[null, ...families].map((entry) => (
            <button
              key={entry ?? "all"}
              type="button"
              tabIndex={-1}
              aria-pressed={family === entry}
              onClick={() => {
                setFamily(entry);
                setActive(0);
              }}
              className={chip(family === entry)}
            >
              {entry ? FAMILY_LABELS[entry] : "All diagrams"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Categories">
          {[null, ...categories].map((entry) => (
            <button
              key={entry ?? "all"}
              type="button"
              tabIndex={-1}
              aria-pressed={category === entry}
              onClick={() => {
                setCategory(entry);
                setActive(0);
              }}
              className={chip(category === entry)}
            >
              {entry ? categoryLabel(entry) : "All"}
            </button>
          ))}
        </div>
        {!query && category === null && family === null && recent.length > 0 && (
          <div role="group" aria-label="Recently used" className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Recent</span>
            {recent.map((entry) => (
              <button
                key={entry.id}
                type="button"
                tabIndex={-1}
                title={entry.name}
                aria-label={`Recent: ${entry.name}`}
                onClick={() => insert(entry)}
                className="grid h-9 w-12 place-items-center rounded-md border border-transparent hover:bg-muted"
              >
                <ShapeGlyph entry={entry} size={34} />
              </button>
            ))}
          </div>
        )}
        <div ref={listRef} id="shape-picker-grid" role="listbox" aria-label="Shapes" className="max-h-[340px] overflow-y-auto">
          {shapes.length === 0 ? (
            <p role="status" className="py-10 text-center text-sm text-muted-foreground">
              {`No shape matches “${query}”. Try another word, or clear the filters.`}
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {shapes.map((entry, index) => (
                <button
                  key={entry.id}
                  id={`shape-option-${entry.id}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === active}
                  aria-label={shapeLabel(entry)}
                  title={entry.guidance}
                  onClick={() => insert(entry)}
                  onMouseMove={() => index !== active && setActive(index)}
                  className={`flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-md border px-1 text-[11px] transition-colors ${
                    index === active ? "border-primary bg-muted" : "border-transparent hover:bg-muted"
                  }`}
                >
                  <ShapeGlyph entry={entry} />
                  <span className="w-full truncate text-center text-muted-foreground">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {current && (
          <p className="min-h-8 border-t border-border pt-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground">{current.name}.</span> {current.guidance}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
