/**
 * Device Identity - Ed25519 key pair for gateway device authentication
 *
 * Mirrors the Swift implementation in OpenClawKit:
 * - Generates/loads Ed25519 key pair
 * - Device ID = SHA256 hash of public key (hex)
 * - Signs connect payloads for gateway authentication
 */

import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { storage } from "./storage";

// Configure ed25519 to use sync sha512 (avoids crypto.subtle requirement)
ed.hashes.sha512 = (message: Uint8Array): Uint8Array => sha512(message);

const STORAGE_KEY = "openclaw_device_identity";

/**
 * Stored device identity with key pair (internal use only).
 * Not the same as the DeviceIdentity wire format in protocol.ts.
 */
export interface StoredDeviceIdentity {
  deviceId: string;
  publicKey: string; // base64
  privateKey: string; // base64
  createdAtMs: number;
}

/**
 * Load existing device identity or create a new one.
 */
export function loadOrCreateIdentity(): StoredDeviceIdentity {
  try {
    const stored = storage.getString(STORAGE_KEY);
    if (stored) {
      const identity = JSON.parse(stored) as StoredDeviceIdentity;
      if (
        identity.deviceId &&
        identity.publicKey &&
        identity.privateKey &&
        identity.createdAtMs
      ) {
        return identity;
      }
    }
  } catch {
    // Corrupted or missing - regenerate
  }

  const identity = generateIdentity();
  saveIdentity(identity);
  return identity;
}

/**
 * Generate a new Ed25519 key pair and derive device ID.
 */
function generateIdentity(): StoredDeviceIdentity {
  // Generate random secret key (32 bytes)
  const privateKeyBytes = ed.utils.randomSecretKey();

  // Derive public key (sync - uses sha512Sync configured above)
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);

  // Device ID = SHA256 hash of public key (hex string)
  const hash = sha256(publicKeyBytes);
  const deviceId = bytesToHex(hash);

  return {
    deviceId,
    publicKey: base64Encode(publicKeyBytes),
    privateKey: base64Encode(privateKeyBytes),
    createdAtMs: Date.now(),
  };
}

/**
 * Sign a payload string with the device's private key.
 * Returns base64url-encoded signature.
 */
export function signPayload(
  payload: string,
  identity: StoredDeviceIdentity,
): string | null {
  try {
    const privateKeyBytes = base64Decode(identity.privateKey);
    const messageBytes = new TextEncoder().encode(payload);
    // Sync sign - uses sha512Sync configured above
    const signature = ed.sign(messageBytes, privateKeyBytes);
    return base64UrlEncode(signature);
  } catch {
    return null;
  }
}

/**
 * Get public key as base64url string.
 */
export function publicKeyBase64Url(
  identity: StoredDeviceIdentity,
): string | null {
  try {
    const bytes = base64Decode(identity.publicKey);
    return base64UrlEncode(bytes);
  } catch {
    return null;
  }
}

/**
 * Build the signature payload string matching Swift implementation.
 * Format: version|deviceId|clientId|clientMode|role|scopes|signedAt|authToken|nonce?
 */
export function buildSignaturePayload(params: {
  nonce?: string;
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  authToken?: string;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const parts = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.authToken ?? "",
  ];
  if (params.nonce) {
    parts.push(params.nonce);
  }
  return parts.join("|");
}

function saveIdentity(identity: StoredDeviceIdentity): void {
  try {
    storage.set(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Best effort
  }
}

// ─── Encoding Helpers ───────────────────────────────────────────────────────────

function base64Encode(bytes: Uint8Array): string {
  // Use btoa with binary string
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
