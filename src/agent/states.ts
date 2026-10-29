// The loop's states (seam/loop-state): always one of these, and the page shows the current
// one's label from this one mapping.
export type LoopState = "idle" | "calling_model" | "running_tools" | "awaiting_visitor" | "error";

const labels: Record<LoopState, string> = {
  idle: "idle",
  calling_model: "calling the model",
  running_tools: "running tools",
  awaiting_visitor: "awaiting the visitor",
  error: "error",
};

export function stateLabel(state: LoopState): string {
  return labels[state];
}

// Whether a turn is running in this state.
export function isBusy(state: LoopState): boolean {
  return state === "calling_model" || state === "running_tools";
}
