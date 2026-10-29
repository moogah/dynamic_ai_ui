// The renderer (seam/renderer): draws the page spec its page store holds and nothing else. One
// drawn element per component, through the registry's entry for its type, with data bindings
// resolved against the page spec's data. Components are keyed by id, so an edit redraws the
// components it changed and React leaves every other drawn element in place.
import { useSyncExternalStore, type ReactNode } from "react";
import { resolveBindings } from "../page/bindings";
import { childrenOf, ROOT, type PageSpec } from "../page/spec";
import type { PageStore } from "../page/store";
import { registry } from "./registry";

export function PageView({ store }: { store: PageStore }) {
  const spec = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <>{drawChildren(spec, ROOT)}</>;
}

function drawChildren(spec: PageSpec, parent: string) {
  return childrenOf(spec, parent).map((component) => {
    const draw = registry[component.type];
    return (
      <Draw key={component.id}>
        {draw({
          id: component.id,
          type: component.type,
          props: resolveBindings(component.props, spec.data),
          marks: { "data-component-id": component.id, "data-component-type": component.type },
          children: drawChildren(spec, component.id),
        })}
      </Draw>
    );
  });
}

// A keyed wrapper with no element of its own, so each component's drawing is one DOM element.
function Draw({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
