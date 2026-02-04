/**
 * createChat - Main entry point for the expo-openclaw-chat SDK
 *
 * Creates a chat instance that can be opened/closed as a modal overlay.
 *
 * @example
 * ```tsx
 * import { createChat } from 'expo-openclaw-chat';
 *
 * const chat = createChat({
 *   gatewayUrl: 'wss://your-gateway.example.com',
 *   token: 'your-auth-token',
 * });
 *
 * // Open the chat modal
 * chat.open();
 *
 * // Close the chat modal
 * chat.close();
 * ```
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { GatewayClient, type GatewayClientOptions, setStorage, type Storage } from "./core";
import { ChatModal } from "./ui/ChatModal";

export interface CreateChatConfig extends GatewayClientOptions {
  /** Gateway WebSocket URL (wss:// or ws://) */
  gatewayUrl: string;
  /** Session key for chat (default: auto-generated) */
  sessionKey?: string;
  /** Modal title */
  title?: string;
  /** Input placeholder text */
  placeholder?: string;
  /** Show image picker button (requires expo-image-picker) */
  showImagePicker?: boolean;
  /** Custom storage for device identity persistence */
  storage?: Storage;
  /** Called when modal opens */
  onOpen?: () => void;
  /** Called when modal closes */
  onClose?: () => void;
}

export interface ChatInstance {
  /** Open the chat modal */
  open: () => void;
  /** Close the chat modal */
  close: () => void;
  /** Get the underlying gateway client */
  getClient: () => GatewayClient;
  /** React component to render (must be mounted in your app) */
  ChatProvider: React.ComponentType<{ children?: React.ReactNode }>;
}

/**
 * Create a chat instance with the given configuration.
 *
 * The returned `ChatProvider` component must be rendered somewhere in your app
 * for the modal to work. Then call `open()` / `close()` to show/hide the chat.
 */
export function createChat(config: CreateChatConfig): ChatInstance {
  const {
    gatewayUrl,
    sessionKey = `chat-${Date.now().toString(36)}`,
    title,
    placeholder,
    showImagePicker,
    storage: customStorage,
    onOpen,
    onClose,
    ...clientOptions
  } = config;

  // Configure custom storage if provided
  if (customStorage) {
    setStorage(customStorage);
  }

  // Create gateway client
  const client = new GatewayClient(gatewayUrl, {
    ...clientOptions,
    autoReconnect: true,
  });

  // Visibility state (shared between hook instances)
  let isVisible = false;
  const listeners = new Set<(visible: boolean) => void>();

  const setVisible = (visible: boolean) => {
    isVisible = visible;
    listeners.forEach((cb) => cb(visible));
    if (visible) {
      onOpen?.();
    } else {
      onClose?.();
    }
  };

  // Chat provider component
  function ChatProvider({ children }: { children?: React.ReactNode }) {
    const [visible, setVisibleState] = useState(isVisible);
    const clientRef = useRef(client);

    // Sync with shared state
    useEffect(() => {
      const listener = (v: boolean) => setVisibleState(v);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);

    const handleClose = useCallback(() => {
      setVisible(false);
    }, []);

    return (
      <>
        {children}
        <ChatModal
          visible={visible}
          onClose={handleClose}
          client={clientRef.current}
          sessionKey={sessionKey}
          title={title}
          placeholder={placeholder}
          showImagePicker={showImagePicker}
        />
      </>
    );
  }

  return {
    open: () => setVisible(true),
    close: () => setVisible(false),
    getClient: () => client,
    ChatProvider,
  };
}
