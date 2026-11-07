import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import type { InspectorModel } from "@/features/whiteboard/utils/inspector-model";
import { ALIGN, DISTRIBUTE, IconButton, Section } from "./inspector-controls";

interface AlignmentSectionProps {
  model: InspectorModel;
  elementCommands: WhiteboardPageController["elementCommands"];
  canEdit: boolean;
}

export const AlignmentSection = ({ model: m, elementCommands: c, canEdit }: AlignmentSectionProps) => {
  if (m.unitCount <= 1) return null;

  return (
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
        <NumberField
          label="Horizontal gap"
          prefix="↔"
          value="mixed"
          emptyHint="Gap"
          min={0}
          disabled={!canEdit || m.editableUnitCount < 2}
          onCommit={(gap) => c.spacing("horizontal", gap)}
        />
        <NumberField
          label="Vertical gap"
          prefix="↕"
          value="mixed"
          emptyHint="Gap"
          min={0}
          disabled={!canEdit || m.editableUnitCount < 2}
          onCommit={(gap) => c.spacing("vertical", gap)}
        />
      </div>
    </Section>
  );
};
