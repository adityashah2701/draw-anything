import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Lock } from "lucide-react";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import { ChoiceRow, ColorGrid, PopoverLabel, PropertyChip, Swatch } from "@/features/whiteboard/components/properties/bar-primitives";
import { TextField } from "@/features/whiteboard/components/properties/text-field";
import { MAX_FRAME_TITLE_LENGTH } from "@/core/frames/frame-model";
import type { FrameHeader } from "@/features/whiteboard/utils/properties-bar-model";
import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import type { Mixed } from "@/features/whiteboard/utils/inspector-model";
import { formatNumber } from "@/features/whiteboard/utils/inspector-model";

const STROKE_COLORS = [
  "#111827", "#6b7280", "#d1d5db", "#ffffff", "#ef4444", "#f97316",
  "#f59e0b", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#92400e", "#0f766e", "#1d4ed8", "#be123c",
];
const FILL_COLORS = [
  "#ffffff", "#f3f4f6", "#fee2e2", "#ffedd5", "#fef3c7", "#dcfce7",
  "#ccfbf1", "#e0f2fe", "#dbeafe", "#ede9fe", "#fce7f3", "#111827",
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
];
const WIDTHS = [1, 2, 4, 8];
const RADII = [
  { value: 0, title: "Sharp corners" },
  { value: 6, title: "Soft corners" },
  { value: 16, title: "Round corners" },
  { value: 24, title: "Extra round corners" },
];
const TEXT_SIZES = [12, 16, 24, 32, 48, 72];
const OPACITIES = [25, 50, 75, 100];

const words = <T,>(value: Mixed<T>, format: (value: T) => string) => (value === "mixed" ? "mixed" : format(value));

const Divider = () => <div className="mx-0.5 h-8 w-px shrink-0 self-center bg-border" aria-hidden />;

/**
 * The bottom properties bar: one labelled section per property group, each opening a popover with its controls.
 * Which sections appear is decided by `readPropertiesBar` (only properties some selected shape has), a mixed
 * selection shows "mixed" instead of one shape's value, and every edit goes through the editor's style command,
 * so it is one undo step on exactly the shapes the property applies to.
 */
