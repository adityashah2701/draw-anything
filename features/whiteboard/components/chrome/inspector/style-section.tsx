import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import type { InspectorModel } from "@/features/whiteboard/utils/inspector-model";
import { Section } from "./inspector-controls";

interface StyleSectionProps {
  model: InspectorModel;
  disabled: boolean;
  onStrokeWidthChange: (width: number) => void;
  onFontSizeChange: (size: number) => void;
  onApplyStyle: (style: { opacity?: number; cornerRadius?: number }) => void;
}

export const StyleSection = ({
  model: m,
  disabled: off,
  onStrokeWidthChange,
  onFontSizeChange,
  onApplyStyle,
}: StyleSectionProps) => {
  return (
    <Section title="Style">
      <div className="grid grid-cols-2 gap-1.5">
        {m.style.strokeWidth !== null && (
          <NumberField
            label="Stroke width"
            prefix="S"
            value={m.style.strokeWidth}
            min={1}
            max={32}
            disabled={off}
            onCommit={onStrokeWidthChange}
          />
        )}
        {m.style.fontSize !== null && (
          <NumberField
            label="Font size"
            prefix="T"
            value={m.style.fontSize}
            min={8}
            max={200}
            disabled={off}
            onCommit={onFontSizeChange}
          />
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
            onCommit={(percent) => onApplyStyle({ opacity: percent / 100 })}
          />
        )}
        {m.style.cornerRadius !== null && (
          <NumberField
            label="Rectangle corner radius"
            prefix="R"
            value={m.style.cornerRadius}
            min={0}
            max={48}
            disabled={off}
            onCommit={(radius) => onApplyStyle({ cornerRadius: radius })}
          />
        )}
      </div>
    </Section>
  );
};

