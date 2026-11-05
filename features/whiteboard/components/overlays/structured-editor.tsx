import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { EntityRow, Point } from "@/features/whiteboard/types/whiteboard.types";
import { planStructured, type StructuredElement } from "@/features/whiteboard/utils/structured-edit";
import { writeRows } from "@/core/shapes/entity-table/rows";

interface Props {
  element: StructuredElement;
  zoom: number;
  panOffset: Point;
  /** Called once with the finished element, or null when nothing changed. */
  onDone: (next: StructuredElement | null) => void;
}

type Key = "pk" | "fk" | "uq";
type Draft = { uid: number; row: EntityRow };

const input = "h-7 min-w-0 rounded border border-transparent bg-transparent px-1.5 text-[13px] text-foreground outline-none hover:border-border focus:border-primary focus:bg-background";
const chip = (on: boolean) => `h-6 w-7 shrink-0 rounded text-[10px] font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`;

let uidSeed = 0;
const nextUid = () => (uidSeed += 1);

/**
 * Edits a structured shape where it sits: a card over the shape with one input per name, field or member.
 * Enter in the last field adds the next one, Tab moves along, Escape or a click outside keeps the text.
 * Everything is written once, when the card closes, so a whole editing session is one undo step.
 */
export function StructuredEditor({ element, zoom, panOffset, onDone }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [name, setName] = useState(element.type === "mindmap-node" ? (element.label ?? "") : (element.name ?? ""));
  const [fields, setFields] = useState<Draft[]>(() => (element.type === "entity-table" ? (element.rows ?? []).map((row) => ({ uid: nextUid(), row })) : []));
  const [attributes, setAttributes] = useState<Array<{ uid: number; text: string }>>(() => (element.type === "uml-classifier" ? (element.attributes ?? []).map((text) => ({ uid: nextUid(), text })) : []));
  const [operations, setOperations] = useState<Array<{ uid: number; text: string }>>(() => (element.type === "uml-classifier" ? (element.operations ?? []).map((text) => ({ uid: nextUid(), text })) : []));
  const focusUid = useRef<number | null>(null);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    let next: StructuredElement = planStructured(element, "name", name);
    if (element.type === "entity-table") next = planStructured(next, "rows", writeRows(fields.map((f) => f.row).filter((r) => r.name.trim())).split("; ").join("\n"));
    if (element.type === "uml-classifier") {
      next = planStructured(next, "attributes", attributes.map((a) => a.text).join("\n"));
      next = planStructured(next, "operations", operations.map((o) => o.text).join("\n"));
    }
    onDone(next);
  };

  // Only on open: selecting the first input on every render would pull focus back to the name while typing a field.
  useEffect(() => {
    cardRef.current?.querySelector<HTMLInputElement>("input")?.select();
  }, []);

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) finish();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
    // finish reads the latest state through the closure of the last render; re-binding on every change keeps it current.
  });

  useEffect(() => {
    if (focusUid.current === null) return;
    cardRef.current?.querySelector<HTMLInputElement>(`[data-uid="${focusUid.current}"]`)?.focus();
    focusUid.current = null;
  });

  const [a, b] = element.points;
  const left = Math.min(a.x, b.x) * zoom + panOffset.x;
  const top = Math.min(a.y, b.y) * zoom + panOffset.y;
  const width = Math.max(Math.abs(b.x - a.x) * zoom, element.type === "mindmap-node" || element.type === "lifeline" ? 200 : 340);

  const addField = (after?: number | "start") => {
    const uid = nextUid();
    focusUid.current = uid;
    setFields((all) => {
      const at = after === undefined ? all.length : after === "start" ? 0 : all.findIndex((f) => f.uid === after) + 1;
      return [...all.slice(0, at), { uid, row: { id: `f${uid}`, name: "", type: "" } }, ...all.slice(at)];
    });
  };
  const setRow = (uid: number, patch: Partial<EntityRow>) => setFields((all) => all.map((f) => (f.uid === uid ? { ...f, row: { ...f.row, ...patch } } : f)));
  const toggleKey = (uid: number, key: Key) =>
    setFields((all) => all.map((f) => (f.uid === uid ? { ...f, row: { ...f.row, keys: f.row.keys?.includes(key) ? f.row.keys.filter((k) => k !== key) : [...(f.row.keys ?? []), key] } } : f)));

  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onMouseDown: (e: React.MouseEvent) => e.stopPropagation() };
  const keys = (e: React.KeyboardEvent, onEnter?: () => void) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    } else if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  const list = (items: Array<{ uid: number; text: string }>, set: (v: Array<{ uid: number; text: string }>) => void, label: string, placeholder: string) => {
    const add = () => {
      const uid = nextUid();
      focusUid.current = uid;
      set([...items, { uid, text: "" }]);
    };
    return (
      <div className="border-t border-border px-2 py-1.5">
        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        {items.map((item) => (
          <div key={item.uid} className="flex items-center gap-1">
            <input
              data-uid={item.uid}
              aria-label={label}
              value={item.text}
              placeholder={placeholder}
              spellCheck={false}
              onChange={(e) => set(items.map((i) => (i.uid === item.uid ? { ...i, text: e.target.value } : i)))}
              onKeyDown={(e) => keys(e, add)}
              className={`${input} flex-1 font-mono`}
            />
            <button type="button" aria-label={`Remove ${label}`} onClick={() => set(items.filter((i) => i.uid !== item.uid))} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted">
              <X size={12} />
            </button>
          </div>
        ))}
        <button type="button" onClick={add} className="mt-0.5 flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus size={12} /> Add
        </button>
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Edit shape content"
      {...stop}
      style={{ position: "absolute", left, top, width, zIndex: 111 }}
      className="overflow-hidden rounded-lg border border-primary bg-popover text-foreground shadow-popover-xl"
    >
      <div className="px-2 py-1.5">
        <input
          aria-label="Name"
          value={name}
          placeholder={element.type === "uml-classifier" ? "ClassName" : element.type === "entity-table" ? "Table name" : "Name"}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => keys(e, element.type === "entity-table" ? () => addField("start") : element.type === "uml-classifier" ? undefined : finish)}
          className={`${input} w-full text-sm font-semibold`}
        />
      </div>

      {element.type === "entity-table" && (
        <div className="border-t border-border px-2 py-1.5">
          {fields.length === 0 && <div className="px-1 pb-1 text-xs text-muted-foreground">No fields yet. Press Enter in the name, or Add field.</div>}
          {fields.map((f) => (
            <div key={f.uid} className="flex items-center gap-1">
              <button type="button" title="Primary key" aria-pressed={!!f.row.keys?.includes("pk")} onClick={() => toggleKey(f.uid, "pk")} className={chip(!!f.row.keys?.includes("pk"))}>PK</button>
              <button type="button" title="Foreign key" aria-pressed={!!f.row.keys?.includes("fk")} onClick={() => toggleKey(f.uid, "fk")} className={chip(!!f.row.keys?.includes("fk"))}>FK</button>
              <input data-uid={f.uid} aria-label="Field name" value={f.row.name} placeholder="field_name" spellCheck={false} onChange={(e) => setRow(f.uid, { name: e.target.value })} onKeyDown={(e) => keys(e)} className={`${input} flex-1 font-medium`} />
              <input aria-label="Field type" value={f.row.type ?? ""} placeholder="type" spellCheck={false} onChange={(e) => setRow(f.uid, { type: e.target.value })} onKeyDown={(e) => keys(e, () => addField(f.uid))} className={`${input} w-24 text-muted-foreground`} />
              <button type="button" title="Can be empty" aria-pressed={!!f.row.nullable} onClick={() => setRow(f.uid, { nullable: f.row.nullable ? undefined : true })} className={chip(!!f.row.nullable)}>NULL</button>
              <button type="button" aria-label="Remove field" onClick={() => setFields((all) => all.filter((x) => x.uid !== f.uid))} className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted">
                <X size={12} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => addField()} className="mt-0.5 flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <Plus size={12} /> Add field
          </button>
        </div>
      )}

      {element.type === "uml-classifier" && (
        <>
          {list(attributes, setAttributes, "Attributes", "-id: int")}
          {list(operations, setOperations, "Operations", "+run(): void")}
        </>
      )}

      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>Enter adds the next one · Esc or click outside saves</span>
        <button type="button" onClick={finish} className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground">Done</button>
      </div>
    </div>
  );
}

