/**
 * ChatInput - Text input with send button for the chat SDK
 *
 * Simple input field with send/abort button.
 * Optional image picker support if expo-image-picker is installed.
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
} from "react-native";
import type { PendingAttachment } from "../chat/engine";

// Try to import image picker (optional dep)
let ImagePicker: {
  launchImageLibraryAsync: (options: {
    mediaTypes: string[];
    allowsMultipleSelection: boolean;
    quality: number;
    base64: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: Array<{
      uri: string;
      fileName?: string;
      mimeType?: string;
      base64?: string;
    }>;
  }>;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require("expo-image-picker");
} catch {
  // Not installed - image picker won't be available
}

export interface ChatInputProps {
  onSend: (text: string, attachments?: PendingAttachment[]) => void;
  onAbort?: () => void;
  isStreaming?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Show image picker button (requires expo-image-picker) */
  showImagePicker?: boolean;
}

export const ChatInput = React.memo(function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  placeholder = "Type a message...",
  disabled,
  showImagePicker = true,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const canSend = text.trim().length > 0 || attachments.length > 0;
  const showPickerButton = showImagePicker && ImagePicker != null;

  const handleSend = useCallback(() => {
    if (!canSend || disabled) return;
    onSend(text.trim(), attachments.length > 0 ? attachments : undefined);
    setText("");
    setAttachments([]);
  }, [text, attachments, canSend, disabled, onSend]);

  const handleAbort = useCallback(() => {
    onAbort?.();
  }, [onAbort]);

  const handlePickImage = useCallback(async () => {
    if (!ImagePicker) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets) {
        const newAttachments: PendingAttachment[] = result.assets
          .filter((asset) => asset.base64)
          .map((asset) => ({
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: asset.fileName ?? "image.jpg",
            mimeType: asset.mimeType ?? "image/jpeg",
            content: asset.base64!,
            type: "image" as const,
          }));

        setAttachments((prev: PendingAttachment[]) => [...prev, ...newAttachments]);
      }
    } catch (err) {
      console.warn("[ChatInput] Image picker error:", err);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev: PendingAttachment[]) => prev.filter((a: PendingAttachment) => a.id !== id));
  }, []);

  const inputContainerStyle = useMemo(
    () => [styles.inputContainer, disabled && styles.inputContainerDisabled],
    [disabled],
  );

  return (
    <View style={styles.container}>
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentsContainer}
          contentContainerStyle={styles.attachmentsContent}
        >
          {attachments.map((att: PendingAttachment) => (
            <View key={att.id} style={styles.attachmentPreview}>
              <Image
                source={{ uri: `data:${att.mimeType};base64,${att.content}` }}
                style={styles.attachmentImage}
              />
              <Pressable
                onPress={() => removeAttachment(att.id)}
                style={styles.removeButton}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        {/* Image picker button */}
        {showPickerButton && !isStreaming && (
          <Pressable
            onPress={handlePickImage}
            style={styles.iconButton}
            disabled={disabled}
          >
            <Text style={styles.iconButtonText}>📷</Text>
          </Pressable>
        )}

        {/* Text input */}
        <View style={inputContainerStyle}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#8E8E93"
            multiline
            maxLength={10000}
            editable={!disabled && !isStreaming}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
        </View>

        {/* Send/Abort button */}
        {isStreaming ? (
          <Pressable onPress={handleAbort} style={styles.abortButton}>
            <Text style={styles.abortButtonText}>■</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            disabled={!canSend || disabled}
          >
            <Text
              style={[
                styles.sendButtonText,
                !canSend && styles.sendButtonTextDisabled,
              ]}
            >
              ↑
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#C6C6C8",
    backgroundColor: "#F2F2F7",
    paddingBottom: Platform.OS === "ios" ? 34 : 8,
  },
  attachmentsContainer: {
    maxHeight: 80,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#C6C6C8",
  },
  attachmentsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  attachmentPreview: {
    position: "relative",
    marginRight: 8,
  },
  attachmentImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonText: {
    fontSize: 20,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C6C6C8",
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
    maxHeight: 120,
  },
  inputContainerDisabled: {
    backgroundColor: "#E5E5EA",
  },
  input: {
    fontSize: 16,
    color: "#000000",
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#C6C6C8",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  sendButtonTextDisabled: {
    color: "#8E8E93",
  },
  abortButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  abortButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
});
