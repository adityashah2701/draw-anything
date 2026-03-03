/**
 * useRafThrottle.ts
 *
 * A hook that throttles a callback to once per animation frame using
 * requestAnimationFrame. Ideal for drag handlers and move events where
 * re-routing or re-rendering should not fire more than once per frame.
 *
 * Usage:
 *   const throttledMove = useRafThrottle((point: Point) => {
 *     // called at most once per frame
 *     handleDragUpdate(point);
 *   });
 */

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a throttled version of `fn` that fires at most once per animation
 * frame. Additional calls within the same frame are coalesced — only the last
 * arguments are forwarded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  const rafRef = useRef<number | null>(null);
  const latestArgsRef = useRef<Parameters<T> | null>(null);
  const fnRef = useRef(fn);

  // Keep fnRef up to date so old closures don't run stale data
  useEffect(() => {
    fnRef.current = fn;
  });

  return useCallback((...args: Parameters<T>) => {
    latestArgsRef.current = args;

    if (rafRef.current !== null) {
      // Already scheduled — just update the args
      return;
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (latestArgsRef.current !== null) {
        fnRef.current(...latestArgsRef.current);
        latestArgsRef.current = null;
      }
    });
  }, []) as T;
}
