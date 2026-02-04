/**
 * ChatList - FlatList-based message list for the chat SDK
 *
 * Uses FlatList (not FlashList) to minimize dependencies.
 * Auto-scrolls to bottom on new messages.
 */

import React, { useRef, useCallback, useMemo } from "react";
import {
  FlatList,
  View,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import { ChatBubble } from "./ChatBubble";
import type { UIMessage } from "../chat/engine";

export interface ChatListProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  /** Custom render item - overrides default ChatBubble */
  renderMessage?: (message: UIMessage, index: number) => React.ReactElement;
  /** Called when user scrolls to load more */
  onLoadMore?: () => void;
  /** Header component */
  ListHeaderComponent?: React.ComponentType | React.ReactElement;
  /** Empty state component */
  ListEmptyComponent?: React.ComponentType | React.ReactElement;
}

export const ChatList = React.memo(function ChatList({
  messages,
  isStreaming,
  renderMessage,
  onLoadMore,
  ListHeaderComponent,
  ListEmptyComponent,
}: ChatListProps) {
  const listRef = useRef<FlatList<UIMessage>>(null);

  // Render individual message
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<UIMessage>) => {
      if (renderMessage) {
        return renderMessage(item, index);
      }
      return (
        <ChatBubble
          message={item}
          isStreaming={isStreaming && index === messages.length - 1 && item.role === "assistant"}
        />
      );
    },
    [renderMessage, isStreaming, messages.length],
  );

  // Key extractor
  const keyExtractor = useCallback((item: UIMessage) => item.id, []);

  // Auto-scroll to bottom when new messages arrive
  const onContentSizeChange = useCallback(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  // Item separator
  const ItemSeparator = useMemo(
    () => <View style={styles.separator} />,
    [],
  );

  const renderSeparator = useCallback(() => ItemSeparator, [ItemSeparator]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.contentContainer}
      onContentSizeChange={onContentSizeChange}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.1}
      ItemSeparatorComponent={renderSeparator}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 10,
      }}
    />
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  separator: {
    height: 2,
  },
});
