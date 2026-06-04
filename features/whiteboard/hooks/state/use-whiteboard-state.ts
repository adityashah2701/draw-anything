import { useCallback, useState } from "react";
import { CanvasState, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export const useWhiteboardState = () => {
  // Canvas elements and history
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [history, setHistory] = useState<CanvasState[]>([
    { elements: [], currentElementId: null },
  ]);
  const [historyStep, setHistoryStep] = useState(0);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);

  // Save state to history
  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyStep + 1);
    const newState: CanvasState = {
      elements: [...elements],
      currentElementId: null,
    };
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [elements, history, historyStep]);

  // Undo/Redo operations
  const handleUndo = useCallback(() => {
    if (historyStep > 0) {
      const previousState = history[historyStep - 1];
      setHistoryStep(historyStep - 1);
      setElements(previousState.elements);
    }
  }, [historyStep, history]);

  const handleRedo = useCallback(() => {
    if (historyStep < history.length - 1) {
      const nextState = history[historyStep + 1];
      setHistoryStep(historyStep + 1);
      setElements(nextState.elements);
    }
  }, [historyStep, history]);

  // Clear canvas
  const handleClear = useCallback(() => {
    setElements([]);
    saveToHistory();
  }, [saveToHistory]);

  // Load elements from external source
  const loadElements = useCallback((newElements: DrawingElement[]) => {
    setElements(newElements);
    setHistory([{ elements: newElements, currentElementId: null }]);
    setHistoryStep(0);
  }, []);

  // Add element to canvas
  const addElement = useCallback((element: DrawingElement) => {
    setElements(prev => [...prev, element]);
    saveToHistory();
  }, [saveToHistory]);

  // Update current element while drawing
  const updateCurrentElement = useCallback((element: DrawingElement) => {
    setCurrentElement(element);
  }, []);

  // Complete current element and add to elements
  const completeCurrentElement = useCallback(() => {
    if (currentElement) {
      setElements(prev => [...prev, currentElement]);
      setCurrentElement(null);
      saveToHistory();
    }
  }, [currentElement, saveToHistory]);

  // Select/deselect elements
  const toggleElementSelection = useCallback((elementId: string, multiSelect = false) => {
    setSelectedElements(prev => {
      if (multiSelect) {
        return prev.includes(elementId)
          ? prev.filter(id => id !== elementId)
          : [...prev, elementId];
      } else {
        return prev.includes(elementId) ? [] : [elementId];
      }
    });
  }, []);

  const selectElements = useCallback((elementIds: string[]) => {
    setSelectedElements(elementIds);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedElements([]);
  }, []);

  const selectAllElements = useCallback(() => {
    setSelectedElements(elements.map(el => el.id));
  }, [elements]);

  return {
    // State
    elements,
    setElements,
    history,
    historyStep,
    currentElement,
    selectedElements,
    
    // Actions
    saveToHistory,
    handleUndo,
    handleRedo,
    handleClear,
    loadElements,
    addElement,
    updateCurrentElement,
    completeCurrentElement,
    toggleElementSelection,
    selectElements,
    clearSelection,
    selectAllElements,
    
    // Computed
    canUndo: historyStep > 0,
    canRedo: historyStep < history.length - 1,
    hasSelection: selectedElements.length > 0,
  };
};