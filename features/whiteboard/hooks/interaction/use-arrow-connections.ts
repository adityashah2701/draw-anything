import { useMemo, useRef } from "react";
import { createRouteEngineState } from "@/core/routing/route-engine";
import { createConnectorRouter, type ConnectorRouterOptions } from "@/core/arrow/connector-router";

export type UseArrowConnectionsOptions = Omit<ConnectorRouterOptions, "state">;

/**
 * The editor's connector router: `createConnectorRouter` memoised on the board,
 * with one route-engine state kept for the life of the page so caches survive re-renders.
 */
export const useArrowConnections = ({ elements, anchorIndex, getElementBounds }: UseArrowConnectionsOptions) => {
  const stateRef = useRef(createRouteEngineState());
  const router = useMemo(
    () => createConnectorRouter({ elements, anchorIndex, getElementBounds, state: stateRef.current }),
    [elements, anchorIndex, getElementBounds],
  );
  return router;
};

