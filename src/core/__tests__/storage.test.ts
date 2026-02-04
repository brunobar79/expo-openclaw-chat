/**
 * Tests for storage module
 */

import { storage, setStorage, type Storage } from "../storage";

describe("storage", () => {
  beforeEach(() => {
    // Reset storage state before each test
  });

  afterEach(() => {
    // Reset to in-memory storage by setting a fresh one
    const memoryStorage = new Map<string, string>();
    setStorage({
      getString: (key) => memoryStorage.get(key),
      set: (key, value) => memoryStorage.set(key, value),
    });
  });

  describe("default in-memory storage", () => {
    it("stores and retrieves values", () => {
      storage.set("test-key", "test-value");
      expect(storage.getString("test-key")).toBe("test-value");
    });

    it("returns undefined for missing keys", () => {
      expect(storage.getString("nonexistent")).toBeUndefined();
    });

    it("overwrites existing values", () => {
      storage.set("key", "value1");
      storage.set("key", "value2");
      expect(storage.getString("key")).toBe("value2");
    });
  });

  describe("setStorage", () => {
    it("replaces the storage backend", () => {
      const customStorage = new Map<string, string>();
      const mockStorage: Storage = {
        getString: jest.fn((key) => customStorage.get(key)),
        set: jest.fn((key, value) => customStorage.set(key, value)),
      };

      setStorage(mockStorage);

      storage.set("custom-key", "custom-value");
      expect(mockStorage.set).toHaveBeenCalledWith("custom-key", "custom-value");

      storage.getString("custom-key");
      expect(mockStorage.getString).toHaveBeenCalledWith("custom-key");
    });

    it("allows switching between storage backends", () => {
      // Use custom storage
      const customMap = new Map<string, string>();
      setStorage({
        getString: (key) => customMap.get(key),
        set: (key, value) => customMap.set(key, value),
      });

      storage.set("key1", "value1");
      expect(storage.getString("key1")).toBe("value1");

      // Switch to another storage
      const anotherMap = new Map<string, string>();
      setStorage({
        getString: (key) => anotherMap.get(key),
        set: (key, value) => anotherMap.set(key, value),
      });

      // Old value should not be accessible
      expect(storage.getString("key1")).toBeUndefined();

      // New storage works
      storage.set("key2", "value2");
      expect(storage.getString("key2")).toBe("value2");
    });
  });
});
