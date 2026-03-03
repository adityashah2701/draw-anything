interface StrokeWidthSelectorProps {
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  disabled?: boolean;
}

const StrokeWidthSelector: React.FC<StrokeWidthSelectorProps> = ({
  strokeWidth,
  onStrokeWidthChange,
  disabled = false,
}) => {
  const strokeWidths = [1, 2, 3, 4, 6, 8];

  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Stroke
      </span>
      <div className="inline-flex items-center gap-1">
        {strokeWidths.map((width) => {
          const isSelected = strokeWidth === width;

          return (
            <button
              key={width}
              onClick={disabled ? undefined : () => onStrokeWidthChange(width)}
              disabled={disabled}
              className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${
                isSelected
                  ? "border-sky-500 bg-sky-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              title={`Set stroke width to ${width}px`}
            >
              <div
                className={`rounded-full ${disabled ? "bg-slate-400" : "bg-slate-700"}`}
                style={{
                  width: Math.max(2, width),
                  height: Math.max(2, width),
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-slate-200" />

      <div className="inline-flex items-center gap-1">
        <input
          type="number"
          value={strokeWidth}
          onChange={(e) => {
            if (!disabled) {
              const value = Math.max(1, Math.min(50, Number(e.target.value)));
              onStrokeWidthChange(value);
            }
          }}
          min="1"
          max="50"
          disabled={disabled}
          className={`h-8 w-12 rounded-md border px-1 text-center text-xs ${
            disabled
              ? "border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-300 bg-white text-slate-900"
          }`}
          title="Custom stroke width (1-50px)"
        />
        <span className="text-xs text-slate-500">
          px
        </span>
      </div>
    </div>
  );
};

export default StrokeWidthSelector;
