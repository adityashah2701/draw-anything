import { shapeRegistry } from "@/core/shapes/shape-registry";
import { rectangleDefinition } from "@/core/shapes/rectangle/definition";
import { circleDefinition } from "@/core/shapes/circle/definition";
import { diamondDefinition } from "@/core/shapes/diamond/definition";
import { pillDefinition } from "@/core/shapes/pill/definition";
import { ellipseDefinition } from "@/core/shapes/ellipse/definition";
import { iconDefinition } from "@/core/shapes/icon/definition";
import { triangleDefinition } from "@/core/shapes/triangle/definition";
import { arrowDefinition } from "@/core/shapes/arrow/definition";
import { bidirectionalArrowDefinition } from "@/core/shapes/bidirectional-arrow/definition";
import { lineDefinition } from "@/core/shapes/line/definition";
import { freehandDefinition } from "@/core/shapes/freehand/definition";
import { textDefinition } from "@/core/shapes/text/definition";
import { semanticNodeDefinition } from "@/core/shapes/semantic-node/definition";

let initialized = false;

export const initializeShapeRegistry = () => {
  if (initialized) return shapeRegistry;
  shapeRegistry.register(freehandDefinition);
  shapeRegistry.register(rectangleDefinition);
  shapeRegistry.register(circleDefinition);
  shapeRegistry.register(diamondDefinition);
  shapeRegistry.register(pillDefinition);
  shapeRegistry.register(ellipseDefinition);
  shapeRegistry.register(iconDefinition);
  shapeRegistry.register(triangleDefinition);
  shapeRegistry.register(semanticNodeDefinition);
  shapeRegistry.register(lineDefinition);
  shapeRegistry.register(textDefinition);
  shapeRegistry.register(arrowDefinition);
  shapeRegistry.register(bidirectionalArrowDefinition);
  initialized = true;
  return shapeRegistry;
};
