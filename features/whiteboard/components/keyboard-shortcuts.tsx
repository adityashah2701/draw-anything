interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      category: "Tools",
      items: [
        { key: "V", description: "Select tool" },
        { key: "P", description: "Pen tool" },
        { key: "R", description: "Rectangle tool" },
        { key: "C", description: "Circle tool" },
        { key: "L", description: "Line tool" },
        { key: "A", description: "Arrow tool" },
        { key: "T", description: "Text tool" },
        { key: "E", description: "Eraser tool" },
        { key: "H", description: "Hand/Pan tool" },
      ],
    },
    {
      category: "Actions",
      items: [
        { key: "Ctrl+Z", description: "Undo" },
        { key: "Ctrl+Y", description: "Redo" },
        { key: "Ctrl+S", description: "Save whiteboard" },
        { key: "Ctrl+A", description: "Select all" },
        { key: "Delete", description: "Delete selected" },
        { key: "Backspace", description: "Delete selected" },
        { key: "Escape", description: "Deselect all" },
      ],
    },
    {
      category: "View",
      items: [
        { key: "Ctrl+Plus", description: "Zoom in" },
        { key: "Ctrl+-", description: "Zoom out" },
        { key: "Ctrl+0", description: "Reset zoom" },
        { key: "G", description: "Toggle grid" },
        { key: "Space", description: "Temporarily switch to hand tool" },
      ],
    },
    {
      category: "Selection",
      items: [
        { key: "Click", description: "Select element" },
        { key: "Ctrl+Click", description: "Multi-select elements" },
        { key: "Drag", description: "Move selected elements" },
        { key: "Drag handles", description: "Resize selected elements" },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60  flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {shortcuts.map((category) => (
            <div key={category.category}>
              <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
                {category.category}
              </h3>
              <div className="space-y-2">
                {category.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center py-1"
                  >
                    <span className="text-gray-600">
                      {shortcut.description}
                    </span>
                    <div className="flex space-x-1">
                      {shortcut.key.split("+").map((key, keyIndex) => (
                        <span key={keyIndex} className="inline-flex">
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.key.split("+").length - 1 && (
                            <span className="mx-1 text-gray-400">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            Press{" "}
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
              ?
            </kbd>{" "}
            or
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded ml-1">
              Ctrl+/
            </kbd>{" "}
            to toggle this panel
          </p>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
    </div>
  );
};

export default KeyboardShortcuts;
