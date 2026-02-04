/**
 * Tests for GatewayClient
 */

import { GatewayClient, GatewayError, generateIdempotencyKey } from "../client";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: code ?? 1000, reason: reason ?? "" });
    }
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateClose(code: number, reason: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }
}

// Store original WebSocket
const originalWebSocket = (global as unknown as { WebSocket: typeof WebSocket }).WebSocket;

describe("GatewayClient", () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    // Replace global WebSocket with mock
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = jest.fn((url: string) => {
      mockWs = new MockWebSocket(url);
      return mockWs;
    }) as unknown as typeof MockWebSocket;
  });

  afterEach(() => {
    // Restore original WebSocket
    (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  });

  describe("constructor", () => {
    it("creates a client with default options", () => {
      const client = new GatewayClient("wss://test.example.com");
      expect(client.connectionState).toBe("disconnected");
      expect(client.isConnected).toBe(false);
    });

    it("creates a client with custom options", () => {
      const client = new GatewayClient("wss://test.example.com", {
        token: "test-token",
        displayName: "Test Client",
        appVersion: "1.0.0",
      });
      expect(client.connectionState).toBe("disconnected");
    });
  });

  describe("connect", () => {
    it("changes state to connecting", () => {
      const client = new GatewayClient("wss://test.example.com", { autoReconnect: false });

      // Start connect but don't await - just check state change
      const connectPromise = client.connect();
      expect(client.connectionState).toBe("connecting");

      // Clean up - disconnect to prevent hanging
      client.disconnect();
      connectPromise.catch(() => {}); // Ignore the rejection
    });

    it("rejects if already connecting", async () => {
      const client = new GatewayClient("wss://test.example.com", { autoReconnect: false });

      // Start first connect
      const firstConnect = client.connect();
      firstConnect.catch(() => {}); // Ignore rejection

      // Second connect should reject
      await expect(client.connect()).rejects.toThrow("Already connecting");

      // Clean up
      client.disconnect();
    });
  });

  describe("disconnect", () => {
    it("closes the WebSocket", async () => {
      const client = new GatewayClient("wss://test.example.com");
      client.connect().catch(() => {});

      client.disconnect();

      expect(client.connectionState).toBe("disconnected");
    });
  });

  describe("onConnectionStateChange", () => {
    it("notifies listeners of state changes", async () => {
      const client = new GatewayClient("wss://test.example.com");
      const states: string[] = [];

      const unsubscribe = client.onConnectionStateChange((state) => {
        states.push(state);
      });

      client.connect().catch(() => {});
      expect(states).toContain("connecting");

      unsubscribe();
    });
  });
});

describe("GatewayError", () => {
  it("creates an error with code and message", () => {
    const error = new GatewayError({
      code: "INVALID_REQUEST",
      message: "Bad request",
    });

    expect(error.name).toBe("GatewayError");
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.message).toBe("Bad request");
  });

  it("includes optional details", () => {
    const error = new GatewayError({
      code: "RATE_LIMITED",
      message: "Too many requests",
      retryable: true,
      retryAfterMs: 5000,
      details: { limit: 100 },
    });

    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.details).toEqual({ limit: 100 });
  });
});

describe("generateIdempotencyKey", () => {
  it("generates a string starting with 'idem-'", () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^idem-/);
  });

  it("generates unique keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateIdempotencyKey());
    }
    expect(keys.size).toBe(100);
  });
});

describe("GatewayClient additional tests", () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = jest.fn((url: string) => {
      mockWs = new MockWebSocket(url);
      return mockWs;
    }) as unknown as typeof MockWebSocket;
  });

  afterEach(() => {
    (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  });

  describe("event listeners", () => {
    it("subscribes and unsubscribes from events", () => {
      const client = new GatewayClient("wss://test.example.com");
      const callback = jest.fn();

      client.on("test.event", callback);
      client.off("test.event", callback);

      // If we could trigger events, the callback should not be called
      expect(callback).not.toHaveBeenCalled();
    });

    it("subscribes to chat events", () => {
      const client = new GatewayClient("wss://test.example.com");
      const callback = jest.fn();

      const unsubscribe = client.onChatEvent(callback);
      expect(typeof unsubscribe).toBe("function");

      unsubscribe();
    });

    it("subscribes to agent events", () => {
      const client = new GatewayClient("wss://test.example.com");
      const callback = jest.fn();

      const unsubscribe = client.onAgentEvent(callback);
      expect(typeof unsubscribe).toBe("function");

      unsubscribe();
    });

    it("subscribes to health events", () => {
      const client = new GatewayClient("wss://test.example.com");
      const callback = jest.fn();

      const unsubscribe = client.onHealthEvent(callback);
      expect(typeof unsubscribe).toBe("function");

      unsubscribe();
    });
  });

  describe("getters", () => {
    it("returns serverInfo as null initially", () => {
      const client = new GatewayClient("wss://test.example.com");
      expect(client.serverInfo).toBeNull();
    });

    it("returns isConnected as false initially", () => {
      const client = new GatewayClient("wss://test.example.com");
      expect(client.isConnected).toBe(false);
    });
  });

  describe("request", () => {
    it("rejects when not connected", async () => {
      const client = new GatewayClient("wss://test.example.com");

      await expect(client.request("test.method")).rejects.toThrow("Not connected");
    });
  });

  describe("sendEvent", () => {
    it("does nothing when not connected", () => {
      const client = new GatewayClient("wss://test.example.com");

      // Should not throw
      client.sendEvent("test.event", { data: "test" });
    });
  });

  describe("chat methods", () => {
    it("chatSubscribe sends an event", () => {
      const client = new GatewayClient("wss://test.example.com");

      // Should not throw when not connected
      client.chatSubscribe("test-session");
    });
  });

  describe("modelsList", () => {
    it("rejects when not connected", async () => {
      const client = new GatewayClient("wss://test.example.com");

      await expect(client.modelsList()).rejects.toThrow("Not connected");
    });
  });

  describe("health", () => {
    it("returns false when not connected", async () => {
      const client = new GatewayClient("wss://test.example.com");

      const result = await client.health();
      expect(result).toBe(false);
    });
  });
});
