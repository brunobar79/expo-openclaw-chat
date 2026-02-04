/**
 * Tests for protocol module
 */

import {
  GATEWAY_PROTOCOL_VERSION,
  GatewayEvents,
  GatewayMethods,
  ErrorCode,
} from "../protocol";

describe("protocol", () => {
  describe("GATEWAY_PROTOCOL_VERSION", () => {
    it("is defined and is a positive number", () => {
      expect(GATEWAY_PROTOCOL_VERSION).toBeDefined();
      expect(typeof GATEWAY_PROTOCOL_VERSION).toBe("number");
      expect(GATEWAY_PROTOCOL_VERSION).toBeGreaterThan(0);
    });
  });

  describe("GatewayEvents", () => {
    it("contains expected event names", () => {
      expect(GatewayEvents.CONNECT_CHALLENGE).toBe("connect.challenge");
      expect(GatewayEvents.TICK).toBe("tick");
      expect(GatewayEvents.HEALTH).toBe("health");
      expect(GatewayEvents.CHAT).toBe("chat");
      expect(GatewayEvents.AGENT).toBe("agent");
      expect(GatewayEvents.SHUTDOWN).toBe("shutdown");
      expect(GatewayEvents.SEQ_GAP).toBe("seqGap");
      expect(GatewayEvents.DEVICE_PAIR_RESOLVED).toBe("device.pair.resolved");
    });
  });

  describe("GatewayMethods", () => {
    it("contains expected method names", () => {
      expect(GatewayMethods.CONNECT).toBe("connect");
      expect(GatewayMethods.HEALTH).toBe("health");
      expect(GatewayMethods.CHAT_HISTORY).toBe("chat.history");
      expect(GatewayMethods.CHAT_SEND).toBe("chat.send");
      expect(GatewayMethods.CHAT_ABORT).toBe("chat.abort");
      expect(GatewayMethods.SESSIONS_LIST).toBe("sessions.list");
    });
  });

  describe("ErrorCode", () => {
    it("contains expected error codes", () => {
      expect(ErrorCode.INVALID_REQUEST).toBe("INVALID_REQUEST");
      expect(ErrorCode.NOT_PAIRED).toBe("NOT_PAIRED");
      expect(ErrorCode.NOT_LINKED).toBe("NOT_LINKED");
      expect(ErrorCode.AGENT_TIMEOUT).toBe("AGENT_TIMEOUT");
      expect(ErrorCode.UNAVAILABLE).toBe("UNAVAILABLE");
    });
  });
});
