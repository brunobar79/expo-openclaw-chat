/**
 * Device Identity tests
 */

import {
  loadOrCreateIdentity,
  loadOrCreateIdentityAsync,
  signPayload,
  publicKeyBase64Url,
  buildSignaturePayload,
} from "../device-identity";
import { setStorage } from "../storage";

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

    it("builds v1 payload with empty authToken when not provided", () => {
      const payload = buildSignaturePayload({
        deviceId: "device-123",
        clientId: "test-client",
        clientMode: "ui",
        role: "operator",
        scopes: ["admin"],
        signedAtMs: 1000,
      });

      expect(payload).toBe(
        "v1|device-123|test-client|ui|operator|admin|1000|",
      );
    });
  });

  describe("loadOrCreateIdentityAsync", () => {
    beforeEach(() => {
      // Reset storage between tests
      const mem = new Map<string, string>();
      setStorage({
        getString: (key) => mem.get(key),
        set: (key, value) => mem.set(key, value),
      });
    });

    it("falls back to sync version when SecureStore is unavailable", async () => {
      const identity = await loadOrCreateIdentityAsync();

      expect(identity).toBeDefined();
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
      expect(identity.publicKey).toBeDefined();
      expect(identity.privateKey).toBeDefined();
      expect(identity.createdAtMs).toBeGreaterThan(0);
    });

    it("returns the same identity on repeated calls (fallback path)", async () => {
      const id1 = await loadOrCreateIdentityAsync();
      const id2 = await loadOrCreateIdentityAsync();

      expect(id1.deviceId).toBe(id2.deviceId);
      expect(id1.publicKey).toBe(id2.publicKey);
    });

    it("generates identity with valid crypto properties", async () => {
      const identity = await loadOrCreateIdentityAsync();

      // Verify the identity can produce valid signatures
      const sig = signPayload("test", identity);
      expect(sig).not.toBeNull();

      // Verify public key encoding
      const pubKey = publicKeyBase64Url(identity);
      expect(pubKey).not.toBeNull();
      // Base64url should not contain +, /, or =
      expect(pubKey).not.toMatch(/[+/=]/);
    });
  });

  describe("signPayload edge cases", () => {
    it("signs empty string payload", () => {
      const identity = loadOrCreateIdentity();
      const sig = signPayload("", identity);
      expect(sig).not.toBeNull();
      expect(sig!.length).toBeGreaterThan(0);
    });

    it("returns null for invalid private key", () => {
      const badIdentity = {
        deviceId: "fake",
        publicKey: "not-valid-base64!!!",
        privateKey: "not-valid-base64!!!",
        createdAtMs: Date.now(),
      };
      const sig = signPayload("test", badIdentity);
      expect(sig).toBeNull();
    });

    it("produces different signatures for different payloads", () => {
      const identity = loadOrCreateIdentity();
      const sig1 = signPayload("payload-a", identity);
      const sig2 = signPayload("payload-b", identity);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("publicKeyBase64Url edge cases", () => {
    it("returns null for invalid public key", () => {
      const badIdentity = {
        deviceId: "fake",
        publicKey: "not-valid!!!",
        privateKey: "whatever",
        createdAtMs: Date.now(),
      };
      const result = publicKeyBase64Url(badIdentity);
      expect(result).toBeNull();
    });
  });
});
