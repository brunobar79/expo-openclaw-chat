/**
 * Gateway WebSocket Client — full protocol v3 implementation
 *
 * Handles connect handshake, request/response, event subscriptions,
 * auto-reconnect with exponential backoff, keepalive, and chat methods.
 */

import {
  GATEWAY_PROTOCOL_VERSION,
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type GatewayFrame,
  type ConnectParams,
  type ConnectChallenge,
  type HelloOk,
  type ChatHistoryPayload,
  type ChatSendResponse,
  type ChatEventPayload,
  type AgentEventPayload,
  type HealthPayload,
  type SessionsListResponse,
  type ChatAttachmentPayload,
  type ErrorShape,
  type DeviceIdentity as WireDeviceIdentity,
  GatewayEvents,
  GatewayMethods,
} from "./protocol";
import {
  loadOrCreateIdentity,
  signPayload,
  publicKeyBase64Url,
  buildSignaturePayload,
  type StoredDeviceIdentity,
} from "./device-identity";

// ─── Connection State ───────────────────────────────────────────────────────────

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// ─── Options ────────────────────────────────────────────────────────────────────

export interface GatewayClientOptions {
  /** Auth token (simple shared secret) */
  token?: string;
  /** Auth password (alternative) */
  password?: string;
  /** Device token from previous pairing */
  deviceToken?: string;
  /** Device identity */
  deviceId?: string;
  /** Auto-reconnect on disconnect (default true) */
  autoReconnect?: boolean;
  /** Default request timeout in ms (default 15000) */
  defaultTimeoutMs?: number;
  /** Client display name */
  displayName?: string;
  /** App version string */
  appVersion?: string;
  /** Platform string (e.g. 'ios', 'android') */
  platform?: string;
  /** Client ID for gateway registration (default: openclaw-ios) */
  clientId?: string;
}

// ─── Event Listener Types ───────────────────────────────────────────────────────

type EventCallback = (payload: unknown) => void;
type ConnectionStateCallback = (state: ConnectionState) => void;
type ChatEventCallback = (payload: ChatEventPayload) => void;
type AgentEventCallback = (payload: AgentEventPayload) => void;
type HealthEventCallback = (payload: HealthPayload) => void;

// ─── Pending Request ────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Models List Response ───────────────────────────────────────────────────────

export interface ModelEntry {
  key: string;
  name: string;
  input?: string;
  contextWindow?: number;
  local?: boolean;
  available: boolean;
  tags?: string[];
  missing?: boolean;
}

export interface ModelsListResponse {
  count: number;
  models: ModelEntry[];
}

// ─── Gateway Error ──────────────────────────────────────────────────────────────