const FloatingPropertiesPanel = ({
  controller,
  rightInset = 0,
}: {
  controller: WhiteboardPageController;
  /** Width (px) of the side panels over the right edge; the bar is centred in what is left. */
  rightInset?: number;
}) => {
  const m = controller.propertiesBar;
  const barRef = useRef<HTMLDivElement>(null);
  const [overlaps, setOverlaps] = useState(false);

  const frame = controller.inspector.model?.frame ?? null;
  const { zoom, panOffset } = controller.canvasViewport;
  // Where the selection is on screen: if it reaches under the bar, the bar steps back until pointed at.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const canvas = document.querySelector("canvas")?.getBoundingClientRect();
    if (!bar || !frame || !canvas) {
      setOverlaps(false);
      return;
    }
    const b = bar.getBoundingClientRect();
    const left = canvas.left + frame.x * zoom + panOffset.x;
    const top = canvas.top + frame.y * zoom + panOffset.y;
    const right = left + frame.width * zoom;
    const bottom = top + frame.height * zoom;
    setOverlaps(left < b.right && right > b.left && top < b.bottom && bottom > b.top);
  }, [frame, zoom, panOffset.x, panOffset.y, rightInset, m]);

  if (!m) return null;

  const canEdit = controller.whiteboardAccess.hasEditAccess;
  const off = !canEdit || m.locked;
  const resetKey = m.targetIds.join(",");
  const style = controller.handleStyleChange;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const triggers = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-chip-trigger]:not([disabled])")];
    const at = triggers.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? triggers.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + triggers.length) % triggers.length;
    triggers[next]?.focus();
  };

  const { stroke, fill, border, text, connector, frame: frameProps } = m;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Style properties"
      aria-orientation="horizontal"
      data-testid="properties-bar"
      data-overlaps={overlaps}
      onKeyDown={onKeyDown}
      style={{ left: `calc((100vw - ${rightInset}px) / 2)`, maxWidth: `calc(100vw - ${rightInset}px - 76px)` }}
      className={`pointer-events-auto fixed bottom-4 z-50 -translate-x-1/2 overflow-x-auto rounded-lg border border-border bg-popover p-1 text-foreground shadow-popover-xl animate-in fade-in slide-in-from-bottom-2 duration-150 transition-opacity sm:bottom-6 ${
        overlaps ? "opacity-50 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
    >
      <div className="flex w-max items-center gap-0.5">
        <div className="hidden min-w-[72px] shrink-0 flex-col justify-center px-2.5 md:flex" data-testid="properties-title">
          <span className="text-xs font-semibold leading-tight">{m.title}</span>
          {(m.locked || !canEdit || m.partlyLocked) && (
            <span className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
              {m.locked ? (
                <>
                  <Lock size={10} aria-hidden /> Locked
                </>
              ) : !canEdit ? (
                "View only"
              ) : (
                "Some locked"
              )}
            </span>
          )}
        </div>
        <Divider />

        {frameProps && (
          <PropertyChip
            label="Frame"
            summary={`${words(frameProps.title, (t) => t)}, ${words(frameProps.header, (h) => (h === "hidden" ? "no header" : `${h} header`))}`}
            preview={<span aria-hidden className="block h-4 w-5 rounded-[3px] border-2 border-foreground border-t-[5px]" />}
            disabled={off}
            resetKey={resetKey}
            width={232}
          >
            <PopoverLabel>Title</PopoverLabel>
            <TextField label="Frame title" value={frameProps.title} maxLength={MAX_FRAME_TITLE_LENGTH} onCommit={(title) => controller.updateFrameProps(frameProps.ids, { title })} />
            <PopoverLabel>Header</PopoverLabel>
            <ChoiceRow<FrameHeader>
              label="Frame header"
              value={frameProps.header}
              onChange={(header) => controller.updateFrameProps(frameProps.ids, header === "hidden" ? { headerVisible: false } : { headerVisible: true, titlePlacement: header })}
              options={[
                { value: "inside", title: "Title in a band inside the frame", content: <span>Inside</span> },
                { value: "above", title: "Title on a tab above the frame", content: <span>Tab</span> },
                { value: "hidden", title: "No title", content: <span>None</span> },
              ]}
            />
            <PopoverLabel>Padding around contents</PopoverLabel>
            <NumberField label="Frame padding in pixels" suffix="px" value={frameProps.padding} min={0} max={200} onCommit={(padding) => controller.updateFrameProps(frameProps.ids, { padding })} />
            <PopoverLabel>Size</PopoverLabel>
            <ChoiceRow
              label="Frame size mode"
              value={frameProps.autoFit}
              onChange={(autoFit) => controller.updateFrameProps(frameProps.ids, { autoFit })}
              options={[
                { value: false, title: "Resize by hand", content: <span>Manual</span> },
                { value: true, title: "Always wrap its contents", content: <span>Auto-fit</span> },
              ]}
            />
            <button
              type="button"
              onClick={() => controller.fitFramesToContent(frameProps.ids)}
              className="mt-1.5 h-8 w-full rounded-md border border-border text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Fit to content
            </button>
          </PropertyChip>
        )}

        {stroke && (
          <PropertyChip
            label={stroke.colorLabel}
            summary={`${words(stroke.color, (c) => c)}${stroke.width === null ? "" : `, ${words(stroke.width, (w) => `${formatNumber(w)} px`)}`}`}
            preview={<Swatch color={stroke.color} />}
            disabled={off}
            resetKey={resetKey}
          >
            <PopoverLabel>{stroke.colorLabel === "Text color" ? "Text color" : "Color"}</PopoverLabel>
            <ColorGrid label={stroke.colorLabel} colors={STROKE_COLORS} value={stroke.color} onPick={(color) => style({ color }, stroke.colorIds)} />
            {stroke.width !== null && (
              <>
                <PopoverLabel>Width</PopoverLabel>
                <ChoiceRow
                  label="Stroke width"
                  value={stroke.width}
                  onChange={(width) => style({ strokeWidth: width }, stroke.widthIds)}
                  options={WIDTHS.map((width) => ({
                    value: width,
                    title: `${width} px`,
                    content: <span aria-hidden className="block w-6 rounded-full bg-foreground" style={{ height: Math.max(1, width) }} />,
                  }))}
                />
                <div className="mt-1.5">
                  <NumberField label="Stroke width in pixels" suffix="px" value={stroke.width} min={1} max={32} onCommit={(width) => style({ strokeWidth: width }, stroke.widthIds)} />
                </div>
              </>
            )}
          </PropertyChip>
        )}

        {fill && (
          <PropertyChip label="Fill" summary={fill.value === "transparent" ? "none" : words(fill.value, (c) => c)} preview={<Swatch color={fill.value === "transparent" ? "none" : fill.value} />} disabled={off} resetKey={resetKey}>
            <ColorGrid
              label="Fill"
              colors={FILL_COLORS}
              value={fill.value === "transparent" ? "mixed" : fill.value}
              onPick={(color) => style({ fill: color }, fill.ids)}
              extra={
                <button
                  type="button"
                  aria-pressed={fill.value === "transparent"}
                  aria-label="Fill: none"
                  title="No fill"
                  onClick={() => style({ fill: null }, fill.ids)}
                  className={`grid h-7 w-full place-items-center rounded-md outline-none ring-1 ring-inset focus-visible:ring-2 focus-visible:ring-ring ${fill.value === "transparent" ? "ring-2 ring-sky-500" : "ring-foreground/20 hover:ring-foreground/50"}`}
                >
                  <Swatch color="none" size={18} ring={false} />
                </button>
              }
            />
          </PropertyChip>
        )}

        {border && (
          <PropertyChip
            label="Corners"
            summary={words(border.radius, (r) => `${formatNumber(r)} px radius`)}
            preview={<span aria-hidden className="block h-4 w-4 border-2 border-foreground" style={{ borderRadius: border.radius === "mixed" ? 4 : Math.min(8, border.radius / 2) }} />}
            disabled={off}
            resetKey={resetKey}
          >
            <PopoverLabel>Corner radius</PopoverLabel>
            <ChoiceRow
              label="Corner radius"
              value={border.radius}
              onChange={(radius) => style({ cornerRadius: radius }, border.ids)}
              options={RADII.map((r) => ({
                value: r.value,
                title: r.title,
                content: <span aria-hidden className="block h-4 w-4 border-2 border-foreground" style={{ borderRadius: Math.min(8, r.value / 2) }} />,
              }))}
            />
            <div className="mt-1.5">
              <NumberField label="Corner radius in pixels" suffix="px" value={border.radius} min={0} max={48} onCommit={(radius) => style({ cornerRadius: radius }, border.ids)} />
            </div>
          </PropertyChip>
        )}

        {text && (
          <PropertyChip label="Text" summary={words(text.size, (s) => `${formatNumber(s)} px`)} preview={<span aria-hidden>Aa</span>} disabled={off} resetKey={resetKey}>
            <PopoverLabel>Font size</PopoverLabel>
            <ChoiceRow
              label="Font size"
              value={text.size}
              columns={3}
              onChange={(size) => style({ fontSize: size }, text.ids)}
              options={TEXT_SIZES.map((size) => ({ value: size, title: `${size} px`, content: <span>{size}</span> }))}
            />
            <div className="mt-1.5">
              <NumberField label="Font size in pixels" suffix="px" value={text.size} min={8} max={200} onCommit={(size) => style({ fontSize: size }, text.ids)} />
            </div>
          </PropertyChip>
        )}

        {connector && (
          <PropertyChip
            label="Line"
            summary={`${words(connector.dashed, (d) => (d ? "dashed" : "solid"))}, ${words(connector.routing, (r) => (r === "straight" ? "straight" : r === "curved" ? "curved" : "elbow"))}`}
            preview={
              <svg aria-hidden width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={connector.dashed === true ? "4 3" : undefined}>
                <path d="M1 6h17M14 2l5 4-5 4" />
              </svg>
            }
            disabled={off}
            resetKey={resetKey}
          >
            <PopoverLabel>Line style</PopoverLabel>
            <ChoiceRow
              label="Line style"
              value={connector.dashed}
              onChange={(dashed) => controller.updateConnectors(connector.ids, { dashed })}
              options={[
                { value: false, title: "Solid", content: <span aria-hidden className="block w-8 border-t-2 border-foreground" /> },
                { value: true, title: "Dashed", content: <span aria-hidden className="block w-8 border-t-2 border-dashed border-foreground" /> },
              ]}
            />
            <PopoverLabel>Path</PopoverLabel>
            <ChoiceRow
              label="Path"
              value={connector.routing}
              onChange={(routingMode) => controller.updateConnectors(connector.ids, { routingMode })}
              options={[
                { value: "orthogonal", title: "Elbow", content: <span>Elbow</span> },
                { value: "curved", title: "Curved", content: <span>Curved</span> },
                { value: "straight", title: "Straight", content: <span>Straight</span> },
              ]}
            />
            <PopoverLabel>Ends</PopoverLabel>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceRow label="Start arrowhead" value={connector.headStart} onChange={(arrowHeadStart) => controller.updateConnectors(connector.ids, { arrowHeadStart })} options={[{ value: false, title: "None", content: <span>None</span> }, { value: true, title: "Arrow", content: <span>Arrow</span> }]} />
              <ChoiceRow label="End arrowhead" value={connector.headEnd} onChange={(arrowHeadEnd) => controller.updateConnectors(connector.ids, { arrowHeadEnd })} options={[{ value: false, title: "None", content: <span>None</span> }, { value: true, title: "Arrow", content: <span>Arrow</span> }]} />
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
              <span>Start</span>
              <span>End</span>
            </div>
          </PropertyChip>
        )}

        <Divider />
        <PropertyChip
          label="Opacity"
          summary={words(m.opacity, (o) => `${Math.round(o * 100)}%`)}
          preview={<span aria-hidden className="text-xs tabular-nums">{m.opacity === "mixed" ? "–" : `${Math.round(m.opacity * 100)}%`}</span>}
          disabled={off}
          resetKey={resetKey}
          width={208}
        >
          <PopoverLabel>Opacity</PopoverLabel>
          <ChoiceRow
            label="Opacity"
            value={m.opacity === "mixed" ? "mixed" : Math.round(m.opacity * 100)}
            onChange={(percent) => style({ opacity: percent / 100 }, m.targetIds)}
            options={OPACITIES.map((percent) => ({ value: percent, title: `${percent}%`, content: <span>{percent}%</span> }))}
          />
          <div className="mt-1.5">
            <NumberField
              label="Opacity in percent"
              suffix="%"
              value={m.opacity === "mixed" ? "mixed" : Math.round(m.opacity * 100)}
              min={5}
              max={100}
              onCommit={(percent) => style({ opacity: percent / 100 }, m.targetIds)}
            />
          </div>
        </PropertyChip>
      </div>
    </div>
  );
};

export default FloatingPropertiesPanel;
