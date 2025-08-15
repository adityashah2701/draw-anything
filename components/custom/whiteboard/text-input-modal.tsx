import { Point } from "@/types/whiteboard.types";

interface TextInputModalProps {
  textPosition: Point | null;
  textInput: string;
  zoom: number;
  panOffset: { x: number; y: number };
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled?: boolean; // Add disabled prop
}

const TextInputModal: React.FC<TextInputModalProps> = ({
  textPosition,
  textInput,
  zoom,
  panOffset,
  onTextChange,
  onSubmit,
  onCancel,
  disabled = false // Default to false
}) => {
  if (!textPosition) return null;

  // Don't show the modal if disabled (read-only mode)
  if (disabled) return null;

  return (
    <div
      className="absolute bg-white border border-gray-300 rounded p-2 shadow-lg z-20"
      style={{
        left: textPosition.x * zoom + panOffset.x,
        top: textPosition.y * zoom + panOffset.y
      }}
    >
      <input
        type="text"
        value={textInput}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmit();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        placeholder={disabled ? "Read-only mode" : "Type text..."}
        className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        autoFocus={!disabled}
        disabled={disabled}
      />
      <div className="flex space-x-2 mt-2">
        <button
          onClick={onSubmit}
          disabled={disabled}
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default TextInputModal;