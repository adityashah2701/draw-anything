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
  Group,
  Link2,
  Link2Off,
  Lock,
  RotateCcw,
  RotateCw,
  Ungroup,
  Unlock,
} from "lucide-react";
import { usePanelInset } from "@/features/whiteboard/components/overlays/panel-layout";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import { NumberField } from "@/features/whiteboard/components/properties/number-field";
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

/** A group's name; committed on Enter or blur so typing never renames mid-word. */
const NameField = ({ name, disabled, onCommit }: { name: string; disabled: boolean; onCommit: (name: string) => void }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => setDraft(null), [name]);
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    if (draft !== null && draft.trim() !== name) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      aria-label="Group name"
      value={draft ?? name}
      disabled={disabled}
      placeholder="Group"
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
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
      }}
      className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground outline-none focus:border-sky-500 disabled:opacity-50"
    />
  );
};

/**
 * Precise editing of the selection: name and lock, arrange, X/Y/W/H, rotation and stroke/text size.
 * It shows what an edit would change (a group is one object; locked objects are left out) and every
 * field applies to the whole selection as one undo step.
 */
export const SelectionInspector = ({ controller }: { controller: WhiteboardPageController }) => {
  const { inspector, groupCommands: g, elementCommands: c, whiteboardAccess } = controller;
  const panelInset = usePanelInset(controller.showAIModal, controller.showCodePanel);
  const [open, setOpen] = useState(true);
  const m = inspector.model;
  if (!m) return null;

  const canEdit = whiteboardAccess.hasEditAccess;
  const off = !canEdit || m.locked;
  const frame = m.frame;
  const title = m.group ? "Group" : m.unitCount > 1 ? `${m.unitCount} objects` : "Object";

  return (
    <div
      role="group"
      aria-label="Selection properties"
      data-testid="selection-inspector"
      style={{ right: panelInset + 16 }}
      className="pointer-events-auto absolute top-[112px] z-40 w-[236px] overflow-hidden rounded-xl border border-border bg-popover/95 text-foreground shadow-2xl backdrop-blur-xl"
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
        <IconButton label={g.allLocked ? "Unlock (Ctrl+Shift+L)" : "Lock (Ctrl+Shift+L)"} onClick={g.toggleLock} disabled={!canEdit} pressed={g.allLocked}>
          {g.allLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </IconButton>
      </div>

      {open && (
        <>
          {m.group && (
            <div className="px-3 pb-2">
              <NameField name={m.group.rawName} disabled={!canEdit || m.locked} onCommit={(name) => g.rename(m.group!.id, name)} />
            </div>
          )}
          {(m.partlyLocked || m.locked) && (
            <div className="px-3 pb-2 text-[11px] text-muted-foreground">
              {m.locked ? "Locked: unlock to edit." : "Locked objects are left out of edits."}
            </div>
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

          {(m.style.strokeWidth !== null || m.style.fontSize !== null) && (
            <Section title="Style">
              <div className="grid grid-cols-2 gap-1.5">
                {m.style.strokeWidth !== null && (
                  <NumberField label="Stroke width" prefix="S" value={m.style.strokeWidth} min={1} max={32} disabled={off} onCommit={controller.handleStrokeWidthChange} />
                )}
                {m.style.fontSize !== null && (
                  <NumberField label="Font size" prefix="T" value={m.style.fontSize} min={8} max={200} disabled={off} onCommit={controller.handleFontSizeChange} />
                )}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
};

export default SelectionInspector;
