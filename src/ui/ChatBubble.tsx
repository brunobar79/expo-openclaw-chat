/**
 * ChatBubble - Simple message bubble for the chat SDK
 *
 * Renders text messages with optional markdown support (if react-native-marked installed).
 * Keeps dependencies minimal for a dev tool.
 */

import React, { useMemo, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, Animated } from "react-native";
import type { UIMessage } from "../chat/engine";
import type { ChatMessageContent } from "../core/protocol";

// Animated typing dots component
const TypingDots = React.memo(function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );

    const anim1 = createAnimation(dot1, 0);
    const anim2 = createAnimation(dot2, 150);
    const anim3 = createAnimation(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.3],
        }),
      },
    ],
  });

  return (
    <View style={typingStyles.container}>
      <Animated.Text style={[typingStyles.dot, dotStyle(dot1)]}>●</Animated.Text>
      <Animated.Text style={[typingStyles.dot, dotStyle(dot2)]}>●</Animated.Text>
      <Animated.Text style={[typingStyles.dot, dotStyle(dot3)]}>●</Animated.Text>
    </View>
  );
});

const typingStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    color: "#8E8E93",
    fontSize: 12,
  },
});

// Try to import markdown renderer (optional dep)
let Markdown: React.ComponentType<{ value: string; flatListProps?: null }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Markdown = require("react-native-marked").default;
} catch {
  // Not installed - will use plain text
}

export interface ChatBubbleProps {
  message: UIMessage;
  isStreaming?: boolean;
}

export const ChatBubble = React.memo(function ChatBubble({
  message,
  isStreaming,
}: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isError = message.isError;

  // Extract text and images from content blocks
  const { textContent, images } = useMemo(() => {
    let text = "";
    const imgs: string[] = [];

    for (const block of message.content) {
      if (block.type === "text") {
        text += (block as { type: "text"; text: string }).text;
      } else if (block.type === "image") {
        const imgBlock = block as ChatMessageContent & {
          source?: { type: string; data?: string; media_type?: string; url?: string };
        };
        if (imgBlock.source?.type === "base64" && imgBlock.source.data) {
          imgs.push(`data:${imgBlock.source.media_type};base64,${imgBlock.source.data}`);
        } else if (imgBlock.source?.type === "url" && imgBlock.source.url) {
          imgs.push(imgBlock.source.url);
        }
      }
    }

    return { textContent: text, images: imgs };
  }, [message.content]);

  const bubbleStyle = useMemo(
    () => [
      styles.bubble,
      isUser ? styles.userBubble : styles.assistantBubble,
      isError && styles.errorBubble,
    ],
    [isUser, isError],
  );

  const textStyle = useMemo(
    () => [
      styles.text,
      isUser ? styles.userText : styles.assistantText,
      isError && styles.errorText,
    ],
    [isUser, isError],
  );

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      <View style={bubbleStyle}>
        {/* Images */}
        {images.map((uri: string, i: number) => (
          <Image
            key={i}
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
          />
        ))}

        {/* Text content */}
        {textContent ? (
          Markdown && !isUser ? (
            <Markdown value={textContent} flatListProps={null} />
          ) : (
            <Text style={textStyle}>{textContent}</Text>
          )
        ) : null}

        {/* Streaming indicator */}
        {isStreaming && !textContent && <TypingDots />}

        {/* Error message */}
        {isError && message.errorMessage && (
          <Text style={styles.errorMessage}>{message.errorMessage}</Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: "#E9E9EB",
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: "#FFE5E5",
    borderColor: "#FF3B30",
    borderWidth: 1,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: "#FFFFFF",
  },
  assistantText: {
    color: "#000000",
  },
  errorText: {
    color: "#FF3B30",
  },
  errorMessage: {
    fontSize: 12,
    color: "#FF3B30",
    marginTop: 4,
    fontStyle: "italic",
  },
  image: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
  },
});
