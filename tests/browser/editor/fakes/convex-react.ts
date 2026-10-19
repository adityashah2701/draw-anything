import { useCallback, useSyncExternalStore } from "react";
import { backend } from "./convex-backend";

/** `ref` is the string the fake `api` proxy produces ("whiteboard:getById"). */
export function useQuery(ref: string, args?: unknown) {
  const getSnapshot = () => (args === "skip" ? undefined : backend.query(ref, args as Record<string, unknown> | undefined));
  return useSyncExternalStore(backend.subscribe, getSnapshot, getSnapshot);
}

export function useMutation(ref: string) {
  return useCallback((args?: Record<string, unknown>) => backend.mutate(ref, args), [ref]);
}

export const useAction = useMutation;

/** The client the editor uses to read another whiteboard: a query by ref and args. */
export const useConvex = () => ({
  query: async (ref: string, args?: Record<string, unknown>) => backend.query(ref, args),
  mutation: async (ref: string, args?: Record<string, unknown>) => backend.mutate(ref, args),
});
