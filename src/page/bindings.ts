// Resolves the data bindings in a component's props against the page spec's data
// (seam/renderer): {"$data": "/<name>/<path>"} becomes the value at that path, or undefined
// when nothing is there. Independent of any renderer, so a second one resolves the same way.
import { isBinding } from "./spec";

export function resolveBindings(props: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) resolved[name] = resolveValue(value, data);
  return resolved;
}

function resolveValue(value: unknown, data: Record<string, unknown>): unknown {
  if (isBinding(value)) return lookup(value.$data, data);
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, data));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v, data);
    return out;
  }
  return value;
}

// "/lisbon/hourly/time" -> data.lisbon.hourly.time. Segments are JSON-pointer style: "~1" is
// "/" and "~0" is "~"; a numeric segment indexes an array.
export function lookup(path: string, data: Record<string, unknown>): unknown {
  if (!path.startsWith("/")) return undefined;
  const segments = path
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = data;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}
