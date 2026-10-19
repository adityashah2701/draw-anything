import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Group,
  Link2,
  Link2Off,
  Lock,
  Pencil,
  RotateCcw,
  RotateCw,
  Ungroup,
  Unlock,
} from "lucide-react";
import { usePanelInset } from "@/features/whiteboard/components/overlays/panel-layout";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import { IconGlyph } from "@/features/whiteboard/components/properties/icon-glyph";
import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import { CORNER_RADIUS_LIMITS, ICON_SIZE_PRESETS } from "@/core/shapes/semantic-node/style";
import type { SemanticIconPlacement } from "@/features/whiteboard/types/whiteboard.types";
import type { AlignMode, DistributeAxis } from "@/features/whiteboard/utils/arrange";

const IconButton = ({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={`grid h-7 w-7 place-items-center rounded-md border text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      pressed ? "border-sky-500 bg-sky-500/15" : "border-transparent hover:border-border hover:bg-muted"
    }`}
  >
    {children}
  </button>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="border-t border-border px-3 py-2">
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
    {children}
  </div>
);

const ALIGN: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: "left", label: "Align left", Icon: AlignStartVertical },
  { mode: "center", label: "Align horizontal centres", Icon: AlignCenterVertical },
  { mode: "right", label: "Align right", Icon: AlignEndVertical },
  { mode: "top", label: "Align top", Icon: AlignStartHorizontal },
  { mode: "middle", label: "Align vertical centres", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", Icon: AlignEndHorizontal },
];

const DISTRIBUTE: { axis: DistributeAxis; label: string; Icon: typeof AlignStartVertical }[] = [
  { axis: "horizontal", label: "Distribute horizontally", Icon: AlignHorizontalSpaceBetween },
  { axis: "vertical", label: "Distribute vertically", Icon: AlignVerticalSpaceBetween },
];

/**
 * A text field that commits on Enter or blur, never while typing (a half-typed name or label is not an
 * edit), and puts the old text back on Escape. `multiline` keeps line breaks (Shift+Enter adds one).
 */
const TextCommitField = ({
  label,
  value,
  placeholder,
  maxLength,
  multiline,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  disabled: boolean;
  onCommit: (text: string) => void;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const props = {
    "aria-label": label,
    value: draft ?? value,
    disabled,
    placeholder,
    maxLength,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onFocus: (e: { currentTarget: { select: () => void } }) => e.currentTarget.select(),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        commit();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelledRef.current = true;
        setDraft(null);
        e.currentTarget.blur();
      }
    },
    className:
      "w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-sky-500 disabled:opacity-50",
  };
  return multiline ? <textarea rows={2} {...props} className={`${props.className} resize-none py-1`} /> : <input {...props} className={`${props.className} h-8 font-medium`} />;
};

/** One choice out of a few, as a row of toggle buttons (state is `aria-pressed`, so it reads well to assistive tech). */
function Segmented<T extends string | number | null>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { value: T; text: string; title: string }[];
  value: T | "mixed";
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-md border border-border">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          aria-label={`${label}: ${option.title}`}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`h-7 min-w-0 flex-1 px-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === option.value ? "bg-sky-500/20 font-semibold text-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

const ICON_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#dc2626", "#c026d3", "#475569"];

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <div className="mb-1 mt-2 text-[11px] text-muted-foreground first:mt-0">{children}</div>
);

const PLACEMENTS: { value: SemanticIconPlacement | null; text: string; title: string }[] = [
  { value: null, text: "Auto", title: "Automatic" },
  { value: "left", text: "Left", title: "Left" },
  { value: "top", text: "Top", title: "Top" },
  { value: "right", text: "Right", title: "Right" },
];

const SIZES: { value: number | null; text: string; title: string }[] = [
  { value: null, text: "Auto", title: "Automatic" },
  ...ICON_SIZE_PRESETS.map((preset) => ({
    value: preset.size as number | null,
    text: preset.label,
    title: { S: "Small", M: "Medium", L: "Large", XL: "Extra large" }[preset.label] ?? preset.label,
  })),
];

