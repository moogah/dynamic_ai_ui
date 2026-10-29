// The page (design D1, D12): the page spec drawn beside the chat. One page store and one loop
// per page, made with it and gone with it (seam/page-store): a reload starts from the skeleton.
import { useState, useSyncExternalStore } from "react";
import { createAgentLoop } from "./agent/loop";
import { isBusy, stateLabel } from "./agent/states";
import { createPageStore } from "./page/store";
import { PageView } from "./render/PageView";

const styles = `
  .site { display: flex; gap: 1.5rem; min-height: 100vh; font-family: system-ui, sans-serif; }
  .site > main { flex: 1; padding: 1rem; }
  .site > aside { width: 24rem; padding: 1rem; border-left: 1px solid #ccc; display: flex; flex-direction: column; }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .column { display: flex; flex-direction: column; gap: 1rem; }
  .card { border: 1px solid #ccc; border-radius: 0.5rem; padding: 1rem; }
  .tile { display: inline-flex; flex-direction: column; border: 1px solid #ccc; border-radius: 0.5rem; padding: 1rem; }
  .tile-value { font-size: 2rem; }
  .chat-log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  .chat-log .visitor { align-self: flex-end; background: #e8f0fe; padding: 0.5rem; border-radius: 0.5rem; }
  .chat-log .assistant { background: #f1f1f1; padding: 0.5rem; border-radius: 0.5rem; }
  .chat-log .tool { color: #666; font-size: 0.85rem; }
  .chat-status { color: #666; font-size: 0.85rem; margin-bottom: 0.5rem; }
  .chat-controls { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
  .chat-controls input { flex: 1; }
`;

export function App() {
  const [store] = useState(createPageStore);
  const [loop] = useState(() => createAgentLoop({ store }));
  const { state, entries, error } = useSyncExternalStore(loop.subscribe, loop.snapshot, loop.snapshot);
  const [draft, setDraft] = useState("");
  const busy = isBusy(state);

  const send = () => {
    const words = draft.trim();
    if (words === "" || busy) return;
    setDraft("");
    void loop.send(words);
  };

  return (
    <div className="site">
      <style>{styles}</style>
      <main>
        <PageView store={store} />
      </main>
      <aside>
        <div role="status" className="chat-status">
          {stateLabel(state)}
          {state === "error" && error ? `: ${error}` : ""}
        </div>
        <div role="log" aria-live="polite" className="chat-log">
          {entries.map((entry, i) => (
            <div key={i} className={entry.role}>
              {entry.text}
            </div>
          ))}
        </div>
        <div className="chat-controls">
          <input
            type="text"
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
          />
          <button type="button" onClick={send} disabled={busy}>
            Send
          </button>
          {/* Undo is offered between turns only (seam/page-store, design D5); Stop while one
              runs (seam/stop, design D6). */}
          <button type="button" onClick={() => store.undo()} disabled={busy}>
            Undo
          </button>
          <button type="button" onClick={() => loop.stop()} disabled={!busy}>
            Stop
          </button>
        </div>
      </aside>
    </div>
  );
}
