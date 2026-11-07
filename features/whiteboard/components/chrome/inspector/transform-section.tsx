import { Link2, Link2Off, RotateCcw, RotateCw } from "lucide-react";
import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import type { InspectorModel } from "@/features/whiteboard/utils/inspector-model";
import { IconButton, Section } from "./inspector-controls";

interface TransformSectionProps {
  inspector: {
    model: InspectorModel | null;
    keepRatio: boolean;
    setKeepRatio: (val: boolean) => void;
    setFrame: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
    setRotation: (deg: number) => void;
    rotateBy: (deg: number) => void;
  };
  disabled: boolean;
}

export const TransformSection = ({ inspector, disabled }: TransformSectionProps) => {
  const m = inspector.model;
  if (!m) return null;
  const frame = m.frame;

  return (
    <>
      {frame && (
        <Section title="Position and size">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField label="X" prefix="X" value={frame.x} disabled={disabled} onCommit={(x) => inspector.setFrame({ x })} />
            <NumberField label="Y" prefix="Y" value={frame.y} disabled={disabled} onCommit={(y) => inspector.setFrame({ y })} />
            <NumberField label="Width" prefix="W" value={frame.width} min={1} disabled={disabled} onCommit={(width) => inspector.setFrame({ width })} />
            <NumberField label="Height" prefix="H" value={frame.height} min={1} disabled={disabled} onCommit={(height) => inspector.setFrame({ height })} />
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
              disabled={disabled}
              onCommit={(deg) => (m.rotation.mode === "absolute" ? inspector.setRotation(deg) : inspector.rotateBy(deg))}
              className="flex-1"
            />
            <IconButton label="Rotate 90° anticlockwise" onClick={() => inspector.rotateBy(-90)} disabled={disabled}>
              <RotateCcw size={14} />
            </IconButton>
            <IconButton label="Rotate 90° clockwise" onClick={() => inspector.rotateBy(90)} disabled={disabled}>
              <RotateCw size={14} />
            </IconButton>
          </div>
        </Section>
      )}
    </>
  );
};

