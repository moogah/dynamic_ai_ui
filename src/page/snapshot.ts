// The page as it stands, for the model (seam/page-snapshot, design D4): every component with
// its id, type, parent and props, and the data by name and shape, never in full. The loop puts
// this with each visitor message, so the model learns of undo and stopping without the
// conversation being rewritten.
import type { PageSpec } from "./spec";

export interface PageDescription {
  components: Array<{ id: string; type: string; parent: string; props: Record<string, unknown> }>;
  // One line per data entry: its shape, e.g. "object {hourly: object {time: array of 4 string}}".
  data: Record<string, string>;
}

export function describePage(spec: PageSpec): PageDescription {
  const data: Record<string, string> = {};
  for (const [name, value] of Object.entries(spec.data)) data[name] = shapeOf(value);
  return {
    components: Object.values(spec.components).map(({ id, type, parent, props }) => ({ id, type, parent, props })),
    data,
  };
}

const MAX_DEPTH = 3;
const MAX_KEYS = 20;

// The shape of a value: its type and size, with its first item or its keys, a few levels deep.
export function shapeOf(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "empty array";
    return `array of ${value.length} ${depth >= MAX_DEPTH ? typeName(value[0]) : shapeOf(value[0], depth + 1)}`;
  }
  switch (typeof value) {
    case "string":
      return `string (${value.length} chars)`;
    case "number":
    case "boolean":
      return typeof value;
    case "object": {
      const keys = Object.keys(value as object);
      if (depth >= MAX_DEPTH) return `object (${keys.length} keys)`;
      const shown = keys
        .slice(0, MAX_KEYS)
        .map((k) => `${k}: ${shapeOf((value as Record<string, unknown>)[k], depth + 1)}`);
      if (keys.length > MAX_KEYS) shown.push(`... ${keys.length - MAX_KEYS} more`);
      return `object {${shown.join(", ")}}`;
    }
    default:
      return typeof value;
  }
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
