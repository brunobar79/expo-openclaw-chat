/**
 * Demo app for expo-openclaw-chat SDK
 *
 * Shows how to integrate the chat SDK into an Expo app.
 */

import { useState, useRef, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { createChat, type ChatInstance } from "expo-openclaw-chat";

export default function App() {
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [configured, setConfigured] = useState(false);

  // Store chat instance in ref to prevent re-creation on renders
  const chatRef = useRef<ChatInstance | null>(null);

  const handleConfigure = useCallback(() => {
    if (!gatewayUrl.trim()) return;

    // Create chat instance only once when configuring
    chatRef.current = createChat({
      gatewayUrl,
      password: token,
      title: "Demo Chat",
      placeholder: "Ask me anything...",
    });
    setConfigured(true);
  }, [gatewayUrl, token]);

  const handleOpenChat = useCallback(() => {
    chatRef.current?.open();
  }, []);

  const handleReset = useCallback(() => {
    chatRef.current = null;
    setConfigured(false);
    setGatewayUrl("");
    setToken("");
  }, []);

  // Wrap with ChatProvider if configured
  const content = (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Text style={styles.title}>expo-openclaw-chat</Text>
          <Text style={styles.subtitle}>🦞 Demo App 🦞</Text>
        </View>

        <View style={styles.mainContent}>
          {!configured ? (
            <View style={styles.configSection}>
              <Text style={styles.label}>Gateway URL</Text>
              <TextInput
                style={styles.input}
                value={gatewayUrl}
                onChangeText={setGatewayUrl}
                placeholder="wss://your-gateway.example.com"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <Text style={styles.label}>Auth Token (optional)</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="your-auth-token"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              <Pressable
                style={[
                  styles.button,
                  !gatewayUrl.trim() && styles.buttonDisabled,
                ]}
                onPress={handleConfigure}
                disabled={!gatewayUrl.trim()}
              >
                <Text style={styles.buttonText}>Configure</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.configuredSection}>
              <Text style={styles.connectedText}>Gateway configured</Text>
              <Text style={styles.urlText} numberOfLines={1}>
                {gatewayUrl}
              </Text>

              <Pressable style={styles.button} onPress={handleOpenChat}>
                <Text style={styles.buttonText}>Open Chat</Text>
              </Pressable>

              <Pressable style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>Reset Configuration</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            This demo shows how to use the expo-openclaw-chat SDK. Configure
            your gateway URL and tap "Open Chat" to start.
          </Text>
        </View>
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );

  // Wrap with ChatProvider if we have a configured chat
  const ChatProvider = chatRef.current?.ChatProvider;
  if (ChatProvider) {
    return <ChatProvider>{content}</ChatProvider>;
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#000",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
  },
  mainContent: {
    flex: 1,
    justifyContent: "center",
  },
  configSection: {
    paddingHorizontal: 24,
    gap: 8,
  },
  configuredSection: {
    paddingHorizontal: 24,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 8,
  },
  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  button: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: "#C7C7CC",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
  },
  connectedText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#34C759",
    textAlign: "center",
  },
  urlText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  resetButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#FF3B30",
    fontSize: 15,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 18,
  },
});
