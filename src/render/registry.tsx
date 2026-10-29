// The registry (seam/catalog, seam/renderer): one drawing per catalog type. Each drawing is one
// element carrying the component's marks, so a test or a stylesheet finds it by id and type,
// and it draws every prop as text: nothing a prop says becomes markup.
//
// A chart is hand-drawn SVG of its bound series, marked with its kind and point count. An image
// is loaded through the owner's server under its allowlist (design D8), never from its own
// address. A button and a form act only by sending a visitor message through the loop, as if
// typed (seam/page-actions, design D13): a button its label, a form its filled-in fields.
import type { FormEvent, ReactElement, ReactNode } from "react";
import { imageThroughServer } from "../page/catalog";
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
  // Sends a visitor message through the loop (AgentLoop.send); the only thing a drawing may do.
  send: (message: string) => void;
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
    // The page loads only from its own origin: the server fetches the image under the
    // allowlist, and refuses one off it, so no image appears and the alt text stays.
    const src = asText(props.src);
    const alt = asText(props.alt);
    return (
      <figure {...marks} className="image">
        {/^https?:\/\//i.test(src) && <img src={imageThroughServer(src)} alt={alt} />}
        {alt && <figcaption>{alt}</figcaption>}
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
    const kind = props.kind === "bar" || props.kind === "pie" ? props.kind : "line";
    const points = seriesOf(props.labels, props.values);
    const title = asText(props.title);
    return (
      <figure {...marks} className="chart" data-chart-kind={kind} data-point-count={points.length}>
        {title && <figcaption>{title}</figcaption>}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title || `${kind} chart of ${points.length} points`}>
          {kind === "line" ? <Line points={points} /> : kind === "bar" ? <Bars points={points} /> : <Pie points={points} />}
        </svg>
      </figure>
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
  form({ props, marks, send }) {
    const fields = asArray(props.fields).filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null);
    const named = fields.map((f, i) => ({ name: asText(f.name) || `field${i + 1}`, label: asText(f.label ?? f.name) }));
    const submit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const filled = new FormData(event.currentTarget);
      send(named.map((f) => `${f.label || f.name}: ${asText(filled.get(f.name))}`).join("\n"));
    };
    return (
      <form {...marks} className="form" onSubmit={submit}>
        {named.map((f) => (
          <label key={f.name}>
            {f.label}
            <input type="text" name={f.name} />
          </label>
        ))}
        <button type="submit">{asText(props.submitLabel) || "Send"}</button>
      </form>
    );
  },
  button({ props, marks, send }) {
    const label = asText(props.label);
    return (
      <button {...marks} type="button" className="button" onClick={() => send(label)}>
        {label}
      </button>
    );
  },
};

// ---------------------------------------------------------------------------------------
// Charts, hand-drawn (design D1 leaves the choice open; no new dependency).

const W = 400;
const H = 200;
const PAD = 24;
const COLORS = ["#3b6fd4", "#e0803a", "#3a9e6b", "#c94f6d", "#8a63c7", "#a08a3c", "#4a9fb3", "#777"];

interface Point {
  label: string;
  value: number;
}

// One point per value that is a number, labelled by the label at its place.
function seriesOf(labels: unknown, values: unknown): Point[] {
  const names = asArray(labels);
  const points: Point[] = [];
  asArray(values).forEach((v, i) => {
    const value = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (Number.isFinite(value)) points.push({ label: asText(names[i] ?? i + 1), value });
  });
  return points;
}

function scale(points: Point[]) {
  const values = points.map((p) => p.value);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;
  return (value: number) => H - PAD - ((value - low) / span) * (H - 2 * PAD);
}

function Line({ points }: { points: Point[] }) {
  const y = scale(points);
  const x = (i: number) => PAD + (points.length > 1 ? (i / (points.length - 1)) * (W - 2 * PAD) : (W - 2 * PAD) / 2);
  return (
    <g>
      <polyline fill="none" stroke={COLORS[0]} strokeWidth={2} points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={COLORS[0]}>
          <title>{`${p.label}: ${p.value}`}</title>
        </circle>
      ))}
    </g>
  );
}

function Bars({ points }: { points: Point[] }) {
  const y = scale(points);
  const zero = y(0);
  const slot = (W - 2 * PAD) / Math.max(points.length, 1);
  return (
    <g>
      {points.map((p, i) => (
        <rect
          key={i}
          x={PAD + i * slot + slot * 0.1}
          width={slot * 0.8}
          y={Math.min(y(p.value), zero)}
          height={Math.abs(zero - y(p.value))}
          fill={COLORS[0]}
        >
          <title>{`${p.label}: ${p.value}`}</title>
        </rect>
      ))}
    </g>
  );
}

function Pie({ points }: { points: Point[] }) {
  const slices = points.filter((p) => p.value > 0);
  const total = slices.reduce((sum, p) => sum + p.value, 0);
  const r = H / 2 - PAD / 2;
  const at = (angle: number) => `${W / 2 + r * Math.sin(angle)},${H / 2 - r * Math.cos(angle)}`;
  let start = 0;
  return (
    <g>
      {slices.map((p, i) => {
        const angle = (p.value / total) * 2 * Math.PI;
        const end = start + angle;
        const d =
          slices.length === 1
            ? `M ${W / 2 - r},${H / 2} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0`
            : `M ${W / 2},${H / 2} L ${at(start)} A ${r},${r} 0 ${angle > Math.PI ? 1 : 0},1 ${at(end)} Z`;
        start = end;
        return (
          <path key={i} d={d} fill={COLORS[i % COLORS.length]}>
            <title>{`${p.label}: ${p.value}`}</title>
          </path>
        );
      })}
    </g>
  );
}
