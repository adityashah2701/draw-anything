import { shapeRegistry } from "@/core/shapes/shape-registry";
import { rectangleDefinition } from "@/core/shapes/rectangle/definition";
import { circleDefinition } from "@/core/shapes/circle/definition";
import { diamondDefinition } from "@/core/shapes/diamond/definition";
import { arrowDefinition } from "@/core/shapes/arrow/definition";
import { bidirectionalArrowDefinition } from "@/core/shapes/bidirectional-arrow/definition";
import { lineDefinition } from "@/core/shapes/line/definition";
import { freehandDefinition } from "@/core/shapes/freehand/definition";
import { textDefinition } from "@/core/shapes/text/definition";

let initialized = false;

export const initializeShapeRegistry = () => {
  if (initialized) return shapeRegistry;
  shapeRegistry.register(freehandDefinition);
  shapeRegistry.register(rectangleDefinition);
  shapeRegistry.register(circleDefinition);
  shapeRegistry.register(diamondDefinition);
  shapeRegistry.register(lineDefinition);
  shapeRegistry.register(textDefinition);
  shapeRegistry.register(arrowDefinition);
  shapeRegistry.register(bidirectionalArrowDefinition);
  initialized = true;
  return shapeRegistry;
};

