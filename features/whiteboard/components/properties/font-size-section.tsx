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
    <div className="flex items-center space-x-2 flex-shrink-0">
      <span className="text-xs text-gray-600 hidden sm:inline font-medium">
        Size:
      </span>
      <select
        id="font-size-selector"
        name="font-size"
        value={fontSize}
        onChange={(e) => onFontSizeChange(Number(e.target.value))}
        disabled={disabled}
        className={`border rounded-lg px-3 py-1.5 text-xs ${
          disabled
            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
            : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
        <option value={72}>70px</option>
        <option value={84}>84px</option>
        <option value={96}>96px</option>
        <option value={108}>108px</option>
        <option value={120}>120px</option>
      </select>
    </div>
  );
};
