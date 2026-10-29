// The page-spec tools (seam/page-tools, design D11): put components by id, remove a component,
// set data. Each takes a page spec and a tool input and gives either a new page spec or a tool
// error, never part of an edit. Nothing here imports from the renderer.
import { describeCatalog, catalog, validateComponent } from "./catalog";
import { ROOT, SKELETON_IDS, type Component, type PageSpec } from "./spec";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type PageToolName = "put_components" | "remove_component" | "set_data";

export type PageToolResult = { ok: true; spec: PageSpec; message: string } | { ok: false; error: string };

export const pageToolDefinitions: ToolDefinition[] = [
  {
    name: "put_components",
    description:
      "Adds components to the page, or replaces the ones whose ids already exist, all at once: " +
      "if any component is invalid nothing changes. Each component has an id, a type from the " +
      "catalog, the id of its parent container and its props. New components go in an existing " +
      `container; the page starts with the containers '${SKELETON_IDS.join("' and '")}'. A prop may ` +
      'bind to the page data instead of holding a value: {"$data": "/<name>/<path>"}. Props are ' +
      "plain text, never HTML.\nThe catalog:\n" +
      describeCatalog(),
    input_schema: {
      type: "object",
      properties: {
        components: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique on the page; the same id replaces the component." },
              type: { type: "string", enum: Object.keys(catalog) },
              parent: { type: "string", description: "The id of the container this sits in." },
              props: { type: "object", description: "The type's props." },
            },
            required: ["id", "type", "parent", "props"],
          },
        },
      },
      required: ["components"],
    },
  },
  {
    name: "remove_component",
    description: `Removes a component and everything inside it. The page's own areas, '${SKELETON_IDS.join("' and '")}', stay.`,
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "set_data",
    description:
      "Stores a value in the page data under a name, replacing what was there; components bind " +
      'to it with {"$data": "/<name>/<path>"}. Use it for data you write yourself; fetched data ' +
      "is stored by fetch_url.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name to store it under." },
        value: { description: "Any JSON value." },
      },
      required: ["name", "value"],
    },
  },
];

export const pageToolNames: PageToolName[] = ["put_components", "remove_component", "set_data"];

export function isPageToolName(name: string): name is PageToolName {
  return (pageToolNames as string[]).includes(name);
}

export function runPageTool(spec: PageSpec, name: PageToolName, input: unknown): PageToolResult {
  const given = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  switch (name) {
    case "put_components":
      return putComponents(spec, given.components);
    case "remove_component":
      return removeComponent(spec, given.id);
    case "set_data":
      return setData(spec, given.name, given.value);
  }
}

function putComponents(spec: PageSpec, components: unknown): PageToolResult {
  if (!Array.isArray(components) || components.length === 0) {
    return { ok: false, error: "put_components needs a non-empty 'components' array" };
  }
  const next: Record<string, Component> = { ...spec.components };
  const put: Component[] = [];
  for (const value of components) {
    const checked = validateComponent(value);
    if (!checked.ok) return { ok: false, error: checked.error };
    const component = checked.component;
    if (isSkeletonId(component.id)) {
      return { ok: false, error: `component '${component.id}' is one of the page's own areas and cannot be replaced; put components inside it` };
    }
    if (component.parent === ROOT) {
      return { ok: false, error: `component '${component.id}': parent must be a container on the page, such as '${SKELETON_IDS.join("' or '")}'` };
    }
    next[component.id] = component;
    put.push(component);
  }
  for (const component of put) {
    const parent = next[component.parent];
    if (!parent) return { ok: false, error: `component '${component.id}': no component '${component.parent}' to put it in` };
    if (!catalog[parent.type].container) {
      return { ok: false, error: `component '${component.id}': '${parent.id}' is a ${parent.type}, not a container` };
    }
    if (isInside(next, parent.id, component.id)) {
      return { ok: false, error: `component '${component.id}' cannot sit inside itself` };
    }
  }
  return {
    ok: true,
    spec: { ...spec, components: next },
    message: `Put ${put.map((c) => `${c.id} (${c.type})`).join(", ")}.`,
  };
}

// Whether `id` is `candidate` or sits inside it, following parents up to the page.
function isInside(components: Record<string, Component>, id: string, candidate: string): boolean {
  const seen = new Set<string>();
  let current: string | undefined = id;
  while (current && !seen.has(current)) {
    if (current === candidate) return true;
    seen.add(current);
    current = components[current]?.parent;
  }
  return false;
}

function removeComponent(spec: PageSpec, id: unknown): PageToolResult {
  if (typeof id !== "string" || !spec.components[id]) {
    return { ok: false, error: `no component '${String(id)}' on the page` };
  }
  if (isSkeletonId(id)) return { ok: false, error: `'${id}' is one of the page's own areas and cannot be removed` };
  const removed = new Set<string>([id]);
  // Descendants: repeat until no component's parent is in the removed set.
  let grew = true;
  while (grew) {
    grew = false;
    for (const component of Object.values(spec.components)) {
      if (!removed.has(component.id) && removed.has(component.parent)) {
        removed.add(component.id);
        grew = true;
      }
    }
  }
  const next: Record<string, Component> = {};
  for (const component of Object.values(spec.components)) if (!removed.has(component.id)) next[component.id] = component;
  return { ok: true, spec: { ...spec, components: next }, message: `Removed ${[...removed].join(", ")}.` };
}

function setData(spec: PageSpec, name: unknown, value: unknown): PageToolResult {
  if (typeof name !== "string" || name.trim() === "" || name.includes("/")) {
    return { ok: false, error: "set_data needs a non-empty 'name' without '/'" };
  }
  if (value === undefined) return { ok: false, error: "set_data needs a 'value'" };
  return { ok: true, spec: { ...spec, data: { ...spec.data, [name]: value } }, message: `Stored data '${name}'.` };
}

function isSkeletonId(id: string): boolean {
  return (SKELETON_IDS as readonly string[]).includes(id);
}
