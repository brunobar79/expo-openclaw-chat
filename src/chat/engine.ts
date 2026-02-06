/**
 * ChatEngine — simplified chat state machine for the SDK
 *
 * Manages in-memory messages, streaming, send/receive/abort.
 * No persistence, no sessions, no Live Activities.
 */

import {
  GatewayClient,
  generateIdempotencyKey,
  type ChatEventPayload,
  type ChatMessage,
  type ChatMessageContent,
  type ChatUsage,
  type ChatAttachmentPayload,
} from "../core";

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Streaming buffer flush interval — ~4Hz to reduce re-renders */
const STREAM_FLUSH_MS = 250;

// ─── Types ──────────────────────────────────────────────────────────────────────

/** A chat message for UI display */
export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: ChatMessageContent[];
  timestamp?: number;
  isStreaming: boolean;
  isError: boolean;
  errorMessage?: string;
  runId?: string;
  usage?: ChatUsage;
}

/** Attachment for sending */
export interface PendingAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  content: string; // base64
  type: "image" | "file";
}

/** Chat engine state */
export interface ChatEngineState {
  messages: UIMessage[];
  isStreaming: boolean;
  isConnected: boolean;
  error: Error | null;
}

/** Chat engine event types */
export type ChatEngineEvent = "update" | "connect" | "disconnect" | "error";

type EventCallback = () => void;
type ErrorCallback = (error: Error) => void;

// ─── Engine ─────────────────────────────────────────────────────────────────────

export class ChatEngine {
  private client: GatewayClient;
  private sessionKey: string;

  // State
  private _messages: UIMessage[] = [];
  private _isStreaming = false;
  private _activeRunId: string | null = null;
  private _error: Error | null = null;

  // Streaming buffer (for 4Hz flush)
  private streamBuf: UIMessage[] | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Event listeners
  private updateListeners = new Set<EventCallback>();
  private connectListeners = new Set<EventCallback>();
  private disconnectListeners = new Set<EventCallback>();
  private errorListeners = new Set<ErrorCallback>();

  // Cleanup
  private unsubChat: (() => void) | null = null;
  private unsubState: (() => void) | null = null;

  constructor(client: GatewayClient, sessionKey: string) {
    this.client = client;
    this.sessionKey = sessionKey;

    // Subscribe to connection state
    this.unsubState = client.onConnectionStateChange((state) => {
      if (state === "connected") {
        this.emitConnect();
        // Subscribe to chat events for our session
        client.chatSubscribe(sessionKey);
      } else if (state === "disconnected") {
        this.emitDisconnect();
      }
    });

    // Subscribe to chat events
    this.unsubChat = client.onChatEvent((payload) => {
      this.handleChatEvent(payload);
    });

    // If already connected, subscribe immediately
    if (client.isConnected) {
      client.chatSubscribe(sessionKey);
    }
  }

  // ─── Public Getters ─────────────────────────────────────────────────────────

