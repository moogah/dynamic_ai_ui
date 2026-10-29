// The page spec: this project's own format (design D11), a flat id-keyed component map and a
// separate data model the components bind to by path. Nothing here knows how a page is drawn.

export type ComponentType =
  | "heading"
  | "text"
  | "image"
  | "card"
  | "list"
  | "row"
  | "column"
  | "table"
  | "chart"
  | "tile"
  | "form"
  | "button";

// A prop that binds to the page spec's data: "/<name>/<path...>" names an entry of `data` and
// a path into it, resolved by src/page/bindings.ts when the page is drawn.
export interface Binding {
  $data: string;
}

export type PropValue = unknown;

export interface Component {
  id: string;
  type: ComponentType;
  // The id of the container this component sits in. Every component has one; the skeleton's
  // two areas sit in the page itself, marked by the root parent below.
  parent: string;
  props: Record<string, PropValue>;
}

export interface PageSpec {
  // Insertion order is sibling order: a component put again keeps its place.
  components: Record<string, Component>;
  data: Record<string, unknown>;
}

// The parent of the skeleton's areas: the page itself.
export const ROOT = "page";

// The skeleton (glossary): a header area and an empty content area. Its ids are fixed so the
// assistant can put components in them, and the page-spec tools keep them in place.
export const SKELETON_IDS = ["header", "content"] as const;

export function skeleton(): PageSpec {
  return {
    components: {
      header: { id: "header", type: "row", parent: ROOT, props: {} },
      content: { id: "content", type: "column", parent: ROOT, props: {} },
    },
    data: {},
  };
}

export function isBinding(value: unknown): value is Binding {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as Binding).$data === "string"
  );
}

// The children of `parent`, in sibling order.
export function childrenOf(spec: PageSpec, parent: string): Component[] {
  return Object.values(spec.components).filter((c) => c.parent === parent);
}
