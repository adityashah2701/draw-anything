import { DrawingElement } from "@/types/whiteboard.types";
import { useCallback, useEffect } from "react";

interface CanvasEngineProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  elements: DrawingElement[];
  currentElement: DrawingElement | null;
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;
  canvasSize: { width: number; height: number };
  selectedElements: string[];
  onElementSelect: (elementId: string) => void;
}

const useCanvasEngine = ({
  canvasRef,
  elements,
  currentElement,
  zoom,
  panOffset,
  showGrid,
  canvasSize,
  selectedElements,
  onElementSelect,
  getElementBounds
}: CanvasEngineProps & { getElementBounds: (element: DrawingElement) => any }) => {
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!showGrid) return;
    
    const gridSize = 20 * zoom;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = panOffset.x % gridSize; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = panOffset.y % gridSize; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [showGrid, zoom, panOffset]);

  const drawElement = useCallback((ctx: CanvasRenderingContext2D, element: DrawingElement, isSelected = false) => {
    // Save context state
    ctx.save();
    
    ctx.strokeStyle = element.color;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (element.fill) {
      ctx.fillStyle = element.fill;
    }

    switch (element.type) {
      case 'freehand':
        if (element.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(
            element.points[0].x * zoom + panOffset.x,
            element.points[0].y * zoom + panOffset.y
          );
          for (let i = 1; i < element.points.length; i++) {
            ctx.lineTo(
              element.points[i].x * zoom + panOffset.x,
              element.points[i].y * zoom + panOffset.y
            );
          }
          ctx.stroke();
        }
        break;
        
      case 'rectangle':
        if (element.points.length === 2) {
          const startX = element.points[0].x * zoom + panOffset.x;
          const startY = element.points[0].y * zoom + panOffset.y;
          const endX = element.points[1].x * zoom + panOffset.x;
          const endY = element.points[1].y * zoom + panOffset.y;
          
          const width = endX - startX;
          const height = endY - startY;
          
          if (element.fill) {
            ctx.fillRect(startX, startY, width, height);
          }
          ctx.strokeRect(startX, startY, width, height);
        }
        break;
        
      case 'circle':
        if (element.points.length === 2) {
          const centerX = element.points[0].x * zoom + panOffset.x;
          const centerY = element.points[0].y * zoom + panOffset.y;
          const endX = element.points[1].x * zoom + panOffset.x;
          const endY = element.points[1].y * zoom + panOffset.y;
          
          const radius = Math.sqrt(Math.pow(endX - centerX, 2) + Math.pow(endY - centerY, 2));
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          if (element.fill) {
            ctx.fill();
          }
          ctx.stroke();
        }
        break;
        
      case 'line':
        if (element.points.length === 2) {
          ctx.beginPath();
          ctx.moveTo(
            element.points[0].x * zoom + panOffset.x,
            element.points[0].y * zoom + panOffset.y
          );
          ctx.lineTo(
            element.points[1].x * zoom + panOffset.x,
            element.points[1].y * zoom + panOffset.y
          );
          ctx.stroke();
        }
        break;

      case 'arrow':
        if (element.points.length === 2) {
          const startX = element.points[0].x * zoom + panOffset.x;
          const startY = element.points[0].y * zoom + panOffset.y;
          const endX = element.points[1].x * zoom + panOffset.x;
          const endY = element.points[1].y * zoom + panOffset.y;
          
          // Draw line
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
          
          // Draw arrowhead
          const angle = Math.atan2(endY - startY, endX - startX);
          const arrowLength = 15;
          const arrowAngle = Math.PI / 6;
          
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - arrowLength * Math.cos(angle - arrowAngle),
            endY - arrowLength * Math.sin(angle - arrowAngle)
          );
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - arrowLength * Math.cos(angle + arrowAngle),
            endY - arrowLength * Math.sin(angle + arrowAngle)
          );
          ctx.stroke();
        }
        break;
        
      case 'text':
        if (element.text && element.fontSize) {
          ctx.font = `${element.fontSize * zoom}px Arial`;
          ctx.fillStyle = element.color;
          ctx.fillText(
            element.text,
            element.points[0].x * zoom + panOffset.x,
            element.points[0].y * zoom + panOffset.y
          );
        }
        break;
    }

    // Draw selection box and resize handles
    if (isSelected) {
      const bounds = getElementBounds(element);
      if (bounds) {
        const { minX, minY, maxX, maxY } = bounds;
        
        // Reset any transformations and line styles
        ctx.restore();
        ctx.save();
        
        // Selection box
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
          minX * zoom + panOffset.x - 5,
          minY * zoom + panOffset.y - 5,
          (maxX - minX) * zoom + 10,
          (maxY - minY) * zoom + 10
        );
        
        // Resize handles
        ctx.setLineDash([]); // Reset line dash
        ctx.fillStyle = '#007bff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        
        const handleSize = 8;
        const handles = [
          { x: minX * zoom + panOffset.x, y: minY * zoom + panOffset.y }, // nw
          { x: ((minX + maxX) / 2) * zoom + panOffset.x, y: minY * zoom + panOffset.y }, // n
          { x: maxX * zoom + panOffset.x, y: minY * zoom + panOffset.y }, // ne
          { x: maxX * zoom + panOffset.x, y: ((minY + maxY) / 2) * zoom + panOffset.y }, // e
          { x: maxX * zoom + panOffset.x, y: maxY * zoom + panOffset.y }, // se
          { x: ((minX + maxX) / 2) * zoom + panOffset.x, y: maxY * zoom + panOffset.y }, // s
          { x: minX * zoom + panOffset.x, y: maxY * zoom + panOffset.y }, // sw
          { x: minX * zoom + panOffset.x, y: ((minY + maxY) / 2) * zoom + panOffset.y }, // w
        ];
        
        handles.forEach(handle => {
          ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
          ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
        });
      }
    }
    
    // Restore context state
    ctx.restore();
  }, [zoom, panOffset, getElementBounds]);

  // Force re-render when selection changes
  const forceRender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid(ctx);
    
    // Draw all elements with selection state
    elements.forEach(element => {
      const isSelected = selectedElements.includes(element.id);
      drawElement(ctx, element, isSelected);
    });
    
    // Draw current element
    if (currentElement) {
      drawElement(ctx, currentElement);
    }
  }, [elements, currentElement, drawGrid, drawElement, selectedElements]);

  // Render canvas
  useEffect(() => {
    forceRender();
  }, [forceRender, canvasSize]);

  // Force re-render when selection changes
  useEffect(() => {
    forceRender();
  }, [selectedElements, forceRender]);
};

export default useCanvasEngine;