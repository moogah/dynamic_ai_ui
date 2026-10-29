// The component catalog (seam/catalog, design D9): the one definition of the component types
// and their props. The page-spec tools accept a component only when it validates here, the
// tool descriptions the model reads are written from here, and the renderer's registry draws
// one entry per type listed here. Props hold values or bindings, never markup: whatever a prop
// says is drawn as text.
import { isBinding, type Component, type ComponentType } from "./spec";

// Where the page gets an image (design D8): the owner's server fetches it under its allowlist,
// so an image's address is never loaded by the page itself.
export const IMAGE_PATH = "/api/image";

export function imageThroughServer(src: string): string {
  return `${IMAGE_PATH}?src=${encodeURIComponent(src)}`;
}

export type PropKind = "string" | "number" | "string or number" | "boolean" | "array" | "object";

export interface PropSpec {
  kind: PropKind;
  required?: boolean;
  // For a string prop: the only values allowed.
  oneOf?: readonly string[];
  description: string;
}

export interface CatalogEntry {
  description: string;
  // A container holds other components (their `parent` is its id).
  container: boolean;
  props: Record<string, PropSpec>;
}

export const catalog: Record<ComponentType, CatalogEntry> = {
  heading: {
    description: "A heading.",
    container: false,
    props: {
      text: { kind: "string", required: true, description: "The heading's words." },
      level: { kind: "number", description: "1 (largest) to 3; 2 if left out." },
    },
  },
  text: {
    description: "A paragraph of plain text.",
    container: false,
    props: { text: { kind: "string", required: true, description: "The paragraph, as plain text." } },
  },
  image: {
    description: "An image, loaded through the owner's server from an allowlisted host.",
    container: false,
    props: {
      src: { kind: "string", required: true, description: "The image's URL on an allowlisted host." },
      alt: { kind: "string", description: "What the image shows, for those who cannot see it." },
    },
  },
  card: {
    description: "A framed card with a title, a body and, optionally, child components.",
    container: true,
    props: {
      title: { kind: "string", description: "The card's title." },
      body: { kind: "string", description: "The card's text." },
    },
  },
  list: {
    description: "A bulleted or numbered list of items.",
    container: false,
    props: {
      items: { kind: "array", required: true, description: "The items, each a string or number." },
      ordered: { kind: "boolean", description: "Numbered when true." },
    },
  },
  row: {
    description: "A container laying its children out side by side.",
    container: true,
    props: {},
  },
  column: {
    description: "A container laying its children out one under the other.",
    container: true,
    props: {},
  },
  table: {
    description: "A table of rows, one column per key.",
    container: false,
    props: {
      rows: { kind: "array", required: true, description: "The rows, each an object of column name to value." },
      columns: { kind: "array", description: "The column names to show, in order; all keys of the rows if left out." },
    },
  },
  chart: {
    description: "A chart of one series.",
    container: false,
    props: {
      kind: { kind: "string", required: true, oneOf: ["line", "bar", "pie"], description: "line, bar or pie." },
      labels: { kind: "array", required: true, description: "One label per point." },
      values: { kind: "array", required: true, description: "One number per point." },
      title: { kind: "string", description: "The chart's title." },
    },
  },
  tile: {
    description: "A key-figure tile: one number with its label.",
    container: false,
    props: {
      label: { kind: "string", required: true, description: "What the figure is." },
      value: { kind: "string or number", required: true, description: "The figure." },
      unit: { kind: "string", description: "The figure's unit, shown after it." },
    },
  },
  form: {
    description: "A form whose submission is sent to the assistant as a visitor message.",
    container: false,
    props: {
      fields: { kind: "array", required: true, description: "The fields, each {name, label}." },
      submitLabel: { kind: "string", description: "The submit button's label." },
    },
  },
  button: {
    description: "A button whose label is sent to the assistant as a visitor message when pressed.",
    container: false,
    props: { label: { kind: "string", required: true, description: "The button's label, and the message it sends." } },
  },
};

export const componentTypes = Object.keys(catalog) as ComponentType[];

export function isComponentType(type: unknown): type is ComponentType {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(catalog, type);
}

export type Validation = { ok: true; component: Component } | { ok: false; error: string };

// Checks one component against its catalog entry: a known type, an id and a parent, and props
// that are each either a value of the entry's kind or a binding into the page spec's data.
// Whether the parent exists is the page-spec tools' check, since it depends on the whole edit.
export function validateComponent(value: unknown): Validation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "a component must be an object with id, type, parent and props" };
  }
  const { id, type, parent, props } = value as Record<string, unknown>;
  if (typeof id !== "string" || id.trim() === "") return { ok: false, error: "a component needs a non-empty string id" };
  if (!isComponentType(type)) {
    return {
      ok: false,
      error: `component '${id}': unknown type '${String(type)}'; the allowed types are ${componentTypes.join(", ")}`,
    };
  }
  if (typeof parent !== "string" || parent.trim() === "") {
    return { ok: false, error: `component '${id}': parent must name the container it sits in` };
  }
  const given: Record<string, unknown> = props === undefined ? {} : (props as Record<string, unknown>);
  if (typeof given !== "object" || given === null || Array.isArray(given)) {
    return { ok: false, error: `component '${id}': props must be an object` };
  }
  const entry = catalog[type];
  for (const name of Object.keys(given)) {
    if (!(name in entry.props)) {
      return {
        ok: false,
        error: `component '${id}': ${type} has no prop '${name}'; its props are ${describeProps(type)}`,
      };
    }
  }
  for (const [name, spec] of Object.entries(entry.props)) {
    const prop = given[name];
    if (prop === undefined) {
      if (spec.required) return { ok: false, error: `component '${id}': ${type} needs the prop '${name}' (${spec.description})` };
      continue;
    }
    if (isBinding(prop)) {
      if (!prop.$data.startsWith("/")) {
        return { ok: false, error: `component '${id}': the binding for '${name}' must be a path like "/<name>/<path>"` };
      }
      continue;
    }
    const problem = checkKind(prop, spec);
    if (problem) return { ok: false, error: `component '${id}': prop '${name}' ${problem}` };
  }
  return { ok: true, component: { id, type, parent, props: given } };
}

function checkKind(value: unknown, spec: PropSpec): string | null {
  switch (spec.kind) {
    case "string":
      if (typeof value !== "string") return "must be a string";
      if (spec.oneOf && !spec.oneOf.includes(value)) return `must be one of ${spec.oneOf.join(", ")}`;
      return null;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a number";
    case "string or number":
      return typeof value === "string" || typeof value === "number" ? null : "must be a string or a number";
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "array":
      return Array.isArray(value) ? null : "must be an array";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value) ? null : "must be an object";
  }
}

// "text (string, required), level (number)": the props of one type, for an error or a tool
// description.
export function describeProps(type: ComponentType): string {
  const props = Object.entries(catalog[type].props);
  if (props.length === 0) return "none";
  return props.map(([name, spec]) => `${name} (${spec.kind}${spec.required ? ", required" : ""})`).join(", ");
}

// The whole catalog as the model reads it in the tool descriptions.
export function describeCatalog(): string {
  return componentTypes
    .map((type) => {
      const entry = catalog[type];
      const props = Object.entries(entry.props)
        .map(([name, spec]) => `${name}${spec.required ? "" : "?"}: ${spec.kind}${spec.oneOf ? ` (${spec.oneOf.join("|")})` : ""} - ${spec.description}`)
        .join("; ");
      return `- ${type}${entry.container ? " (container)" : ""}: ${entry.description}${props ? ` Props: ${props}` : ""}`;
    })
    .join("\n");
}
