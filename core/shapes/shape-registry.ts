import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { BaseShapeDefinition } from "@/core/shapes/base/base-shape-definition";

type ShapeType = DrawingElement["type"];
type AnyShapeDefinition = BaseShapeDefinition<DrawingElement>;

export class ShapeRegistry {
  private registry = new Map<ShapeType, AnyShapeDefinition>();

  register<T extends DrawingElement>(definition: BaseShapeDefinition<T>) {
    if (this.registry.has(definition.type)) {
      throw new Error(`Shape definition already registered: ${definition.type}`);
    }
    this.registry.set(
      definition.type,
      definition as unknown as BaseShapeDefinition<DrawingElement>,
    );
  }

  get<TType extends ShapeType>(
    type: TType,
  ): BaseShapeDefinition<Extract<DrawingElement, { type: TType }>> | undefined {
    return this.registry.get(type) as
      | BaseShapeDefinition<Extract<DrawingElement, { type: TType }>>
      | undefined;
  }

  getUnsafe(type: ShapeType): AnyShapeDefinition | undefined {
    return this.registry.get(type);
  }

  has(type: ShapeType): boolean {
    return this.registry.has(type);
  }

  list(): AnyShapeDefinition[] {
    return Array.from(this.registry.values());
  }
}

export const shapeRegistry = new ShapeRegistry();

