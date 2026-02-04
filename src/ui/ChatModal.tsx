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
  SafeAreaView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
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
  /** Session key for chat */
  sessionKey: string;
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
  sessionKey,
  title = "Chat",
  placeholder,
  showImagePicker,
}: ChatModalProps) {
  const [engine, setEngine] = useState<ChatEngine | null>(null);
  const [messages, setMessages] = useState<ChatEngine["messages"]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [awaitingPairing, setAwaitingPairing] = useState(false);

  // Create/destroy engine when modal opens/closes
  useEffect(() => {
    if (!visible) {
      // Clean up engine when modal closes
      if (engine) {
        engine.destroy();
        setEngine(null);
      }
      return;
    }

    // Create new engine when modal opens
    const newEngine = new ChatEngine(client, sessionKey);

    // Subscribe to updates
    const unsubUpdate = newEngine.on("update", () => {
      setMessages([...newEngine.messages]);
      setIsStreaming(newEngine.isStreaming);
    });

    const unsubError = newEngine.on("error", (err) => {
      setError(err.message);
    });

    const unsubConnect = newEngine.on("connect", () => {
      setConnectionState("connected");
      setError(null);
    });

    const unsubDisconnect = newEngine.on("disconnect", () => {
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

    setEngine(newEngine);
    setConnectionState(client.connectionState);

    // Connect only if fully disconnected
    if (client.connectionState === "disconnected") {
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
      newEngine.destroy();
    };
  }, [visible, client, sessionKey]);

  // Handle send
  const handleSend = useCallback(
    (text: string, attachments?: PendingAttachment[]) => {
      if (!engine) return;
      engine.send(text, attachments).catch((err) => {
        setError(err.message);
      });
    },
    [engine],
  );

  // Handle abort
  const handleAbort = useCallback(() => {
    if (!engine) return;
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
      <SafeAreaView style={styles.container}>
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
          <>
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
            <ChatInput
              onSend={handleSend}
              onAbort={handleAbort}
              isStreaming={isStreaming}
              placeholder={placeholder}
              disabled={connectionState !== "connected"}
              showImagePicker={showImagePicker}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
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