  get messages(): UIMessage[] {
    return this._messages;
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  get isConnected(): boolean {
    return this.client.isConnected;
  }

  get error(): Error | null {
    return this._error;
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  /**
   * Send a message with optional attachments.
   */
  async send(text: string, attachments?: PendingAttachment[]): Promise<void> {
    if (!this.client.isConnected) {
      this._error = new Error("Not connected");
      this.emitError(this._error);
      return;
    }

    if (!text.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    this._error = null;

    // Build content blocks for user message
    const contentBlocks: ChatMessageContent[] = [];

    // Add image blocks
    if (attachments) {
      for (const att of attachments) {
        if (att.type === "image") {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: att.mimeType,
              data: att.content,
            },
          } as ChatMessageContent);
        }
      }
    }

    // Add text block
    if (text.trim()) {
      contentBlocks.push({ type: "text", text });
    }

    // Add user message to list
    const userMsg: UIMessage = {
      id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: contentBlocks,
      timestamp: Date.now(),
      isStreaming: false,
      isError: false,
    };

    this._messages = [...this._messages, userMsg];
    this.emitUpdate();

    try {
      // Convert attachments to wire format
      const wireAttachments: ChatAttachmentPayload[] | undefined = attachments
        ?.filter((a) => a.type === "image")
        .map((a) => ({
          type: a.type,
          mimeType: a.mimeType,
          fileName: a.fileName,
          content: a.content,
        }));

      const response = await this.client.chatSend(this.sessionKey, text, {
        attachments: wireAttachments?.length ? wireAttachments : undefined,
        idempotencyKey: generateIdempotencyKey(),
      });

      this._activeRunId = response.runId;
      this._isStreaming = true;

      // Add streaming placeholder
      const placeholder: UIMessage = {
        id: `asst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: [],
        isStreaming: true,
        isError: false,
        runId: response.runId,
      };

      this._messages = [...this._messages, placeholder];
      this.emitUpdate();
    } catch (err) {
      this._error = err instanceof Error ? err : new Error(String(err));
      this._isStreaming = false;
      this.emitError(this._error);
    }
  }

  /**
   * Abort the current streaming response.
   */
  async abort(): Promise<void> {
    if (!this._activeRunId || !this.client.isConnected) return;

    try {
      await this.client.chatAbort(this.sessionKey, this._activeRunId);
    } catch (err) {
      this._error = err instanceof Error ? err : new Error(String(err));
      this.emitError(this._error);
    }
  }

  /**
   * Clear all messages.
   */
  clear(): void {
    this._messages = [];
    this._isStreaming = false;
    this._activeRunId = null;
    this._error = null;
    this.emitUpdate();
  }

  /**
   * Clean up subscriptions.
   */
  destroy(): void {
    this.unsubChat?.();
    this.unsubState?.();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.updateListeners.clear();
    this.connectListeners.clear();
    this.disconnectListeners.clear();
    this.errorListeners.clear();
  }

  // ─── Event Subscriptions ────────────────────────────────────────────────────

  on(event: "update", callback: EventCallback): () => void;
  on(event: "connect", callback: EventCallback): () => void;
  on(event: "disconnect", callback: EventCallback): () => void;
  on(event: "error", callback: ErrorCallback): () => void;
  on(
    event: ChatEngineEvent,
    callback: EventCallback | ErrorCallback,
  ): () => void {
    switch (event) {
      case "update":
        this.updateListeners.add(callback as EventCallback);
        return () => this.updateListeners.delete(callback as EventCallback);
      case "connect":
        this.connectListeners.add(callback as EventCallback);
        return () => this.connectListeners.delete(callback as EventCallback);
      case "disconnect":
        this.disconnectListeners.add(callback as EventCallback);
        return () => this.disconnectListeners.delete(callback as EventCallback);
      case "error":
        this.errorListeners.add(callback as ErrorCallback);
        return () => this.errorListeners.delete(callback as ErrorCallback);
    }
  }

  // ─── Private: Chat Event Handling ───────────────────────────────────────────

  private handleChatEvent(payload: ChatEventPayload): void {
    const { runId, sessionKey, state, message, errorMessage } = payload;

    // Only process events for our session
    if (sessionKey !== this.sessionKey) return;

    switch (state) {
      case "delta":
        this.handleDelta(runId, message);
        break;
      case "complete":
      case "done":
      case "final":
        this.handleComplete(runId, message, payload);
        break;
      case "error":
        this.handleError(runId, errorMessage ?? "Agent error");
        break;
      case "aborted":
        this.handleAborted(runId);
        break;
      default:
        if (message) {
          this.handleDelta(runId, message);
        }
        break;
    }
  }

  private handleDelta(runId: string, message: unknown): void {
    if (!message) return;

    this._isStreaming = true;
    this._activeRunId = runId;

    // Initialize buffer from current state on first delta
    if (!this.streamBuf) {
      this.streamBuf = [...this._messages];
    }

    const msgData = message as ChatMessage;
    const content = normalizeContent(msgData.content);

    // Find existing assistant message for this run
    let existingIdx = -1;
    for (let i = this.streamBuf.length - 1; i >= 0; i--) {
      if (
        this.streamBuf[i]?.runId === runId &&
        this.streamBuf[i]?.role === "assistant"
      ) {
        existingIdx = i;
        break;
      }
    }

    if (existingIdx >= 0) {
      // Update existing message
      this.streamBuf[existingIdx] = {
        ...this.streamBuf[existingIdx]!,
        content,
        isStreaming: true,
      };
    } else {
      // Add new message
      this.streamBuf.push({
        id: `asst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content,
        isStreaming: true,
        isError: false,
        runId,
      });
    }

