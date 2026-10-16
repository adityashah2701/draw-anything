import { useCallback, useSyncExternalStore } from "react";
import { backend } from "./convex-backend";

/** `ref` is the string the fake `api` proxy produces ("whiteboard:getById"). */
export function useQuery(ref: string, args?: unknown) {
  const getSnapshot = () => (args === "skip" ? undefined : backend.query(ref));
  return useSyncExternalStore(backend.subscribe, getSnapshot, getSnapshot);
}

export function useMutation(ref: string) {
  return useCallback((args?: Record<string, unknown>) => backend.mutate(ref, args), [ref]);
}

export const useAction = useMutation;
