/**
 * In-memory stand-in for `@/liveblocks.config` (esbuild swaps it in; no app code changes).
 *
 * Real Liveblocks structures (LiveList/LiveObject) work detached from a room, so the editor's own
 * mutation code runs unchanged. What is modelled: storage, useStorage, useMutation, history with
 * pause/resume (a paused gesture is one undo step; every other mutation is one step; a mutation that
 * changes nothing is not a step). What is NOT: realtime sync, presence, other users, offline queues,
 * conflict resolution, storage limits, auth.
 */
import { LiveList, LiveObject } from "@liveblocks/client";
import { createElement, Fragment, useCallback, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { DrawingElementJson } from "../../../../liveblocks.config";

export type { DrawingElementJson };

type Root = LiveObject<{ elements: LiveList<LiveObject<DrawingElementJson>> }>;

const makeRoot = (elements: DrawingElementJson[]): Root =>
  new LiveObject({ elements: new LiveList(elements.map((e) => new LiveObject(e))) });

class FakeRoom {
  root: Root = makeRoot([]);
  version = 0;
  private listeners = new Set<() => void>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private pausedFrom: string | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private bump() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }
  /** The board as JSON; stable text to compare and to restore from. */
  snapshot = () => JSON.stringify(this.root.toImmutable().elements);
  private restore(json: string) {
    this.root.set("elements", new LiveList((JSON.parse(json) as DrawingElementJson[]).map((e) => new LiveObject(e))));
  }

  reset(elements: DrawingElementJson[]) {
    this.root = makeRoot(elements);
    this.undoStack = [];
    this.redoStack = [];
    this.pausedFrom = null;
    this.bump();
  }

  run<T>(mutate: () => T): T {
    const paused = this.pausedFrom !== null;
    const before = paused ? null : this.snapshot();
    const result = mutate();
    if (before !== null && this.snapshot() !== before) {
      this.undoStack.push(before);
      this.redoStack = [];
    }
    this.bump();
    return result;
  }

  pause = () => {
    if (this.pausedFrom === null) this.pausedFrom = this.snapshot();
  };
  resume = () => {
    if (this.pausedFrom === null) return;
    if (this.snapshot() !== this.pausedFrom) {
      this.undoStack.push(this.pausedFrom);
      this.redoStack = [];
    }
    this.pausedFrom = null;
    this.bump();
  };
  undo = () => {
    this.resume();
    const previous = this.undoStack.pop();
    if (previous === undefined) return;
    this.redoStack.push(this.snapshot());
    this.restore(previous);
    this.bump();
  };
  redo = () => {
    this.resume();
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.bump();
  };
  canUndo = () => this.undoStack.length > 0;
  canRedo = () => this.redoStack.length > 0;
  undoDepth = () => this.undoStack.length;
  redoDepth = () => this.redoStack.length;
}

export const room = new FakeRoom();

/** Same object every render: the controller memoises on it. */
const history = {
  undo: room.undo,
  redo: room.redo,
  pause: room.pause,
  resume: room.resume,
  canUndo: room.canUndo,
  canRedo: room.canRedo,
};

const shallowEqual = (a: unknown, b: unknown) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

export function useStorage<T>(selector: (root: { elements: readonly DrawingElementJson[] }) => T): T {
  const cache = useRef<{ version: number; value: T } | null>(null);
  const getSnapshot = () => {
    if (cache.current?.version === room.version) return cache.current.value;
    const next = selector(room.root.toImmutable() as { elements: readonly DrawingElementJson[] });
    const value = cache.current && shallowEqual(cache.current.value, next) ? cache.current.value : next;
    cache.current = { version: room.version, value };
    return value;
  };
  return useSyncExternalStore(room.subscribe, getSnapshot, getSnapshot);
}

interface MutationContext {
  storage: Root;
  self: null;
  setMyPresence: () => void;
}
const noop = () => {};

export function useMutation<A extends unknown[], R>(fn: (ctx: MutationContext, ...args: A) => R, deps: readonly unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((...args: A) => room.run(() => fn({ storage: room.root, self: null, setMyPresence: noop }, ...args)), deps);
}

export const useHistory = () => history;
export const useUndo = () => room.undo;
export const useRedo = () => room.redo;
export const useCanUndo = () => useSyncExternalStore(room.subscribe, room.canUndo, room.canUndo);
export const useCanRedo = () => useSyncExternalStore(room.subscribe, room.canRedo, room.canRedo);

const NO_OTHERS: never[] = [];
const PRESENCE = { cursor: null, selection: [] as string[], pencilDraft: null };
const MY_PRESENCE = [PRESENCE, noop] as const;
export const useOthers = (selector?: (others: never[]) => unknown) => (selector ? selector(NO_OTHERS) : NO_OTHERS);
export const useOthersMapped = () => NO_OTHERS;
export const useOthersConnectionIds = () => NO_OTHERS;
export const useOther = () => null;
export const useUpdateMyPresence = () => noop;
export const useMyPresence = () => MY_PRESENCE;
export const useSelf = () => null;
export const useRoom = () => room;
export const useBroadcastEvent = () => noop;
export const useEventListener = () => undefined;
export const useErrorListener = () => undefined;

export const RoomProvider = ({ children }: { children: ReactNode }) => createElement(Fragment, null, children);
