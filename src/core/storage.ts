/**
 * Storage abstraction for device identity persistence.
 *
 * By default uses in-memory storage (device identity regenerates on restart).
 * Call setStorage() with your own MMKV instance for persistent identity.
 */

export interface Storage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

// In-memory fallback storage
const memoryStorage = new Map<string, string>();

const inMemoryStorage: Storage = {
  getString: (key) => memoryStorage.get(key),
  set: (key, value) => memoryStorage.set(key, value),
};

// Current storage instance (can be swapped via setStorage)
let currentStorage: Storage = inMemoryStorage;

/**
 * Set the storage backend for device identity persistence.
 * Call this early in your app lifecycle with your MMKV instance.
 *
 * @example
 * import { setStorage } from 'expo-openclaw-chat/core';
 * import { storage } from './storage'; // your MMKV instance
 * setStorage(storage);
 */
export function setStorage(storageImpl: Storage): void {
  currentStorage = storageImpl;
}

/**
 * Get the current storage instance.
 */
export const storage: Storage = {
  getString: (key) => currentStorage.getString(key),
  set: (key, value) => currentStorage.set(key, value),
};
