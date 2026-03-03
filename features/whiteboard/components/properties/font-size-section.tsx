import React from "react";

interface FontSizeSectionProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  disabled: boolean;
}

export const FontSizeSection: React.FC<FontSizeSectionProps> = ({
  fontSize,
  onFontSizeChange,
  disabled,
}) => {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Size:
      </span>
      <select
        id="font-size-selector"
        name="font-size"
        value={fontSize}
        onChange={(e) => onFontSizeChange(Number(e.target.value))}
        disabled={disabled}
        className={`h-8 rounded-md border px-2 text-xs ${
          disabled
            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
            : "border-slate-300 bg-white text-slate-900 hover:border-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
        }`}
        title="Select font size"
      >
        <option value={12}>12px</option>
        <option value={16}>16px</option>
        <option value={20}>20px</option>
        <option value={24}>24px</option>
        <option value={32}>32px</option>
        <option value={48}>48px</option>
        <option value={60}>60px</option>
        <option value={72}>72px</option>
        <option value={84}>84px</option>
        <option value={96}>96px</option>
        <option value={108}>108px</option>
        <option value={120}>120px</option>
      </select>
    </div>
  );
};
