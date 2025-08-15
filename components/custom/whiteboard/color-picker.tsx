import React, { useRef, useEffect, useState } from 'react';

interface ColorPickerProps {
  currentColor: string;
  showColorPicker: boolean;
  onColorChange: (color: string) => void;
  onTogglePicker: () => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  currentColor,
  showColorPicker,
  onColorChange,
  onTogglePicker,
  disabled = false,
  label = "Color",
  size = 'md',
  id = 'color-picker'
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const predefinedColors = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#800080',
    '#ffc0cb', '#a52a2a', '#808080', '#000080', '#008000',
    '#ff69b4', '#32cd32', '#87ceeb', '#dda0dd', '#f0e68c',
    '#ff6347', '#40e0d0', '#ee82ee', '#90ee90', '#ffd700'
  ];

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8', 
    lg: 'w-10 h-10'
  };

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showColorPicker && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [showColorPicker]);

  // Create the dropdown content
  const renderDropdown = () => {
    if (!showColorPicker || disabled) return null;

    const dropdownStyle: React.CSSProperties = {
      position: 'fixed',
      top: dropdownPosition.top,
      left: dropdownPosition.left,
      zIndex: 999999, // Very high z-index
      backgroundColor: 'white',
      border: '1px solid #d1d5db',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      minWidth: '280px',
      maxWidth: '300px'
    };

    return (
      <div style={dropdownStyle} onClick={(e) => {
        // Prevent clicks inside the dropdown from bubbling up to the backdrop
        e.stopPropagation();
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', margin: 0 }}>Choose Color</h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePicker();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Current Color Display */}
        <div style={{ 
          marginBottom: '16px', 
          padding: '12px', 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div 
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              backgroundColor: currentColor,
              flexShrink: 0
            }}
          />
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Current</div>
            <div style={{ fontSize: '14px', fontFamily: 'monospace', color: '#374151' }}>
              {currentColor.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Predefined Colors Grid */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginBottom: '8px' }}>
            Quick Colors
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(5, 1fr)', 
            gap: '8px' 
          }}>
            {predefinedColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onColorChange(color);
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  border: currentColor === color ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                  backgroundColor: color,
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: currentColor === color ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : undefined
                }}
                title={color}
              >
                {currentColor === color && (
                  <span style={{ 
                    color: 'white', 
                    fontSize: '16px', 
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
                  }}>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Color Picker */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginBottom: '8px' }}>
            Custom Color
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="color"
              value={currentColor}
              onChange={(e) => {
                e.preventDefault();
                onColorChange(e.target.value);
              }}
              onClick={(e) => {
                // Prevent the color input click from bubbling up
                e.stopPropagation();
              }}
              style={{
                width: '48px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                cursor: 'pointer',
                flexShrink: 0
              }}
            />
            <input
              type="text"
              value={currentColor.toUpperCase()}
              onChange={(e) => {
                const value = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                  onColorChange(value);
                }
              }}
              onClick={(e) => {
                // Prevent the text input click from bubbling up
                e.stopPropagation();
              }}
              onFocus={(e) => {
                // Prevent focus events from bubbling up
                e.stopPropagation();
              }}
              style={{
                flex: 1,
                padding: '6px 12px',
                fontSize: '14px',
                fontFamily: 'monospace',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none'
              }}
              placeholder="#000000"
              maxLength={7}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'flex-end', 
          gap: '8px',
          marginTop: '16px', 
          paddingTop: '12px', 
          borderTop: '1px solid #f3f4f6' 
        }}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onColorChange('#000000');
            }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              color: '#6b7280',
              background: 'none',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onTogglePicker();
            }}
            style={{
              padding: '6px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '12px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-center space-x-2">
      {label && (
        <span className={`text-xs ${disabled ? 'text-gray-400' : 'text-gray-600'} hidden sm:inline font-medium`}>
          {label}:
        </span>
      )}
      
      <div className="relative" data-color-picker>
        {/* Color Button */}
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) {
              onTogglePicker();
            }
          }}
          disabled={disabled}
          className={`${sizeClasses[size]} rounded-lg border-2 shadow-sm transition-all duration-200 ${
            disabled 
              ? 'border-gray-200 cursor-not-allowed opacity-60' 
              : 'border-gray-300 cursor-pointer hover:border-gray-400 hover:shadow-md active:scale-95'
          } ${showColorPicker ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}
          style={{ backgroundColor: currentColor }}
          title={disabled ? "Read-only mode" : `Current color: ${currentColor}`}
          aria-label={`${label} color picker`}
        >
          <div className="w-full h-full rounded-md border border-white/20"></div>
        </button>
        
        {/* Backdrop */}
        {showColorPicker && !disabled && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999998,
              backgroundColor: 'transparent'
            }}
            onClick={(e) => {
              // Only close if the click is directly on the backdrop, not on child elements
              if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
                onTogglePicker();
              }
            }}
          />
        )}
        
        {/* Render dropdown using portal-like approach */}
        {typeof document !== 'undefined' && (
          <>
            {renderDropdown()}
          </>
        )}
      </div>
    </div>
  );
};

export default ColorPicker;