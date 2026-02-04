/**
 * expo-openclaw-chat
 *
 * Minimal chat SDK for Expo apps to connect to OpenClaw gateway.
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
 * // In your app root:
 * function App() {
 *   return (
 *     <chat.ChatProvider>
 *       <YourApp />
 *     </chat.ChatProvider>
 *   );
 * }
 *
 * // Anywhere in your app:
 * chat.open();  // Show chat modal
 * chat.close(); // Hide chat modal
 * ```
 */

// Main entry point
export { createChat, type CreateChatConfig, type ChatInstance } from "./createChat";

// Core exports
export * from "./core";

// Chat engine
export { ChatEngine, type UIMessage, type PendingAttachment, type ChatEngineState, type ChatEngineEvent } from "./chat";

// UI components (for custom implementations)
export { ChatModal, ChatList, ChatBubble, ChatInput } from "./ui";
export type { ChatModalProps, ChatListProps, ChatBubbleProps, ChatInputProps } from "./ui";
