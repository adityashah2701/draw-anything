"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const REDUCED = "(prefers-reduced-motion: reduce)";

const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** True when the user asked for less motion. Server render assumes motion is fine. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * Reports once when the element has entered the viewport, then stops observing. One-shot on purpose:
 * re-animating on every scroll-by is an interface fighting its reader. Without IntersectionObserver
 * the content is simply shown.
 */
export function useInView<T extends Element>({
  threshold = 0.15,
  rootMargin = "0px 0px -8% 0px",
}: { threshold?: number; rootMargin?: string } = {}) {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  const ref = useCallback((element: T | null) => setNode(element), []);

  useEffect(() => {
    if (!node || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView, threshold, rootMargin]);

  return [ref, inView] as const;
}

type RevealProps = {
  as?: ElementType;
  /** Milliseconds to wait after entering view; siblings step by 60. */
  delay?: number;
  className?: string;
  children: ReactNode;
};

/** Fades and lifts its content 8px the first time it scrolls into view. */
export function Reveal({ as: Tag = "div", delay = 0, className, children }: RevealProps) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref}
      data-in={inView}
      className={cn("reveal", className)}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
