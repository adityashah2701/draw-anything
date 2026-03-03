import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  BaseShapeDefinition,
  ResizeHandle,
} from "@/core/shapes/base/base-shape-definition";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

type ShapeDefinitionInput<T extends DrawingElement> = Omit<
  BaseShapeDefinition<T>,
  "onMove" | "onResize" | "validate" | "capabilities"
> & {
  capabilities?: ShapeCapability<T>[];
  onMove?: BaseShapeDefinition<T>["onMove"];
  onResize?: BaseShapeDefinition<T>["onResize"];
  validate?: BaseShapeDefinition<T>["validate"];
};

export const createShapeDefinition = <T extends DrawingElement>(
  input: ShapeDefinitionInput<T>,
): BaseShapeDefinition<T> => {
  const capabilities = input.capabilities ?? [];

  return {
    ...input,
    capabilities: capabilities.map((capability) => capability.id),
    onMove: (shape, delta) => {
      const withCapabilities = capabilities.reduce(
        (acc, capability) =>
          capability.onMove ? capability.onMove(acc, delta) : acc,
        shape,
      );
      return input.onMove ? input.onMove(withCapabilities, delta) : withCapabilities;
    },
    onResize: (shape, handle, point, originalBounds) => {
      const normalizedHandle = handle as ResizeHandle;
      const withCapabilities = capabilities.reduce(
        (acc, capability) =>
          capability.onResize
            ? capability.onResize(acc, normalizedHandle, point, originalBounds)
            : acc,
        shape,
      );
      return input.onResize
        ? input.onResize(withCapabilities, normalizedHandle, point, originalBounds)
        : withCapabilities;
    },
    validate: (shape) => {
      const allCapabilitiesValid = capabilities.every((capability) =>
        capability.validate ? capability.validate(shape) : true,
      );
      if (!allCapabilitiesValid) {
        return false;
      }
      return input.validate ? input.validate(shape) : true;
    },
  };
};

