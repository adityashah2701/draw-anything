import {
  ArrowRoutePreference,
  ArrowRoutingMode,
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import type { Aabb } from "@/core/collision/aabb";

export interface RoutingObstacle {
  id: string;
  bounds: Aabb;
}

export interface RouteEngineEdge {
  arrowId: string;
  sourceId?: string;
  targetId?: string;
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
  routePreference?: ArrowRoutePreference;
  routingMode?: ArrowRoutingMode;
  existingPoints?: Point[];
  preserveManualBends?: boolean;
}
