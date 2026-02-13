/**
 * Tests for ChatEngine
 */

import { ChatEngine, type PendingAttachment } from "../engine";
import type { GatewayClient } from "../../core/client";
import type { ChatEventPayload } from "../../core/protocol";

// Mock client type with test helpers
type MockGatewayClient = GatewayClient & {
  _emitConnectionState: (state: string) => void;
  _emitChatEvent: (payload: ChatEventPayload) => void;
};

// Mock GatewayClient
function createMockClient(
  overrides: Partial<GatewayClient> = {},
): MockGatewayClient {
  const connectionStateListeners = new Set<(state: string) => void>();
  const chatEventListeners = new Set<(payload: ChatEventPayload) => void>();

  return {
    isConnected: true,
    connectionState: "connected",
    serverInfo: null,

    onConnectionStateChange: jest.fn((cb) => {
      connectionStateListeners.add(cb);
      return () => connectionStateListeners.delete(cb);
    }),

    onChatEvent: jest.fn((cb) => {
      chatEventListeners.add(cb);
      return () => chatEventListeners.delete(cb);
    }),

    chatSubscribe: jest.fn(),
    chatSend: jest.fn().mockResolvedValue({ runId: "test-run-id" }),
    chatAbort: jest.fn().mockResolvedValue(undefined),

    // Test helpers
    _emitConnectionState: (state: string) => {
      connectionStateListeners.forEach((cb) => cb(state));
    },
    _emitChatEvent: (payload: ChatEventPayload) => {
      chatEventListeners.forEach((cb) => cb(payload));
    },

    ...overrides,
  } as unknown as MockGatewayClient;
}

