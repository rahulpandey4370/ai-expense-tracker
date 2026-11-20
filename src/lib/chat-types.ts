/** What the chat UI renders, built from the saved ADK events of a conversation. */

export interface ActionPreview { title: string; lines: { label: string; value: string }[]; rows?: string[][]; danger?: boolean }

export type ChatItem =
  | { kind: 'user'; id: string; text: string; attachments?: string[] }
  | { kind: 'assistant'; id: string; text: string; followUps?: string[]; model?: string }
  | { kind: 'table'; id: string; title?: string; columns: string[]; rows: string[][] }
  /** A paused action waiting for the user's tap. `id` is the confirmation call id. */
  | { kind: 'confirm'; id: string; tool: string; preview: ActionPreview; status: 'pending' | 'confirmed' | 'cancelled' }
  /** What an action did. `undo` is set for deletes. */
  | { kind: 'result'; id: string; tool: string; ok: boolean; text: string; undo?: Record<string, unknown> }
  | { kind: 'memory'; id: string; text: string }
  | { kind: 'compacted'; id: string };

export interface ChatSummary { id: string; title: string; kind: 'chat' | 'review'; updatedAt: string }

export interface ChatTurnResult {
  sessionId: string;
  title: string;
  /** The whole conversation after this turn. */
  items: ChatItem[];
  error?: string;
}

export interface ChatAttachment { name: string; mime: string; dataBase64: string }

export interface ChatOptions {
  modelKey?: string;
  verbose?: boolean;
  investmentMode?: boolean;
  viewing?: { month: number; year: number };
}
