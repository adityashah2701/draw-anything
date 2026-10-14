import { useMemo } from "react";
import { resolveWhiteboardAccess } from "./whiteboard-access";

/**
 * Access is decided by the server (see `convex/lib/accessRules.ts`); this hook
 * only translates "did Convex hand me the whiteboard?" into UI state.
 */
export const useWhiteboardAccess = (whiteboard: object | null | undefined) => {
  const { status, hasEditAccess } = useMemo(
    () => resolveWhiteboardAccess(whiteboard),
    [whiteboard],
  );

  const checkAccess = (action: string): boolean => {
    if (!hasEditAccess) {
      console.warn(`You don't have permission to ${action} this whiteboard.`);
      return false;
    }
    return true;
  };

  const requireAccess = (action: string): boolean => {
    if (!hasEditAccess) {
      throw new Error(`You don't have permission to ${action} this whiteboard.`);
    }
    return true;
  };

  return {
    status,
    hasEditAccess,
    checkAccess,
    requireAccess,
  };
};
