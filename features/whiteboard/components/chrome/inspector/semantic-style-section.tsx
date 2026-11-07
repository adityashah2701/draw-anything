import { Pencil } from "lucide-react";
import { IconGlyph } from "@/features/whiteboard/components/properties/icon-glyph";
import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import { CORNER_RADIUS_LIMITS } from "@/core/shapes/semantic-node/style";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import {
  FieldLabel,
  IconButton,
  ICON_COLORS,
  PLACEMENTS,
  Section,
  Segmented,
  SIZES,
  TextCommitField,
  WEIGHTS,
} from "./inspector-controls";

interface SemanticStyleSectionProps {
  semanticNodes: WhiteboardPageController["semanticNodes"];
  canEdit: boolean;
}

export const SemanticStyleSection = ({ semanticNodes: sn, canEdit }: SemanticStyleSectionProps) => {
  const node = sn.model;
  if (!node) return null;
  const nodeOff = !canEdit || node.locked;

  return (
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
          className={`h-6 rounded-md border px-1.5 text-[11px] disabled:opacity-40 ${node.iconColor === null ? "border-primary bg-primary/15" : "border-border hover:bg-muted"}`}
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
          className={`h-7 rounded-md border px-3 text-xs italic disabled:opacity-40 ${node.italic === true ? "border-primary bg-primary/15" : "border-border hover:bg-muted"}`}
        >
          Italic
        </button>
      </div>
    </Section>
  );
};