const WEIGHTS: { value: string; text: string; title: string }[] = [
  { value: "400", text: "Reg", title: "Regular" },
  { value: "500", text: "Med", title: "Medium" },
  { value: "600", text: "Semi", title: "Semibold" },
  { value: "700", text: "Bold", title: "Bold" },
];

/**
 * Precise editing of the selection: name and lock, arrange, X/Y/W/H, rotation and stroke/text size.
 * It shows what an edit would change (a group is one object; locked objects are left out) and every
 * field applies to the whole selection as one undo step.
 */
export const SelectionInspector = ({ controller }: { controller: WhiteboardPageController }) => {
  const { inspector, groupCommands: g, elementCommands: c, whiteboardAccess, semanticNodes: sn } = controller;
  const panelInset = usePanelInset(controller.showAIModal, controller.showCodePanel);
  const [open, setOpen] = useState(true);
  const m = inspector.model;
  if (!m) return null;

  const canEdit = whiteboardAccess.hasEditAccess;
  const off = !canEdit || m.locked;
  const frame = m.frame;
  const node = sn.model;
  const nodeOff = !canEdit || !node || node.locked;
  const title = m.group ? "Group" : m.unitCount > 1 ? `${m.unitCount} objects` : "Object";

  return (
    <div
      role="group"
      aria-label="Selection properties"
      data-testid="selection-inspector"
      style={{ right: panelInset + 16 }}
      className="pointer-events-auto absolute top-[112px] z-40 max-h-[calc(100vh-136px)] w-[236px] overflow-y-auto rounded-xl border border-border bg-popover/95 text-foreground shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          aria-label={open ? "Collapse properties" : "Expand properties"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-6 w-6 place-items-center rounded-md hover:bg-muted"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="flex-1 text-xs font-semibold">{title}</span>
        <IconButton label="Group (Ctrl+G)" onClick={g.group} disabled={!canEdit || !g.canGroup}>
          <Group size={14} />
        </IconButton>
        <IconButton label="Ungroup (Ctrl+Shift+G)" onClick={g.ungroup} disabled={!canEdit || !g.canUngroup}>
          <Ungroup size={14} />
        </IconButton>
        <IconButton label="Hide (Ctrl+Shift+H)" onClick={() => controller.organizeCommands.hide()} disabled={!canEdit || m.locked}>
          <EyeOff size={14} />
        </IconButton>
        <IconButton label={g.allLocked ? "Unlock (Ctrl+Shift+L)" : "Lock (Ctrl+Shift+L)"} onClick={g.toggleLock} disabled={!canEdit} pressed={g.allLocked}>
          {g.allLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </IconButton>
      </div>

      {open && (
        <>
          {m.group && (
            <div className="px-3 pb-2">
              <TextCommitField label="Group name" value={m.group.rawName} placeholder="Group" maxLength={80} disabled={!canEdit || m.locked} onCommit={(name) => name.trim() !== m.group!.rawName && g.rename(m.group!.id, name.trim())} />
            </div>
          )}
          {(m.partlyLocked || m.locked) && (
            <div className="px-3 pb-2 text-[11px] text-muted-foreground">
              {m.locked ? "Locked: unlock to edit." : "Locked objects are left out of edits."}
            </div>
          )}

          {node && (
            <Section title={node.count > 1 ? `${node.count} nodes` : "Node"}>
              <FieldLabel>Label</FieldLabel>
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  <TextCommitField
                    label="Node label"
                    value={node.label === "mixed" ? "" : node.label}
                    placeholder={node.label === "mixed" ? "Mixed" : "Label"}
                    multiline
                    maxLength={300}
                    disabled={nodeOff}
                    onCommit={sn.setLabel}
                  />
                </div>
                {node.count === 1 && (
                  <IconButton label="Edit label on canvas" onClick={sn.editLabel} disabled={nodeOff}>
                    <Pencil size={14} />
                  </IconButton>
                )}
              </div>

              <FieldLabel>Icon</FieldLabel>
              <div className="flex items-center gap-2">
                <span
                  data-testid="node-icon-preview"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-background"
                >
                  {node.icon !== "mixed" && !node.icon.hidden && <IconGlyph icon={node.icon.def} size={22} />}
                </span>
                <div className="min-w-0 flex-1 truncate text-xs">
                  {node.icon === "mixed" ? "Mixed" : node.icon.hidden ? "No icon" : node.icon.title}
                </div>
                <button
                  type="button"
                  onClick={sn.openIconPicker}
                  disabled={nodeOff}
                  className="h-7 shrink-0 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Change icon
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {node.icon !== "mixed" && node.icon.hidden ? (
                  <button
                    type="button"
                    disabled={nodeOff}
                    onClick={() => sn.setStyle({ iconHidden: undefined })}
                    className="h-7 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Show icon
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={nodeOff}
                    onClick={sn.removeIcon}
                    className="h-7 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove icon
                  </button>
                )}
                <button
                  type="button"
                  disabled={nodeOff || !node.canRestore}
                  onClick={sn.restoreIcon}
                  className="h-7 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Restore default
                </button>
              </div>

              <FieldLabel>Icon size</FieldLabel>
              <Segmented label="Icon size" options={SIZES} value={node.iconSize} disabled={nodeOff} onChange={(size) => sn.setStyle({ iconSize: size ?? undefined })} />
              <FieldLabel>Icon position</FieldLabel>
              <Segmented label="Icon position" options={PLACEMENTS} value={node.iconPlacement} disabled={nodeOff} onChange={(placement) => sn.setStyle({ iconPlacement: placement ?? undefined })} />
              <FieldLabel>Icon colour</FieldLabel>
              <div role="group" aria-label="Icon colour" className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  aria-label="Icon colour: Automatic"
                  aria-pressed={node.iconColor === null}
                  title="Automatic"
                  disabled={nodeOff}
                  onClick={() => sn.setStyle({ iconColor: undefined })}
                  className={`h-6 rounded-md border px-1.5 text-[11px] disabled:opacity-40 ${node.iconColor === null ? "border-sky-500 bg-sky-500/15" : "border-border hover:bg-muted"}`}
                >
                  Auto
                </button>
                {ICON_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Icon colour: ${color}`}
                    aria-pressed={node.iconColor === color}
                    title={color}
                    disabled={nodeOff}
                    onClick={() => sn.setStyle({ iconColor: color })}
                    style={{ backgroundColor: color }}
                    className={`h-6 w-6 rounded-md border-2 disabled:opacity-40 ${node.iconColor === color ? "border-foreground" : "border-transparent"}`}
                  />
                ))}
              </div>

              <FieldLabel>Corner radius</FieldLabel>
              <NumberField
                label="Corner radius"
                prefix="R"
                value={node.cornerRadius}
                min={CORNER_RADIUS_LIMITS.min}
                max={CORNER_RADIUS_LIMITS.max}
                disabled={nodeOff}
                onCommit={(radius) => sn.setStyle({ cornerRadius: radius })}
              />

              <FieldLabel>Text</FieldLabel>
              <Segmented label="Font weight" options={WEIGHTS} value={node.fontWeight} disabled={nodeOff} onChange={(weight) => sn.setTypography({ fontWeight: weight })} />
              <div className="mt-1.5">
                <button
                  type="button"
                  aria-pressed={node.italic === true}
                  disabled={nodeOff}
                  onClick={() => sn.setTypography({ italic: node.italic !== true })}
                  className={`h-7 rounded-md border px-3 text-xs italic disabled:opacity-40 ${node.italic === true ? "border-sky-500 bg-sky-500/15" : "border-border hover:bg-muted"}`}
                >
                  Italic
                </button>
              </div>
            </Section>
          )}

          {m.unitCount > 1 && (
            <Section title="Arrange">
              <div className="flex flex-wrap items-center gap-0.5">
                {ALIGN.map(({ mode, label, Icon }) => (
                  <IconButton key={mode} label={label} onClick={() => c.align(mode)} disabled={!canEdit || m.editableUnitCount < 1}>
                    <Icon size={15} />
                  </IconButton>
                ))}
                <span className="mx-1 h-4 w-px bg-border" />
                {DISTRIBUTE.map(({ axis, label, Icon }) => (
                  <IconButton key={axis} label={label} onClick={() => c.distribute(axis)} disabled={!canEdit || m.editableUnitCount < 3}>
                    <Icon size={15} />
                  </IconButton>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <NumberField label="Horizontal gap" prefix="↔" value="mixed" emptyHint="Gap" min={0} disabled={!canEdit || m.editableUnitCount < 2} onCommit={(gap) => c.spacing("horizontal", gap)} />
                <NumberField label="Vertical gap" prefix="↕" value="mixed" emptyHint="Gap" min={0} disabled={!canEdit || m.editableUnitCount < 2} onCommit={(gap) => c.spacing("vertical", gap)} />
              </div>
            </Section>
          )}

          {m.connector && (
            <Section title="Connector">
              <TextCommitField
                label="Connector label"
                value={m.connector.label}
                placeholder="Label"
                maxLength={120}
                disabled={off}
                onCommit={(text) => controller.organizeCommands.setConnectorLabel(m.connector!.id, text)}
              />
            </Section>
          )}

          {frame && (
            <Section title="Position and size">
              <div className="grid grid-cols-2 gap-1.5">
                <NumberField label="X" prefix="X" value={frame.x} disabled={off} onCommit={(x) => inspector.setFrame({ x })} />
                <NumberField label="Y" prefix="Y" value={frame.y} disabled={off} onCommit={(y) => inspector.setFrame({ y })} />
                <NumberField label="Width" prefix="W" value={frame.width} min={1} disabled={off} onCommit={(width) => inspector.setFrame({ width })} />
                <NumberField label="Height" prefix="H" value={frame.height} min={1} disabled={off} onCommit={(height) => inspector.setFrame({ height })} />
              </div>
              <div className="mt-1.5 flex items-center justify-end">
                <IconButton
                  label={inspector.keepRatio ? "Proportions locked" : "Lock proportions"}
                  pressed={inspector.keepRatio}
                  onClick={() => inspector.setKeepRatio(!inspector.keepRatio)}
                >
                  {inspector.keepRatio ? <Link2 size={14} /> : <Link2Off size={14} />}
                </IconButton>
              </div>
            </Section>
          )}

          {m.rotation.mode !== "none" && (
            <Section title={m.rotation.mode === "absolute" ? "Rotation" : "Rotate selection"}>
              <div className="flex items-center gap-1.5">
                <NumberField
                  label={m.rotation.mode === "absolute" ? "Rotation" : "Rotate by"}
                  suffix="°"
                  value={m.rotation.mode === "absolute" ? m.rotation.value : 0}
                  step={m.rotation.mode === "absolute" ? 1 : 15}
                  disabled={off}
                  onCommit={(deg) => (m.rotation.mode === "absolute" ? inspector.setRotation(deg) : inspector.rotateBy(deg))}
                  className="flex-1"
                />
                <IconButton label="Rotate 90° anticlockwise" onClick={() => inspector.rotateBy(-90)} disabled={off}>
                  <RotateCcw size={14} />
                </IconButton>
                <IconButton label="Rotate 90° clockwise" onClick={() => inspector.rotateBy(90)} disabled={off}>
                  <RotateCw size={14} />
                </IconButton>
              </div>
            </Section>
          )}

          <Section title="Style">
            <div className="grid grid-cols-2 gap-1.5">
              {m.style.strokeWidth !== null && (
                <NumberField label="Stroke width" prefix="S" value={m.style.strokeWidth} min={1} max={32} disabled={off} onCommit={controller.handleStrokeWidthChange} />
              )}
              {m.style.fontSize !== null && (
                <NumberField label="Font size" prefix="T" value={m.style.fontSize} min={8} max={200} disabled={off} onCommit={controller.handleFontSizeChange} />
              )}
              {m.style.opacity !== null && (
                <NumberField
                  label="Opacity"
                  prefix="O"
                  suffix="%"
                  value={m.style.opacity === "mixed" ? "mixed" : Math.round(m.style.opacity * 100)}
                  min={0}
                  max={100}
                  step={5}
                  disabled={off}
                  onCommit={(percent) => controller.applyStyle({ opacity: percent / 100 })}
                />
              )}
              {m.style.cornerRadius !== null && (
                <NumberField label="Rectangle corner radius" prefix="R" value={m.style.cornerRadius} min={0} max={48} disabled={off} onCommit={(radius) => controller.applyStyle({ cornerRadius: radius })} />
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
};

export default SelectionInspector;
