// The page store (seam/page-store): one holder of a page's page spec, made with the page and
// gone with it. It starts as the skeleton, every edit is applied through it, it keeps the copy
// taken when a turn starts, and undo puts that copy back (design D5: one step only). Nothing
// here touches browser storage, so a reload returns the skeleton.
import { skeleton, type PageSpec } from "./spec";

export interface PageStore {
  get(): PageSpec;
  // Replaces the page spec with the one an edit produced. Specs are values: a tool gives a new
  // one and never changes the old, so the copy for undo is the spec itself.
  apply(spec: PageSpec): void;
  // Keeps the page spec as it stands, for undo, as a turn starts.
  beginTurn(): void;
  // Puts back the copy taken at the last turn's start; true when the page changed. A second
  // undo before another turn changes nothing.
  undo(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createPageStore(initial: PageSpec = skeleton()): PageStore {
  let spec = initial;
  let beforeTurn: PageSpec | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    get: () => spec,
    apply(next) {
      if (next === spec) return;
      spec = next;
      notify();
    },
    beginTurn() {
      beforeTurn = spec;
    },
    undo() {
      if (beforeTurn === null) return false;
      const restored = beforeTurn;
      beforeTurn = null;
      if (restored === spec) return false;
      spec = restored;
      notify();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
