// The Messages API shapes the browser and the server exchange. The site has no SDK dependency
// (design D1: a hand-written loop over the Messages API), so the few shapes used are named here.

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// Other block types the model may return (thinking, for one) are kept in the conversation
// unchanged and otherwise ignored.
export interface OtherBlock {
  type: string;
  [key: string]: unknown;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | OtherBlock;

export interface MessageParam {
  role: "user" | "assistant";
  content: ContentBlock[];
}

// The model's reply, as the server returns it.
export interface ModelReply {
  content: ContentBlock[];
  stop_reason: string | null;
  [key: string]: unknown;
}

export const isText = (b: ContentBlock): b is TextBlock => b.type === "text";
export const isToolUse = (b: ContentBlock): b is ToolUseBlock => b.type === "tool_use";
