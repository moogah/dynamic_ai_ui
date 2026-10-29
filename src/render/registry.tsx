// The registry (seam/catalog, seam/renderer): one drawing per catalog type. Each drawing is one
// element carrying the component's marks, so a test or a stylesheet finds it by id and type,
// and it draws every prop as text: nothing a prop says becomes markup.
//
// Chart, image, form and button are validated by the catalog and drawn here as placeholders; the
// chart-and-actions task draws them (charts, images through the server, buttons that send a
// visitor message, seam/page-actions).
import type { ReactElement, ReactNode } from "react";
import type { ComponentType } from "../page/spec";

export interface Marks {
  "data-component-id": string;
  "data-component-type": ComponentType;
}

export interface Drawing {
  id: string;
  type: ComponentType;
  // The props with their data bindings resolved (src/page/bindings.ts).
  props: Record<string, unknown>;
  marks: Marks;
  // The drawn children of a container, in sibling order.
  children: ReactNode;
}

// A prop as text, whatever it holds.
export function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const registry: Record<ComponentType, (drawing: Drawing) => ReactElement> = {
  heading({ props, marks }) {
    const level = props.level === 1 ? 1 : props.level === 3 ? 3 : 2;
    const Tag = `h${level}` as "h1" | "h2" | "h3";
    return <Tag {...marks}>{asText(props.text)}</Tag>;
  },
  text({ props, marks }) {
    return <p {...marks}>{asText(props.text)}</p>;
  },
  image({ props, marks }) {
    // No <img>: the page loads nothing from another host (design D8). The image itself is
    // drawn through the server by chart-and-actions.
    return (
      <figure {...marks} className="image-placeholder">
        <figcaption>{asText(props.alt) || "image"}</figcaption>
      </figure>
    );
  },
  card({ props, marks, children }) {
    return (
      <section {...marks} className="card">
        {props.title !== undefined && <h3>{asText(props.title)}</h3>}
        {props.body !== undefined && <p>{asText(props.body)}</p>}
        {children}
      </section>
    );
  },
  list({ props, marks }) {
    const items = asArray(props.items).map((item, i) => <li key={i}>{asText(item)}</li>);
    return props.ordered === true ? <ol {...marks}>{items}</ol> : <ul {...marks}>{items}</ul>;
  },
  row({ marks, children }) {
    return (
      <div {...marks} className="row">
        {children}
      </div>
    );
  },
  column({ marks, children }) {
    return (
      <div {...marks} className="column">
        {children}
      </div>
    );
  },
  table({ props, marks }) {
    const rows = asArray(props.rows).filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
    const columns = Array.isArray(props.columns)
      ? props.columns.map(asText)
      : [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return (
      <table {...marks}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((column) => (
                <td key={column}>{asText(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
  chart({ props, marks }) {
    const kind = asText(props.kind);
    return (
      <div {...marks} className="chart-placeholder">
        {asText(props.title) || `${kind} chart`} ({asArray(props.values).length} points; drawing charts comes with a later build)
      </div>
    );
  },
  tile({ props, marks }) {
    return (
      <div {...marks} className="tile">
        <span className="tile-label">{asText(props.label)}</span>
        <span className="tile-value">
          {asText(props.value)}
          {props.unit !== undefined && <span className="tile-unit"> {asText(props.unit)}</span>}
        </span>
      </div>
    );
  },
  form({ props, marks }) {
    const fields = asArray(props.fields).filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null);
    return (
      <div {...marks} className="form-placeholder">
        form: {fields.map((f) => asText(f.label ?? f.name)).join(", ")} (forms act in a later build)
      </div>
    );
  },
  button({ props, marks }) {
    return (
      <div {...marks} className="button-placeholder">
        {asText(props.label)} (buttons act in a later build)
      </div>
    );
  },
};
