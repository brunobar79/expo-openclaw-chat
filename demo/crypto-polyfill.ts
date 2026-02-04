/**
 * Crypto polyfill for React Native
 * Must be imported before any crypto libraries (noble/ed25519, noble/hashes)
 */

import * as ExpoCrypto from "expo-crypto";

// Polyfill crypto.getRandomValues for @noble/ed25519
if (typeof globalThis.crypto === "undefined") {
  (globalThis as unknown as { crypto: Partial<Crypto> }).crypto = {};
}

if (typeof globalThis.crypto.getRandomValues === "undefined") {
  globalThis.crypto.getRandomValues = <T extends ArrayBufferView | null>(
    array: T,
  ): T => {
    if (array === null) return array;
    const bytes = ExpoCrypto.getRandomBytes(array.byteLength);
    const view = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    view.set(bytes);
    return array;
  };
}
