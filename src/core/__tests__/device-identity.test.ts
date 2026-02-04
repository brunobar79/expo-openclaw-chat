/**
 * Device Identity tests
 */

import {
  loadOrCreateIdentity,
  signPayload,
  publicKeyBase64Url,
  buildSignaturePayload,
} from "../device-identity";

describe("device-identity", () => {
  describe("loadOrCreateIdentity", () => {
    it("generates a valid identity", () => {
      const identity = loadOrCreateIdentity();

      expect(identity).toBeDefined();
      expect(identity.deviceId).toBeDefined();
      expect(identity.publicKey).toBeDefined();
      expect(identity.privateKey).toBeDefined();
      expect(identity.createdAtMs).toBeGreaterThan(0);

      // Device ID should be a 64-char hex string (SHA256)
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns the same identity on subsequent calls", () => {
      const identity1 = loadOrCreateIdentity();
      const identity2 = loadOrCreateIdentity();

      expect(identity1.deviceId).toBe(identity2.deviceId);
      expect(identity1.publicKey).toBe(identity2.publicKey);
    });
  });

  describe("signPayload", () => {
    it("produces a valid signature", () => {
      const identity = loadOrCreateIdentity();
      const payload = "test-payload";

      const signature = signPayload(payload, identity);

      expect(signature).toBeDefined();
      expect(signature).not.toBeNull();
      // Base64url encoded Ed25519 signature (64 bytes = ~86 chars base64url)
      expect(signature!.length).toBeGreaterThan(80);
    });
  });

  describe("publicKeyBase64Url", () => {
    it("returns base64url encoded public key", () => {
      const identity = loadOrCreateIdentity();

      const pubKey = publicKeyBase64Url(identity);

      expect(pubKey).toBeDefined();
      expect(pubKey).not.toBeNull();
      // Ed25519 public key is 32 bytes = ~43 chars base64url
      expect(pubKey!.length).toBeGreaterThan(40);
    });
  });

  describe("buildSignaturePayload", () => {
    it("builds v1 payload without nonce", () => {
      const payload = buildSignaturePayload({
        deviceId: "device-123",
        clientId: "test-client",
        clientMode: "ui",
        role: "operator",
        scopes: ["read", "write"],
        signedAtMs: 1234567890,
        authToken: "token-abc",
      });

      expect(payload).toBe(
        "v1|device-123|test-client|ui|operator|read,write|1234567890|token-abc",
      );
    });

    it("builds v2 payload with nonce", () => {
      const payload = buildSignaturePayload({
        nonce: "nonce-xyz",
        deviceId: "device-123",
        clientId: "test-client",
        clientMode: "ui",
        role: "operator",
        scopes: ["read", "write"],
        signedAtMs: 1234567890,
        authToken: "token-abc",
      });

      expect(payload).toBe(
        "v2|device-123|test-client|ui|operator|read,write|1234567890|token-abc|nonce-xyz",
      );
    });
  });
});