export class GatewayError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  public readonly retryable?: boolean;
  public readonly retryAfterMs?: number;

  constructor(error: ErrorShape) {
    super(error.message);
    this.name = "GatewayError";
    this.code = error.code;
    this.details = error.details;
    this.retryable = error.retryable;
    this.retryAfterMs = error.retryAfterMs;
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────────

export class GatewayClient {
  private url: string;
  private options: GatewayClientOptions;

  // WebSocket
  private ws: WebSocket | null = null;
  private _connectionState: ConnectionState = "disconnected";

  // Request/response tracking
  private requestIdCounter = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  // Event subscriptions
  private eventListeners = new Map<string, Set<EventCallback>>();
  private connectionStateListeners = new Set<ConnectionStateCallback>();
  private chatEventListeners = new Set<ChatEventCallback>();
  private agentEventListeners = new Set<AgentEventCallback>();
  private healthEventListeners = new Set<HealthEventCallback>();

  // Reconnection
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // Keepalive
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private tickIntervalMs = 15_000;
  private lastTickReceived = 0;
  private missedTickThreshold = 3;

  // Sequence tracking
  private lastSeq = -1;

  // Handshake
  private connectPromiseResolve: ((value: HelloOk) => void) | null = null;
  private connectPromiseReject: ((reason: Error) => void) | null = null;
  private challengeNonce: string | null = null;
  private helloOk: HelloOk | null = null;

  // Device identity for crypto auth
  private deviceIdentity: StoredDeviceIdentity | null = null;

  // Pairing flow state
  private awaitingPairing = false;

  constructor(url: string, options: GatewayClientOptions = {}) {
    this.url = url;
    this.options = {
      autoReconnect: true,
      defaultTimeoutMs: 15_000,
      platform: "react-native",
      appVersion: "1.0.0",
      ...options,
    };
  }

  // ─── Public Getters ─────────────────────────────────────────────────────────

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get isConnected(): boolean {
    return this._connectionState === "connected";
  }

  get serverInfo(): HelloOk | null {
    return this.helloOk;
  }

  // ─── Connection Lifecycle ───────────────────────────────────────────────────

  /**
   * Ensure device identity is loaded (lazy init).
   */
  private ensureIdentity(): StoredDeviceIdentity {
    if (!this.deviceIdentity) {
      this.deviceIdentity = loadOrCreateIdentity();
    }
    return this.deviceIdentity;
  }

  /**
   * Connect to the gateway. Resolves with HelloOk on successful handshake.
   */
  async connect(): Promise<HelloOk> {
    if (
      this._connectionState === "connected" ||
      this._connectionState === "connecting"
    ) {
      throw new Error(`Already ${this._connectionState}`);
    }

    this.intentionalClose = false;
    this.setConnectionState("connecting");

    // Load device identity before opening WebSocket
    this.ensureIdentity();

    return new Promise<HelloOk>((resolve, reject) => {
      this.connectPromiseResolve = resolve;
      this.connectPromiseReject = reject;
      this.openWebSocket();
    });
  }

  /**
   * Cleanly disconnect from the gateway.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.awaitingPairing = false;
    this.clearReconnectTimer();
    this.clearTickTimer();
    this.challengeNonce = null;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Client disconnected"));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      try {
        this.ws.close(1000, "Client disconnect");
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }

    this.setConnectionState("disconnected");
  }

  // ─── Request / Response ─────────────────────────────────────────────────────

  /**
   * Send a request frame and wait for the matching response.
   */
  request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this._connectionState !== "connected") {
        return reject(new Error("Not connected"));
      }

      const id = this.nextRequestId();
      const timeout = timeoutMs ?? this.options.defaultTimeoutMs ?? 15_000;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (payload: unknown) => void,
        reject,
        timer,
      });

      const frame: RequestFrame = {
        type: "req",
        id,
        method,
        params,
      };

      this.sendFrame(frame);
    });
  }

  /**
   * Send a fire-and-forget event frame.
   */
  sendEvent(event: string, payload?: unknown): void {
    if (!this.ws || this._connectionState !== "connected") {
      return;
    }

    const frame: EventFrame = {
      type: "event",
      event,
      payload,
    };

    this.sendFrame(frame);
  }

  // ─── Event Subscription ────────────────────────────────────────────────────

  /**
   * Subscribe to a specific event name.
   */
  on(eventName: string, callback: EventCallback): void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(callback);
  }

  /**
   * Unsubscribe from a specific event name.
   */
  off(eventName: string, callback: EventCallback): void {
    this.eventListeners.get(eventName)?.delete(callback);
  }

  /**
   * Subscribe to connection state changes.
   */
  onConnectionStateChange(callback: ConnectionStateCallback): () => void {
    this.connectionStateListeners.add(callback);
    return () => this.connectionStateListeners.delete(callback);
  }

  /**
   * Subscribe to chat streaming events.
   */
  onChatEvent(callback: ChatEventCallback): () => void {
    this.chatEventListeners.add(callback);
    return () => this.chatEventListeners.delete(callback);
  }

  /**
   * Subscribe to agent run progress events.
   */
  onAgentEvent(callback: AgentEventCallback): () => void {
    this.agentEventListeners.add(callback);
    return () => this.agentEventListeners.delete(callback);
  }

  /**
   * Subscribe to health events.
   */
  onHealthEvent(callback: HealthEventCallback): () => void {
    this.healthEventListeners.add(callback);
    return () => this.healthEventListeners.delete(callback);
  }

  // ─── Chat Methods ──────────────────────────────────────────────────────────

  /**
   * Fetch chat history for a session.
   */
  async chatHistory(
    sessionKey: string,
    options?: { limit?: number },
  ): Promise<ChatHistoryPayload> {
    return this.request<ChatHistoryPayload>(
      GatewayMethods.CHAT_HISTORY,
      { sessionKey, ...(options?.limit ? { limit: options.limit } : {}) },
      15_000,
    );
  }

  /**
   * Send a chat message. Returns runId for tracking streaming events.
   */
  async chatSend(
    sessionKey: string,
    message: string,
    options?: {
      thinking?: string;
      attachments?: ChatAttachmentPayload[];
      idempotencyKey?: string;
      timeoutMs?: number;
    },
  ): Promise<ChatSendResponse> {
    const idempotencyKey = options?.idempotencyKey ?? generateIdempotencyKey();
    const serverTimeout = options?.timeoutMs ?? 30_000;

    return this.request<ChatSendResponse>(
      GatewayMethods.CHAT_SEND,
      {
        sessionKey,
        message,
        thinking: options?.thinking ?? "",
        attachments: options?.attachments?.length
          ? options.attachments
          : undefined,
        timeoutMs: serverTimeout,
        idempotencyKey,
      },
      serverTimeout + 5_000, // extra buffer beyond the server-side timeout
    );
  }

  /**
   * Abort a running chat agent.
   */
  async chatAbort(sessionKey: string, runId: string): Promise<void> {
    await this.request(
      GatewayMethods.CHAT_ABORT,
      { sessionKey, runId },
      10_000,
    );
  }

  /**
   * Subscribe to chat events for a session.
   * Note: Server may auto-subscribe on chatSend, this is a no-op for now.
   */
  chatSubscribe(_sessionKey: string): void {
    // Server doesn't support client event frames, subscription is implicit
  }

  /**
   * List available sessions.
   */
  async sessionsList(options?: {
    limit?: number;
    includeGlobal?: boolean;
  }): Promise<SessionsListResponse> {
    return this.request<SessionsListResponse>(
      GatewayMethods.SESSIONS_LIST,
      {
        includeGlobal: options?.includeGlobal ?? true,
        includeUnknown: false,
        limit: options?.limit,
      },
      15_000,
    );
  }

  /**
   * Health check — returns true if gateway responds.
   */
  async health(timeoutMs = 5_000): Promise<boolean> {
    try {
      const res = await this.request<{ ok?: boolean }>(
        GatewayMethods.HEALTH,
        undefined,
        timeoutMs,
      );
      return res?.ok !== false;
    } catch {
      return false;
    }
  }

  /**
   * List available models from the gateway.
   */
  async modelsList(options?: {
    timeoutMs?: number;
  }): Promise<ModelsListResponse> {
    return this.request<ModelsListResponse>(
      "models.list",
      {},
      options?.timeoutMs ?? 15_000,
    );
  }

  // ─── Private: WebSocket Lifecycle ──────────────────────────────────────────

  private openWebSocket(): void {
    // Auto-add wss:// if protocol is missing
    let url = this.url;
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      url = `wss://${url}`;
    }

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.handleConnectFailure(err as Error);
      return;
    }

    this.ws.onopen = () => {
      // Wait for either connect.challenge or send connect immediately
      // The server may or may not send a challenge; set a small timeout
      // to send connect if no challenge arrives
      this.challengeNonce = null;
      // Give 2s for an optional challenge, then connect anyway
      setTimeout(() => {
        if (this._connectionState === "connecting" && !this.challengeNonce) {
          this.sendConnectFrame();
        }
      }, 500);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };

    this.ws.onerror = () => {
      // WebSocket errors are followed by onclose, handle there
    };

    this.ws.onclose = (event) => {
      this.handleClose(event.code ?? 1000, event.reason ?? "");
    };
  }

  private handleMessage(data: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(data) as GatewayFrame;
    } catch {
      console.warn(
        "[GatewayClient] Failed to parse frame:",
        data.slice(0, 200),
      );
      return;
    }

    switch (frame.type) {
      case "res":
        this.handleResponse(frame as ResponseFrame);
        break;
      case "event":
        this.handleEvent(frame as EventFrame);
        break;
      case "req":
        // Server-initiated requests (rare for operator clients)
        // Could be node.invoke — ignore for operator role
        break;
      default:
        break;
    }
  }

  private handleResponse(frame: ResponseFrame): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) return;

    this.pendingRequests.delete(frame.id);
    clearTimeout(pending.timer);

    if (frame.ok) {
      // Check if this is the connect response (hello-ok)
      const payload = frame.payload as Record<string, unknown> | undefined;
      if (payload && payload.type === "hello-ok") {
        this.handleHelloOk(payload as unknown as HelloOk);
      }
      pending.resolve(frame.payload);
    } else {
      const errorShape = frame.error as ErrorShape | undefined;
      if (errorShape) {
        const error = new GatewayError(errorShape);

        // Special handling for NOT_PAIRED during connect
        // Keep connection open and wait for device.pair.resolved
        if (
          errorShape.code === "NOT_PAIRED" &&
          this._connectionState === "connecting"
        ) {
          this.awaitingPairing = true;
          // Emit event so UI can show pairing sheet
          this.emitEvent("pairing.required", {
            deviceId: this.deviceIdentity?.deviceId,
          });
          // Don't reject the connect promise yet - we'll resolve/reject
          // when device.pair.resolved arrives
          return;
        }

        pending.reject(error);
      } else {
        pending.reject(new Error("Request failed"));
      }
    }
  }

  private handleEvent(frame: EventFrame): void {
    const { event, payload, seq } = frame;

    // Sequence gap detection
    if (seq != null) {
      if (this.lastSeq >= 0 && seq > this.lastSeq + 1) {
        this.emitEvent(GatewayEvents.SEQ_GAP, {
          expected: this.lastSeq + 1,
          received: seq,
        });
      }
      this.lastSeq = seq;
    }

    switch (event) {
      case GatewayEvents.CONNECT_CHALLENGE:
        this.handleChallenge(payload as ConnectChallenge);
        break;

      case GatewayEvents.TICK:
        this.handleTick(payload);
        break;

      case GatewayEvents.HEALTH:
        this.healthEventListeners.forEach((cb) => {
          try {
            cb(payload as HealthPayload);
          } catch {
            // Ignore listener errors to avoid breaking event dispatch
          }
        });
        break;

      case GatewayEvents.CHAT:
        this.chatEventListeners.forEach((cb) => {
          try {
            cb(payload as ChatEventPayload);
          } catch {
            // Ignore listener errors to avoid breaking event dispatch
          }
        });
        break;

      case GatewayEvents.AGENT:
        this.agentEventListeners.forEach((cb) => {
          try {
            cb(payload as AgentEventPayload);
          } catch {
            // Ignore listener errors to avoid breaking event dispatch
          }
        });
        break;

      case GatewayEvents.SHUTDOWN:
        // Server is shutting down — expect reconnect
        break;

      case GatewayEvents.DEVICE_PAIR_RESOLVED:
        this.handlePairResolved(
          payload as { deviceId: string; decision: string },
        );
        break;

      default:
        break;
    }

    // Emit to generic listeners
    this.emitEvent(event, payload);
  }

  private handlePairResolved(payload: {
    deviceId: string;
    decision: string;
  }): void {
    // Only act if we're waiting for pairing approval
    if (!this.awaitingPairing) return;

    // Check if this is for our device
    if (
      this.deviceIdentity &&
      payload.deviceId !== this.deviceIdentity.deviceId
    ) {
      return;
    }

    this.awaitingPairing = false;

    if (payload.decision === "approved") {
      // Retry connect now that we're approved
      console.log("[GatewayClient] Device approved, retrying connect...");
      this.sendConnectFrame();
    } else {
      // Rejected - fail the connection
      this.handleConnectFailure(new Error("Device pairing was denied"));
    }
  }

  private handleChallenge(challenge: ConnectChallenge): void {
    this.challengeNonce = challenge.nonce;
    // Now send connect with the nonce included in device identity
    this.sendConnectFrame();
  }

  private handleHelloOk(helloOk: HelloOk): void {
    this.helloOk = helloOk;
    this.reconnectAttempt = 0;
    this.lastSeq = -1;

    // Configure tick interval from policy
    if (helloOk.policy?.tickIntervalMs) {
      this.tickIntervalMs = helloOk.policy.tickIntervalMs;
    }

    this.startTickMonitor();
    this.setConnectionState("connected");

    // Resolve the connect() promise
    if (this.connectPromiseResolve) {
      this.connectPromiseResolve(helloOk);
      this.connectPromiseResolve = null;
      this.connectPromiseReject = null;
    }
  }

  private sendConnectFrame(): void {
    // Call async version - we have identity loaded by now
    this.sendConnectFrameAsync().catch((err) => {
      this.handleConnectFailure(err);
    });
  }

  private async sendConnectFrameAsync(): Promise<void> {
    const { token, password, deviceToken, displayName, appVersion, platform, clientId: configClientId } =
      this.options;

    const clientId = configClientId ?? "openclaw-ios";

    const auth: Record<string, unknown> = {};
    if (deviceToken) auth.deviceToken = deviceToken;
    else if (token) auth.token = token;
    else if (password) auth.token = password; // Gateway expects 'token' field

    // Build device identity object with Ed25519 signature
    let device: WireDeviceIdentity | undefined;
    const identity = this.deviceIdentity;

    if (identity) {
      const clientMode = "ui";
      const role = "operator";
      const scopes = ["operator.read", "operator.write", "operator.admin"];
      const signedAtMs = Date.now();
      const authToken = (auth.token as string) ?? (auth.deviceToken as string);

      // Build signature payload (matches Swift implementation)
      const payload = buildSignaturePayload({
        nonce: this.challengeNonce ?? undefined,
        deviceId: identity.deviceId,
        clientId,
        clientMode,
        role,
        scopes,
        signedAtMs,
        authToken,
      });

      const signature = signPayload(payload, identity);
      const publicKey = publicKeyBase64Url(identity);

      if (signature && publicKey) {
        device = {
          id: identity.deviceId,
          publicKey,
          signature,
          signedAt: signedAtMs,
          nonce: this.challengeNonce ?? undefined,
        };
      }
    }

    const params: ConnectParams = {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: {
        id: clientId,
        version: appVersion ?? "1.0.0",
        platform: platform ?? "ios",
        mode: "ui",
        displayName: displayName ?? "OpenClaw Chat",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      caps: ["talk", "config"],
      commands: [],
      permissions: {},
      auth,
      locale: "en-US",
      userAgent: `expo-openclaw-chat/${appVersion ?? "1.0.0"}`,
      device,
    };

    // Send the connect request frame — this is the FIRST (or challenge-response) req
    const id = this.nextRequestId();

    const timer = setTimeout(() => {
      this.pendingRequests.delete(id);
      this.handleConnectFailure(new Error("Connect handshake timed out"));
    }, 10_000);

    this.pendingRequests.set(id, {
      resolve: (payload) => {
        // hello-ok is handled in handleResponse -> handleHelloOk
        // This just catches the connect response specifically
        const p = payload as Record<string, unknown> | undefined;
        if (p && p.type === "hello-ok") {
          // Already handled in handleResponse
        }
      },
      reject: (err) => {
        this.handleConnectFailure(err);
      },
      timer,
    });

    const frame: RequestFrame = {
      type: "req",
      id,
      method: GatewayMethods.CONNECT,
      params: params as unknown as Record<string, unknown>,
    };

    this.sendFrame(frame);
  }

  private handleConnectFailure(error: Error): void {
    if (this.connectPromiseReject) {
      this.connectPromiseReject(error);
      this.connectPromiseResolve = null;
      this.connectPromiseReject = null;
    }

    this.setConnectionState("disconnected");
  }

  private handleClose(code: number, reason: string): void {
    this.ws = null;
    this.awaitingPairing = false;
    this.clearTickTimer();

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`WebSocket closed: ${code} ${reason}`));
      this.pendingRequests.delete(id);
    }

    if (this.intentionalClose) {
      this.setConnectionState("disconnected");
      return;
    }

    // If we were still in the initial connect(), reject it
    if (this.connectPromiseReject) {
      // Don't reject — we'll try reconnecting
      if (!this.options.autoReconnect) {
        this.handleConnectFailure(
          new Error(`WebSocket closed during connect: ${code} ${reason}`),
        );
        return;
      }
    }

    // Auto-reconnect
    if (this.options.autoReconnect) {
      this.setConnectionState("reconnecting");
      this.scheduleReconnect();
    } else {
      this.setConnectionState("disconnected");
    }
  }

  // ─── Reconnection ──────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const baseDelay = 1_000;
    const maxDelay = 30_000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempt),
      maxDelay,
    );
    // Add jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const finalDelay = Math.round(delay + jitter);

    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, finalDelay);
  }

  private attemptReconnect(): void {
    if (this.intentionalClose) return;

    this.setConnectionState("connecting");
    this.challengeNonce = null;

    // Wrap the reconnect in its own promise tracking
    const prevResolve = this.connectPromiseResolve;

    // Keep original promise callbacks if we're reconnecting from a failed initial connect
    if (!prevResolve) {
      // Just reconnecting after a successful session that dropped
      this.connectPromiseResolve = () => {}; // no-op, state already updated in handleHelloOk
      this.connectPromiseReject = () => {
        // Reconnect failure — try again
        if (!this.intentionalClose && this.options.autoReconnect) {
          this.setConnectionState("reconnecting");
          this.scheduleReconnect();
        }
      };
    }

    this.openWebSocket();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Keepalive / Tick ──────────────────────────────────────────────────────

  private handleTick(_payload: unknown): void {
    this.lastTickReceived = Date.now();
    // Note: Server doesn't expect tick acknowledgment from clients
  }

  private startTickMonitor(): void {
    this.clearTickTimer();
    this.lastTickReceived = Date.now();

    // Check for missed ticks
    const checkInterval = this.tickIntervalMs * 1.5;
    this.tickTimer = setInterval(() => {
      if (!this.isConnected) return;

      const elapsed = Date.now() - this.lastTickReceived;
      const threshold = this.tickIntervalMs * this.missedTickThreshold;

      if (elapsed > threshold) {
        console.warn(
          `[GatewayClient] Missed ${this.missedTickThreshold} ticks, reconnecting...`,
        );
        // Force reconnect
        this.ws?.close(4000, "Tick timeout");
      }
    }, checkInterval) as unknown as ReturnType<typeof setTimeout>;
  }

  private clearTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer as unknown as number);
      this.tickTimer = null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private sendFrame(frame: GatewayFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify(frame));
    } catch {
      // Ignore send errors
    }
  }

  private nextRequestId(): string {
    return `eoc-${++this.requestIdCounter}-${Date.now().toString(36)}`;
  }

  private setConnectionState(state: ConnectionState): void {
    if (this._connectionState === state) return;
    this._connectionState = state;

    this.connectionStateListeners.forEach((cb) => {
      try {
        cb(state);
      } catch {
        // Ignore listener errors to avoid breaking state dispatch
      }
    });
  }

  private emitEvent(eventName: string, payload: unknown): void {
    const listeners = this.eventListeners.get(eventName);
    if (!listeners) return;

    listeners.forEach((cb) => {
      try {
        cb(payload);
      } catch {
        // Ignore listener errors to avoid breaking event dispatch
      }
    });
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────────

/**
 * Generate a unique idempotency key for side-effecting requests.
 */
export function generateIdempotencyKey(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `idem-${ts}-${rand}`;
}
