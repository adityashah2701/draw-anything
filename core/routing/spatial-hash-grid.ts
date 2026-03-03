/**
 * spatial-hash-grid.ts
 *
 * A spatial hash grid for O(1) average-case lookup of items by 2D position.
 * Replaces O(n²) linear scans in obstacle detection and segment conflict queries.
 *
 * Cell size should be chosen to roughly match the query radius (e.g., 64px for
 * 50px obstacle padding queries).
 */

export class SpatialHashGrid<T> {
  private cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {}

  private cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private cellCoords(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  /**
   * Insert an item at a given world-space position.
   */
  insert(x: number, y: number, item: T): void {
    const [cx, cy] = this.cellCoords(x, y);
    const key = this.cellKey(cx, cy);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(item);
  }

  /**
   * Insert an item covering an axis-aligned bounding box.
   * Inserts into all cells that the AABB overlaps.
   */
  insertAabb(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    item: T,
  ): void {
    const [cx0, cy0] = this.cellCoords(minX, minY);
    const [cx1, cy1] = this.cellCoords(maxX, maxY);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = this.cellKey(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        if (!cell.includes(item)) {
          cell.push(item);
        }
      }
    }
  }

  /**
   * Query all items within `radius` world units of (x, y).
   * Returns a deduplicated array.
   */
  query(x: number, y: number, radius: number): T[] {
    const [cx0, cy0] = this.cellCoords(x - radius, y - radius);
    const [cx1, cy1] = this.cellCoords(x + radius, y + radius);
    const seen = new Set<T>();
    const result: T[] = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = this.cells.get(this.cellKey(cx, cy));
        if (!cell) continue;
        for (const item of cell) {
          if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
          }
        }
      }
    }
    return result;
  }

  /**
   * Query all items whose AABB overlaps the given AABB query box.
   */
  queryAabb(minX: number, minY: number, maxX: number, maxY: number): T[] {
    const [cx0, cy0] = this.cellCoords(minX, minY);
    const [cx1, cy1] = this.cellCoords(maxX, maxY);
    const seen = new Set<T>();
    const result: T[] = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = this.cells.get(this.cellKey(cx, cy));
        if (!cell) continue;
        for (const item of cell) {
          if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
          }
        }
      }
    }
    return result;
  }

  /**
   * Remove all items from the grid.
   */
  clear(): void {
    this.cells.clear();
  }

  /**
   * Total number of populated cells.
   */
  get cellCount(): number {
    return this.cells.size;
  }
}
