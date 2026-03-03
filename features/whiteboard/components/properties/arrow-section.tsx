import React from "react";
import {
  ArrowRoutingMode,
  ArrowType,
} from "@/features/whiteboard/types/whiteboard.types";

interface ArrowSectionProps {
  arrowType: ArrowType;
  routingMode: ArrowRoutingMode;
  dashed: boolean;
  arrowHeadStart: boolean;
  arrowHeadEnd: boolean;
  onArrowTypeChange: (type: ArrowType) => void;
  onRoutingModeChange: (mode: ArrowRoutingMode) => void;
  onDashedChange: (value: boolean) => void;
  onArrowHeadStartChange: (value: boolean) => void;
  onArrowHeadEndChange: (value: boolean) => void;
  disabled?: boolean;
}

const controlClass = (disabled: boolean) =>
  `h-8 rounded-md border px-2 text-xs ${
    disabled
      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
  }`;

export const ArrowSection: React.FC<ArrowSectionProps> = ({
  arrowType,
  routingMode,
  dashed,
  arrowHeadStart,
  arrowHeadEnd,
  onArrowTypeChange,
  onRoutingModeChange,
  onDashedChange,
  onArrowHeadStartChange,
  onArrowHeadEndChange,
  disabled = false,
}) => {
  const toggleClass = (active: boolean) =>
    `h-8 rounded-md border px-2 text-xs transition-colors ${
      active
        ? "border-sky-500 bg-sky-50 text-sky-700"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
    } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`;

  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Arrow
      </span>

      <select
        value={arrowType}
        onChange={(event) => onArrowTypeChange(event.target.value as ArrowType)}
        disabled={disabled}
        className={controlClass(disabled)}
        title="Arrow type"
      >
        <option value="arrow">Single</option>
        <option value="arrow-bidirectional">Bi</option>
      </select>

      <select
        value={routingMode}
        onChange={(event) =>
          onRoutingModeChange(event.target.value as ArrowRoutingMode)
        }
        disabled={disabled}
        className={controlClass(disabled)}
        title="Routing mode"
      >
        <option value="orthogonal">Orthogonal</option>
        <option value="straight">Straight</option>
      </select>

      <button
        type="button"
        onClick={() => !disabled && onArrowHeadStartChange(!arrowHeadStart)}
        disabled={disabled}
        className={toggleClass(arrowHeadStart)}
        title="Toggle start arrowhead"
      >
        Start
      </button>

      <button
        type="button"
        onClick={() => !disabled && onArrowHeadEndChange(!arrowHeadEnd)}
        disabled={disabled}
        className={toggleClass(arrowHeadEnd)}
        title="Toggle end arrowhead"
      >
        End
      </button>

      <button
        type="button"
        onClick={() => !disabled && onDashedChange(!dashed)}
        disabled={disabled}
        className={toggleClass(dashed)}
        title="Toggle dashed arrow"
      >
        Dashed
      </button>
    </div>
  );
};
