/**
 * ChatModal - Modal overlay for the chat SDK
 *
 * Position absolute overlay containing the chat UI.
 * Handles connection lifecycle (connect on open, disconnect on close).
 */

import { useEffect, useCallback, useState, useMemo } from "react";
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatList } from "./ChatList";
import { ChatInput } from "./ChatInput";
import { ChatEngine, type PendingAttachment } from "../chat/engine";
import { GatewayClient, type ConnectionState } from "../core/client";

export interface ChatModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when user requests to close the modal */
  onClose: () => void;
  /** Gateway client instance */
  client: GatewayClient;
  /** Chat engine instance (persists messages across modal open/close) */
  engine: ChatEngine;
  /** Modal title */
  title?: string;
  /** Placeholder for input */
  placeholder?: string;
  /** Show image picker button */
  showImagePicker?: boolean;
}

export function ChatModal({
  visible,
  onClose,
  client,
  engine,
  title = "Chat",
  placeholder,
  showImagePicker,
}: ChatModalProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatEngine["messages"]>(engine.messages);
  const [isStreaming, setIsStreaming] = useState(engine.isStreaming);
  const [connectionState, setConnectionState] = useState<ConnectionState>(client.connectionState);
  const [error, setError] = useState<string | null>(null);
  const [awaitingPairing, setAwaitingPairing] = useState(false);

  // Subscribe to engine updates when modal is visible
  useEffect(() => {
    if (!visible) return;

    // Sync initial state from engine
    setMessages([...engine.messages]);
    setIsStreaming(engine.isStreaming);

    // Subscribe to updates
    const unsubUpdate = engine.on("update", () => {
      setMessages([...engine.messages]);
      setIsStreaming(engine.isStreaming);
    });

    const unsubError = engine.on("error", (err) => {
      // Don't show transient connection errors - they auto-resolve on reconnect
      const msg = err.message.toLowerCase();
      if (msg.includes("websocket closed") || msg.includes("not connected")) {
        return;
      }
      setError(err.message);
    });

    const unsubConnect = engine.on("connect", () => {
      setConnectionState("connected");
      setError(null);
    });

    const unsubDisconnect = engine.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    // Listen to client connection state changes
    const unsubConnectionState = client.onConnectionStateChange((state) => {
      setConnectionState(state);
      if (state === "connected") {
        setError(null);
        setAwaitingPairing(false);
      }
    });

    // Listen for pairing required event
    const handlePairingRequired = () => {
      setAwaitingPairing(true);
      setError(null);
    };
    client.on("pairing.required", handlePairingRequired);

    setConnectionState(client.connectionState);

    // Connect if not already connected or connecting
    if (client.connectionState !== "connected" && client.connectionState !== "connecting") {
      client.connect().catch((err: Error) => {
        setError(err.message);
      });
    }

    return () => {
      unsubUpdate();
      unsubError();
      unsubConnect();
      unsubDisconnect();
      unsubConnectionState();
      client.off("pairing.required", handlePairingRequired);
    };
  }, [visible, client, engine]);

  // Handle send
  const handleSend = useCallback(
    (text: string, attachments?: PendingAttachment[]) => {
      engine.send(text, attachments).catch((err) => {
        setError(err.message);
      });
    },
    [engine],
  );

  // Handle abort
  const handleAbort = useCallback(() => {
    engine.abort();
  }, [engine]);

  // Handle close
  const handleClose = useCallback(() => {
    // Disconnect when closing
    if (client.isConnected) {
      client.disconnect();
    }
    onClose();
  }, [client, onClose]);

  // Connection status indicator
  const statusColor = useMemo(() => {
    switch (connectionState) {
      case "connected":
        return "#34C759";
      case "connecting":
      case "reconnecting":
        return "#FF9500";
      default:
        return "#FF3B30";
    }
  }, [connectionState]);

  const isConnecting = (connectionState === "connecting" || connectionState === "reconnecting") && !awaitingPairing;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Done</Text>
          </Pressable>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}>
              <Text style={styles.errorDismiss}>×</Text>
            </Pressable>
          </View>
        )}

        {/* Content */}
        {awaitingPairing ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#FF9500" />
            <Text style={styles.connectingText}>Awaiting Approval</Text>
            <Text style={styles.pairingSubtext}>
              Please approve this device on the gateway
            </Text>
          </View>
        ) : isConnecting ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        ) : (
          <View style={styles.chatContainer}>
            <ChatList
              messages={messages}
              isStreaming={isStreaming}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No messages yet</Text>
                  <Text style={styles.emptySubtext}>Send a message to start chatting</Text>
                </View>
              }
            />
            <KeyboardStickyView offset={{ closed: insets.bottom }}>
              <ChatInput
                onSend={handleSend}
                onAbort={handleAbort}
                isStreaming={isStreaming}
                placeholder={placeholder}
                disabled={connectionState !== "connected"}
                showImagePicker={showImagePicker}
              />
            </KeyboardStickyView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  chatContainer: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#C6C6C8",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeButtonText: {
    fontSize: 17,
    color: "#007AFF",
    fontWeight: "600",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFE5E5",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#FF3B30",
  },
  errorDismiss: {
    fontSize: 20,
    color: "#FF3B30",
    fontWeight: "bold",
    paddingLeft: 12,
  },
  connectingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  connectingText: {
    fontSize: 16,
    color: "#8E8E93",
  },
  pairingSubtext: {
    fontSize: 14,
    color: "#AEAEB2",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#8E8E93",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#AEAEB2",
    marginTop: 4,
  },
});
