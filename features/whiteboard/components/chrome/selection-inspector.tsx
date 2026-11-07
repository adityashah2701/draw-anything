import { useState } from "react";
import { ChevronDown, ChevronRight, EyeOff, Group, Lock, Ungroup, Unlock } from "lucide-react";
import { usePanelInset } from "@/features/whiteboard/components/overlays/panel-layout";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import { IconButton, Section, TextCommitField } from "./inspector/inspector-controls";
import { TransformSection } from "./inspector/transform-section";
import { AlignmentSection } from "./inspector/alignment-section";
import { SemanticStyleSection } from "./inspector/semantic-style-section";
import { StructuredSection } from "./inspector/structured-section";
import { StyleSection } from "./inspector/style-section";

/**
 * Precise editing of the selection: name and lock, arrange, X/Y/W/H, rotation and stroke/text size.
 * It shows what an edit would change (a group is one object; locked objects are left out) and every
 * field applies to the whole selection as one undo step.
 */
export const SelectionInspector = ({ controller }: { controller: WhiteboardPageController }) => {
  const { inspector, groupCommands: g, elementCommands: c, whiteboardAccess, semanticNodes: sn, structured } = controller;
  const panelInset = usePanelInset(controller.showAIModal, controller.showCodePanel);
  const [open, setOpen] = useState(true);
  const m = inspector.model;
  if (!m) return null;

  const canEdit = whiteboardAccess.hasEditAccess;
  const off = !canEdit || m.locked;
  const title = m.group ? "Group" : m.unitCount > 1 ? `${m.unitCount} objects` : "Object";

  return (
    <div
      role="group"
      aria-label="Selection properties"
      data-testid="selection-inspector"
      style={{ right: panelInset + 16 }}
      className="pointer-events-auto absolute top-[112px] z-40 max-h-[calc(100vh-136px)] w-[236px] overflow-y-auto rounded-lg border border-border bg-popover text-foreground shadow-popover-xl"
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
              <TextCommitField
                label="Group name"
                value={m.group.rawName}
                placeholder="Group"
                maxLength={80}
                disabled={!canEdit || m.locked}
                onCommit={(name) => name.trim() !== m.group!.rawName && g.rename(m.group!.id, name.trim())}
              />
            </div>
          )}
          {(m.partlyLocked || m.locked) && (
            <div className="px-3 pb-2 text-[11px] text-muted-foreground">
              {m.locked ? "Locked: unlock to edit." : "Locked objects are left out of edits."}
            </div>
          )}

          {structured && <StructuredSection structured={structured} />}

          {sn.model && <SemanticStyleSection semanticNodes={sn} canEdit={canEdit} />}

          <AlignmentSection model={m} elementCommands={c} canEdit={canEdit} />

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

          <TransformSection inspector={inspector} disabled={off} />

          <StyleSection
            model={m}
            disabled={off}
            onStrokeWidthChange={controller.handleStrokeWidthChange}
            onFontSizeChange={controller.handleFontSizeChange}
            onApplyStyle={controller.applyStyle}
          />
        </>
      )}
    </div>
  );
};

export default SelectionInspector;
