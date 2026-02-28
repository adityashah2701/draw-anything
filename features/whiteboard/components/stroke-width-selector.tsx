interface StrokeWidthSelectorProps {
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  disabled?: boolean; // Add disabled prop
}

const StrokeWidthSelector: React.FC<StrokeWidthSelectorProps> = ({
  strokeWidth,
  onStrokeWidthChange,
  disabled = false // Default to false
}) => {
  const strokeWidths = [1, 2, 4, 8, 12, 16];

  return (
    <div className="flex items-center space-x-2">
      <span className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-600'}`}>
        Stroke:
      </span>
      <div className="flex space-x-1">
        {strokeWidths.map((width) => {
          const isSelected = strokeWidth === width;
          
          return (
            <button
              key={width}
              onClick={disabled ? undefined : () => onStrokeWidthChange(width)}
              disabled={disabled}
              className={`p-2 rounded border transition-all ${
                isSelected && !disabled
                  ? 'border-blue-500 bg-blue-50'
                  : isSelected && disabled
                  ? 'border-gray-300 bg-gray-100'
                  : disabled
                  ? 'border-gray-200 hover:border-gray-200'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              title={
                disabled 
                  ? `Stroke width ${width}px (Read-only mode)` 
                  : `Set stroke width to ${width}px`
              }
            >
              <div
                className={`rounded-full ${
                  disabled ? 'bg-gray-400' : 'bg-gray-800'
                }`}
                style={{ 
                  width: Math.max(width, 2), 
                  height: Math.max(width, 2) 
                }}
              />
            </button>
          );
        })}
      </div>
      
      {/* Custom stroke width input for more precision */}
      <div className="flex items-center space-x-1 ml-2 pl-2 border-l border-gray-200">
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
          className={`w-12 px-1 py-1 text-xs text-center border rounded ${
            disabled 
              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'border-gray-300 bg-white text-gray-900'
          }`}
          title={disabled ? "Read-only mode" : "Custom stroke width (1-50px)"}
        />
        <span className={`text-xs ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
          px
        </span>
      </div>
    </div>
  );
};

export default StrokeWidthSelector;