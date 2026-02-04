/**
 * Gateway WebSocket Protocol v3 — TypeScript types
 *
 * All communication is JSON text frames over WebSocket.
 * First frame MUST be a `connect` request.
 */

// ─── Protocol Version ──────────────────────────────────────────────────────────

export const GATEWAY_PROTOCOL_VERSION = 3;

// ─── Frame Types ────────────────────────────────────────────────────────────────

export interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

export interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: Record<string, number>;
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// ─── Error ──────────────────────────────────────────────────────────────────────

export enum ErrorCode {
  NOT_LINKED = "NOT_LINKED",
  NOT_PAIRED = "NOT_PAIRED",
  AGENT_TIMEOUT = "AGENT_TIMEOUT",
  INVALID_REQUEST = "INVALID_REQUEST",
  UNAVAILABLE = "UNAVAILABLE",
}

export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

// ─── Connect Handshake ──────────────────────────────────────────────────────────

export interface ConnectChallenge {
  nonce: string;
  ts: number;
}

export interface ClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: string;
  displayName?: string;
}

export interface DeviceIdentity {
  id: string;
  /** Device's Ed25519 public key (required if device is sent) */
  publicKey: string;
  /** Signature of device identity payload (required if device is sent) */
  signature: string;
  /** Timestamp of when the signature was created (required if device is sent) */
  signedAt: number;
  /** Challenge nonce from gateway (optional) */
  nonce?: string;
}

export interface ConnectAuth {
  token?: string;
  password?: string;
  deviceToken?: string;
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: ClientInfo;
  role: "operator" | "node";
  scopes: string[];
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, unknown>;
  auth?: ConnectAuth;
  locale?: string;
  userAgent?: string;
  device?: DeviceIdentity;
}

export interface HelloOkAuth {
  deviceToken: string;
  role: string;
  scopes: string[];
}

export interface HelloOkPolicy {
  tickIntervalMs: number;
  [key: string]: unknown;
}

export interface StateVersion {
  presence: number;
  health: number;
}

export interface PresenceEntry {
  host?: string;
  ip?: string;
  version?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  mode?: string;
  lastInputSeconds?: number;
  reason?: string;
  tags?: string[];
  text?: string;
  ts: number;
  deviceId?: string;
  roles?: string[];
  scopes?: string[];
  instanceId?: string;
}

export interface Snapshot {
  presence: PresenceEntry[];
  health: Record<string, unknown>;
  stateVersion: StateVersion;
  uptimeMs: number;
  configPath?: string;
  stateDir?: string;
  sessionDefaults?: Record<string, unknown>;
}

export interface HelloOk {
  type: "hello-ok";
  protocol: number;
  server?: Record<string, unknown>;
  features?: Record<string, unknown>;
  snapshot?: Snapshot;
  canvasHostUrl?: string;
  auth?: HelloOkAuth;
  policy: HelloOkPolicy;
}

// ─── Event Payloads ─────────────────────────────────────────────────────────────

/** Tick keepalive event payload */
export interface TickPayload {
  ts: number;
}

/** Health event payload */
export interface HealthPayload {
  ok: boolean;
  [key: string]: unknown;
}

/** Chat event payload — streaming message updates */
export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  seq?: number;
  state: string;
  message?: ChatMessage;
  errorMessage?: string;
  usage?: ChatUsage;
  stopReason?: string;
}

/** Agent run progress events */
export interface AgentEventPayload {
  runId: string;
  seq?: number;
  stream: string;
  ts?: number;
  data: Record<string, unknown>;
}

/** Sequence gap event */
export interface SeqGapPayload {
  expected: number;
  received: number;
}

/** Shutdown event */
export interface ShutdownPayload {
  reason: string;
  restartExpectedMs?: number;
}

// ─── Chat Types ─────────────────────────────────────────────────────────────────

export type ChatMessageContentType =
  | "text"
  | "thinking"
  | "toolCall"
  | "toolResult"
  | "image"
  | "file";

export interface ChatMessageContent {
  type?: string;
  text?: string;
  thinking?: string;
  thinkingSignature?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
  /** Base64 image data (gateway transcript format) */
  data?: string;
  /** Anthropic image source */
  source?: { type?: string; media_type?: string; data?: string };
  /** Tool-call fields */
  id?: string;
  name?: string;
  arguments?: unknown;
}

export interface ChatUsageCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface ChatUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: ChatUsageCost;
  total?: number;
}

export interface ChatMessage {
  role: string;
  content: ChatMessageContent[] | string;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  usage?: ChatUsage;
  stopReason?: string;
}

export interface ChatAttachmentPayload {
  type: string;
  mimeType: string;
  fileName: string;
  content: string; // base64
}

// ─── Chat API Responses ─────────────────────────────────────────────────────────

export interface ChatHistoryPayload {
  sessionKey: string;
  sessionId?: string;
  messages?: unknown[];
  thinkingLevel?: string;
}

export interface ChatSendResponse {
  runId: string;
  status: string;
}

// ─── Sessions ───────────────────────────────────────────────────────────────────

export interface SessionEntry {
  key: string;
  kind?: string;
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt?: number;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  contextTokens?: number;
  channel?: string;
  origin?: {
    label?: string;
    provider?: string;
    surface?: string;
    chatType?: string;
  };
}

export interface SessionsDefaults {
  model?: string;
  contextTokens?: number;
}

export interface SessionsListResponse {
  ts?: number;
  path?: string;
  count?: number;
  defaults?: SessionsDefaults;
  sessions: SessionEntry[];
}

export interface SessionPreviewItem {
  role: string;
  text: string;
}

export interface SessionPreviewEntry {
  key: string;
  status: string;
  items: SessionPreviewItem[];
}

export interface SessionsPreviewPayload {
  ts: number;
  previews: SessionPreviewEntry[];
}

// ─── Event Names ────────────────────────────────────────────────────────────────

export const GatewayEvents = {
  TICK: "tick",
  HEALTH: "health",
  CHAT: "chat",
  AGENT: "agent",
  SEQ_GAP: "seqGap",
  CONNECT_CHALLENGE: "connect.challenge",
  SHUTDOWN: "shutdown",
  PRESENCE: "presence",
  DEVICE_PAIR_REQUESTED: "device.pair.requested",
  DEVICE_PAIR_RESOLVED: "device.pair.resolved",
  EXEC_APPROVAL_REQUESTED: "exec.approval.requested",
} as const;

export type GatewayEventName =
  (typeof GatewayEvents)[keyof typeof GatewayEvents];

// ─── Method Names ───────────────────────────────────────────────────────────────

export const GatewayMethods = {
  CONNECT: "connect",
  HEALTH: "health",
  CHAT_HISTORY: "chat.history",
  CHAT_SEND: "chat.send",
  CHAT_ABORT: "chat.abort",
  SESSIONS_LIST: "sessions.list",
  SESSIONS_PREVIEW: "sessions.preview",
  SESSIONS_RESOLVE: "sessions.resolve",
  SESSIONS_PATCH: "sessions.patch",
  SESSIONS_RESET: "sessions.reset",
  SESSIONS_DELETE: "sessions.delete",
  SYSTEM_PRESENCE: "system-presence",
} as const;