describe("ChatEngine", () => {
  let mockClient: MockGatewayClient;
  let engine: ChatEngine;

  beforeEach(() => {
    mockClient = createMockClient();
    engine = new ChatEngine(
      mockClient as unknown as GatewayClient,
      "test-session",
    );
  });

  afterEach(() => {
    engine.destroy();
  });

  describe("constructor", () => {
    it("initializes with empty messages", () => {
      expect(engine.messages).toEqual([]);
      expect(engine.isStreaming).toBe(false);
      expect(engine.error).toBeNull();
    });

    it("subscribes to chat events for the session", () => {
      expect(mockClient.chatSubscribe).toHaveBeenCalledWith("test-session");
    });
  });

  describe("send", () => {
    it("adds a user message to the list", async () => {
      await engine.send("Hello, world!");

      expect(engine.messages.length).toBe(2); // user + assistant placeholder
      const userMessage = engine.messages[0];
      expect(userMessage).toBeDefined();
      expect(userMessage!.role).toBe("user");
      expect(userMessage!.content).toEqual([
        { type: "text", text: "Hello, world!" },
      ]);
    });

    it("calls chatSend on the client", async () => {
      await engine.send("Test message");

      expect(mockClient.chatSend).toHaveBeenCalledWith(
        "test-session",
        "Test message",
        expect.objectContaining({
          idempotencyKey: expect.any(String),
        }),
      );
    });

    it("does not send empty messages", async () => {
      await engine.send("");
      await engine.send("   ");

      expect(mockClient.chatSend).not.toHaveBeenCalled();
      expect(engine.messages).toEqual([]);
    });

    it("handles attachments", async () => {
      const attachments: PendingAttachment[] = [
        {
          id: "img-1",
          fileName: "test.jpg",
          mimeType: "image/jpeg",
          content: "base64data",
          type: "image",
        },
      ];

      await engine.send("With image", attachments);

      const message = engine.messages[0];
      expect(message).toBeDefined();
      expect(message!.content.length).toBe(2); // image + text
      expect(message!.content[0]!.type).toBe("image");
    });

    it("sets error when not connected", async () => {
      const disconnectedClient = createMockClient({ isConnected: false });
      const disconnectedEngine = new ChatEngine(
        disconnectedClient as unknown as GatewayClient,
        "test-session",
      );

      await disconnectedEngine.send("Test");

      expect(disconnectedEngine.error).not.toBeNull();
      expect(disconnectedEngine.error?.message).toBe("Not connected");

      disconnectedEngine.destroy();
    });
  });

  describe("abort", () => {
    it("calls chatAbort on the client", async () => {
      await engine.send("Test");
      await engine.abort();

      expect(mockClient.chatAbort).toHaveBeenCalled();
    });

    it("does nothing when not streaming", async () => {
      await engine.abort();

      expect(mockClient.chatAbort).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("removes all messages", async () => {
      await engine.send("Message 1");
      engine.clear();

      expect(engine.messages).toEqual([]);
      expect(engine.isStreaming).toBe(false);
    });
  });

  describe("event handling", () => {
    it("handles delta events", async () => {
      await engine.send("Test");

      // Simulate streaming delta
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Partial response" }],
        },
      } as ChatEventPayload);

      // Wait for flush timer
      await new Promise((resolve) => setTimeout(resolve, 300));

      const assistantMsg = engine.messages.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.isStreaming).toBe(true);
    });

    it("handles complete events", async () => {
      await engine.send("Test");

      // Simulate complete
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "complete",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Final response" }],
        },
      } as ChatEventPayload);

      const assistantMsg = engine.messages.find((m) => m.role === "assistant");
      expect(assistantMsg?.isStreaming).toBe(false);
      expect(engine.isStreaming).toBe(false);
    });

    it("handles error events", async () => {
      await engine.send("Test");

      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "error",
        errorMessage: "Something went wrong",
      } as ChatEventPayload);

      expect(engine.error?.message).toBe("Something went wrong");
      expect(engine.isStreaming).toBe(false);
    });

    it("ignores events for other sessions", async () => {
      await engine.send("Test");

      mockClient._emitChatEvent({
        runId: "other-run-id",
        sessionKey: "other-session",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Wrong session" }],
        },
      } as ChatEventPayload);

      // Should only have user message + placeholder
      expect(engine.messages.length).toBe(2);
    });
  });

  describe("event subscriptions", () => {
    it("notifies update listeners", async () => {
      const updates: number[] = [];
      engine.on("update", () => updates.push(engine.messages.length));

      await engine.send("Test");

      expect(updates.length).toBeGreaterThan(0);
    });

    it("notifies error listeners", async () => {
      const errors: Error[] = [];
      engine.on("error", (err) => errors.push(err));

      // Trigger an error
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "error",
        errorMessage: "Test error",
      } as ChatEventPayload);

      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toBe("Test error");
    });

    it("allows unsubscribing", () => {
      const updates: number[] = [];
      const unsub = engine.on("update", () => updates.push(1));

      unsub();
      engine.clear();

      expect(updates).toEqual([]);
    });
  });

  describe("destroy", () => {
    it("cleans up subscriptions", () => {
      const updates: number[] = [];
      engine.on("update", () => updates.push(1));

      engine.destroy();
      engine.clear(); // This would normally trigger update

      expect(updates).toEqual([]);
    });
  });

  describe("aborted events", () => {
    it("marks streaming messages as not streaming on abort", async () => {
      await engine.send("Test");

      // Simulate delta first
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Partial" }],
        },
      } as ChatEventPayload);

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Now abort
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "aborted",
      } as ChatEventPayload);

      const assistantMsg = engine.messages.find((m) => m.role === "assistant");
      expect(assistantMsg?.isStreaming).toBe(false);
      expect(engine.isStreaming).toBe(false);
    });
  });

  describe("silent reply filtering", () => {
    it("filters out NO_REPLY complete messages", async () => {
      await engine.send("Test");

      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "complete",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "NO_REPLY" }],
        },
      } as ChatEventPayload);

      // Should only have user message, no assistant message
      const assistantMessages = engine.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages).toEqual([]);
    });

    it("filters out HEARTBEAT_OK complete messages", async () => {
      await engine.send("Test");

      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "complete",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "HEARTBEAT_OK" }],
        },
      } as ChatEventPayload);

      const assistantMessages = engine.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages).toEqual([]);
    });

    it("filters out partial NO_REPL during streaming flush", async () => {
      await engine.send("Test");

      // Simulate a streaming delta with a partial silent prefix
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "NO_REPL" }],
        },
      } as ChatEventPayload);

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Silent streaming messages should be filtered out during flush
      const assistantMessages = engine.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages).toEqual([]);
    });

    it("keeps normal messages through complete", async () => {
      await engine.send("Test");

      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "complete",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello! How can I help?" }],
        },
      } as ChatEventPayload);

      const assistantMessages = engine.messages.filter(
        (m) => m.role === "assistant",
      );
      expect(assistantMessages.length).toBe(1);
      expect(assistantMessages[0]!.content[0]).toEqual({
        type: "text",
        text: "Hello! How can I help?",
      });
    });
  });

  describe("content filtering", () => {
    it("filters out toolCall and toolResult blocks on complete", async () => {
      await engine.send("Test");

      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "complete",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "The answer is 42." },
            { type: "toolCall", name: "calculator", arguments: { expr: "6*7" } },
            { type: "toolResult", content: "42" },
            { type: "thinking", thinking: "Let me think..." },
          ],
        },
      } as ChatEventPayload);

      const assistantMsg = engine.messages.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();
      // Should keep text and thinking, filter out toolCall and toolResult
      expect(assistantMsg!.content.length).toBe(2);
      expect(assistantMsg!.content[0]!.type).toBe("text");
      expect(assistantMsg!.content[1]!.type).toBe("thinking");
    });
  });

  describe("complete event without message", () => {
    it("marks existing streaming messages as complete", async () => {
      await engine.send("Test");

      // Simulate delta first
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Streaming..." }],
        },
      } as ChatEventPayload);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Complete with no message
      mockClient._emitChatEvent({
        runId: "test-run-id",
        sessionKey: "test-session",
        state: "complete",
      } as ChatEventPayload);

      const assistantMsg = engine.messages.find((m) => m.role === "assistant");
      expect(assistantMsg?.isStreaming).toBe(false);
      expect(engine.isStreaming).toBe(false);
    });
  });

  describe("connection state events", () => {
    it("fires connect event when client connects", () => {
      const connects: number[] = [];
      engine.on("connect", () => connects.push(1));

      mockClient._emitConnectionState("connected");

      expect(connects.length).toBe(1);
    });

    it("fires disconnect event when client disconnects", () => {
      const disconnects: number[] = [];
      engine.on("disconnect", () => disconnects.push(1));

      mockClient._emitConnectionState("disconnected");

      expect(disconnects.length).toBe(1);
    });
  });

  describe("send error handling", () => {
    it("handles chatSend rejection", async () => {
      const errors: Error[] = [];
      engine.on("error", (err) => errors.push(err));

      // Make chatSend reject
      (mockClient.chatSend as jest.Mock).mockRejectedValueOnce(
        new Error("Network error"),
      );

      await engine.send("Test");

      expect(engine.isStreaming).toBe(false);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toBe("Network error");
    });
  });
});