    this.scheduleFlush();
  }

  private handleComplete(
    runId: string,
    message: unknown,
    payload: ChatEventPayload,
  ): void {
    this.flushImmediate();

    this._isStreaming = false;
    this._activeRunId = null;

    if (!message) {
      // Mark streaming messages as complete
      this._messages = this._messages.map((m) =>
        m.runId === runId && m.isStreaming ? { ...m, isStreaming: false } : m,
      );
      this.emitUpdate();
      return;
    }

    const msgData = message as ChatMessage;
    const content = normalizeContent(msgData.content);

    // Filter out silent replies (NO_REPLY, HEARTBEAT_OK, and partial variants)
    if (isSilentReply(content)) {
      // Remove any streaming placeholder for this run
      this._messages = this._messages.filter(
        (m) => !(m.runId === runId && m.role === "assistant"),
      );
      this.emitUpdate();
      return;
    }

    // Find and update existing message
    let existingIdx = -1;
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (
        this._messages[i]?.runId === runId &&
        this._messages[i]?.role === "assistant"
      ) {
        existingIdx = i;
        break;
      }
    }

    const finalMsg: UIMessage = {
      id:
        existingIdx >= 0
          ? this._messages[existingIdx]!.id
          : `asst-${Date.now().toString(36)}`,
      role: "assistant",
      content: filterVisibleContent(content),
      isStreaming: false,
      isError: false,
      runId,
      usage: msgData.usage ?? payload.usage,
    };

    if (existingIdx >= 0) {
      this._messages = this._messages.map((m, i) =>
        i === existingIdx ? finalMsg : m,
      );
    } else {
      this._messages = [...this._messages, finalMsg];
    }

    this.emitUpdate();
  }

  private handleError(runId: string, errorMessage: string): void {
    this.flushImmediate();

    this._isStreaming = false;
    this._activeRunId = null;
    this._error = new Error(errorMessage);

    // Find and update message
    let existingIdx = -1;
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (
        this._messages[i]?.runId === runId &&
        this._messages[i]?.role === "assistant"
      ) {
        existingIdx = i;
        break;
      }
    }

    if (existingIdx >= 0) {
      this._messages = this._messages.map((m, i) =>
        i === existingIdx
          ? { ...m, isStreaming: false, isError: true, errorMessage }
          : m,
      );
    } else {
      this._messages = [
        ...this._messages,
        {
          id: `err-${Date.now().toString(36)}`,
          role: "assistant",
          content: [{ type: "text", text: errorMessage }],
          isStreaming: false,
          isError: true,
          errorMessage,
          runId,
        },
      ];
    }

    this.emitUpdate();
    this.emitError(this._error);
  }

  private handleAborted(runId: string): void {
    this.flushImmediate();

    this._isStreaming = false;
    this._activeRunId = null;

    this._messages = this._messages.map((m) =>
      m.runId === runId && m.isStreaming ? { ...m, isStreaming: false } : m,
    );

    this.emitUpdate();
  }

  // ─── Private: Streaming Buffer ──────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flushBuffer(), STREAM_FLUSH_MS);
    }
  }

  private flushBuffer(): void {
    this.flushTimer = null;
    if (this.streamBuf) {
      // Filter out streaming messages that look like silent replies in progress
      this._messages = this.streamBuf.filter(
        (m) => !(m.isStreaming && m.role === "assistant" && isSilentReply(m.content)),
      );
      this.emitUpdate();
    }
  }

  private flushImmediate(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.streamBuf) {
      // Filter out streaming messages that look like silent replies in progress
      this._messages = this.streamBuf.filter(
        (m) => !(m.isStreaming && m.role === "assistant" && isSilentReply(m.content)),
      );
      this.streamBuf = null;
      this.emitUpdate();
    }
  }

  // ─── Private: Event Emitters ────────────────────────────────────────────────

  private emitUpdate(): void {
    for (const cb of this.updateListeners) {
      try {
        cb();
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitConnect(): void {
    for (const cb of this.connectListeners) {
      try {
        cb();
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitDisconnect(): void {
    for (const cb of this.disconnectListeners) {
      try {
        cb();
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitError(error: Error): void {
    for (const cb of this.errorListeners) {
      try {
        cb(error);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function normalizeContent(
  content: ChatMessage["content"],
): ChatMessageContent[] {
  if (Array.isArray(content)) {
    return content as ChatMessageContent[];
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return [];
}

/** Filter out tool-related content blocks */
function filterVisibleContent(
  content: ChatMessageContent[],
): ChatMessageContent[] {
  return content.filter((c) => {
    const type = c.type ?? "text";
    // Keep text, thinking, image
    if (type === "text" || type === "thinking" || type === "image") {
      return true;
    }
    // Filter out tool calls and results
    return false;
  });
}

/**
 * Check if message is a silent reply that shouldn't be shown.
 * Handles NO_REPLY, HEARTBEAT_OK, and partial/truncated variants.
 */
function isSilentReply(content: ChatMessageContent[]): boolean {
  // Extract all text from content blocks
  const text = content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
    .trim();

  if (!text) return false;

  // Full matches
  if (text === "NO_REPLY" || text === "HEARTBEAT_OK") return true;

  // Partial/truncated matches (streaming can cut mid-word)
  const silentPrefixes = [
    "NO_REPL",
    "NO_REP",
    "NO_RE",
    "NO_R",
    "NO_",
    "HEARTBEAT_O",
    "HEARTBEAT_",
    "HEARTBEAT",
  ];

  for (const prefix of silentPrefixes) {
    if (text === prefix) return true;
  }

  return false;
}
