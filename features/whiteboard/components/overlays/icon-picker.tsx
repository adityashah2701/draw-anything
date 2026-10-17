"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { importSvgIcon } from "@/core/icons/custom-icon";
import { categoryTint, type IconDef } from "@/core/icons/registry";
import {
  ICON_CATEGORY_LABELS,
  iconCategories,
  iconTitle,
  loadCustomIcons,
  moveGridIndex,
  pickerIcons,
  rememberCustomIcon,
  type GridKey,
  type PickerCategory,
} from "@/features/whiteboard/utils/icon-picker";

const COLUMNS = 5;
const GRID_KEYS = new Set<string>([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

const Glyph = ({ icon }: { icon: IconDef }) => {
  const logo = icon.style === "logo";
  const color = icon.color ?? categoryTint(icon.category);
  const svg = (
    <svg
      viewBox={`0 0 ${icon.viewBox.width} ${icon.viewBox.height}`}
      width={logo ? 22 : 28}
      height={logo ? 22 : 28}
      fill={logo ? color : "none"}
      stroke={logo ? "none" : color}
      strokeWidth={icon.strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icon.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
  // Brand marks keep their own colours, so they sit on the same white tile the canvas draws them on.
  return logo ? <span className="rounded-md bg-white p-1">{svg}</span> : svg;
};

interface IconPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (icon: IconDef) => void;
}

/** Search + category chips + grid. Focus stays in the search box; arrows move the highlight, Enter inserts. */
export function IconPicker({ open, onOpenChange, onInsert }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PickerCategory | null>(null);
  const [active, setActive] = useState(0);
  const [custom, setCustom] = useState<IconDef[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(iconCategories, []);
  const icons = useMemo(
    () => pickerIcons(query, category, custom),
    [query, category, custom],
  );
  const current = icons[Math.min(active, icons.length - 1)];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory(null);
    setActive(0);
    setImportError(null);
    setCustom(loadCustomIcons());
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, icons]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const result = importSvgIcon(await file.text(), file.name);
    if ("error" in result) {
      setImportError(result.error);
      return;
    }
    setImportError(null);
    setCustom((current) => rememberCustomIcon(result.icon, current));
    setCategory("custom");
    setActive(0);
  };

  const insert = (icon: IconDef) => {
    onInsert(icon);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-3 p-4 sm:max-w-[520px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Insert icon</DialogTitle>
        <DialogDescription className="sr-only">
          Search icons, move with the arrow keys, press Enter to add the
          highlighted one to the board.
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
              if (GRID_KEYS.has(e.key) && icons.length > 0) {
                e.preventDefault();
                setActive((i) =>
                  moveGridIndex(i, e.key as GridKey, COLUMNS, icons.length),
                );
              } else if (e.key === "Enter" && current) {
                e.preventDefault();
                insert(current);
              }
            }}
            placeholder="Search icons (try “postgres” or “queue”)"
            aria-label="Search icons"
            aria-controls="icon-picker-grid"
            aria-activedescendant={
              current ? `icon-option-${current.id}` : undefined
            }
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Categories"
        >
          {[null, ...categories, "custom" as const].map((entry) => (
            <button
              key={entry ?? "all"}
              type="button"
              tabIndex={-1}
              aria-pressed={category === entry}
              onClick={() => {
                setCategory(entry);
                setActive(0);
              }}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                category === entry
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry === "custom"
                ? "Custom"
                : entry
                  ? ICON_CATEGORY_LABELS[entry]
                  : "All"}
            </button>
          ))}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Upload size={12} aria-hidden /> Add SVG…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml"
            aria-label="Import an SVG icon"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {importError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {importError}
          </p>
        )}
        <div
          ref={listRef}
          id="icon-picker-grid"
          role="listbox"
          aria-label="Icons"
          className="max-h-[320px] overflow-y-auto"
        >
          {icons.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {category === "custom" && !query
                ? "No custom icons yet. Add an SVG: only plain shapes are imported, never scripts or images."
                : `No icon matches “${query}”. Try a technology name like “redis”, or clear the category.`}
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {icons.map((icon, index) => (
                <button
                  key={icon.id}
                  id={`icon-option-${icon.id}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === active}
                  title={iconTitle(icon)}
                  onClick={() => insert(icon)}
                  onMouseMove={() => index !== active && setActive(index)}
                  className={`flex h-[76px] flex-col items-center justify-center gap-1 rounded-md border px-1 text-[11px] transition-colors ${
                    index === active
                      ? "border-primary bg-muted"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <Glyph icon={icon} />
                  <span className="w-full truncate text-center text-muted-foreground">
                    {iconTitle(icon)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
