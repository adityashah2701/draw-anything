import { Point } from "@/features/whiteboard/types/whiteboard.types";

interface CachedPath {
  points: Point[];
  timestamp: number;
}

// Max cache entries to prevent memory bloat
const MAX_CACHE_SIZE = 500;

export class PathCache {
  private cache = new Map<string, CachedPath>();

  private buildKey(
    arrowId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    signature = "",
  ): string {
    return `${arrowId}:${Math.round(startX)},${Math.round(startY)}:${Math.round(endX)},${Math.round(endY)}:${signature}`;
  }

  get(
    arrowId: string,
    start: Point,
    end: Point,
    signature = "",
  ): Point[] | null {
    const key = this.buildKey(
      arrowId,
      start.x,
      start.y,
      end.x,
      end.y,
      signature,
    );
    const cached = this.cache.get(key);
    if (!cached) return null;
    return cached.points;
  }

  set(
    arrowId: string,
    start: Point,
    end: Point,
    points: Point[],
    signature = "",
  ): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldest = [...this.cache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    const key = this.buildKey(
      arrowId,
      start.x,
      start.y,
      end.x,
      end.y,
      signature,
    );
    this.cache.set(key, { points, timestamp: Date.now() });
  }

  invalidate(arrowId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${arrowId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const globalPathCache = new PathCache();
