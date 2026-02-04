# expo-openclaw-chat Demo

A simple demo app showing how to use the expo-openclaw-chat SDK.

## Running the Demo

```bash
# Install dependencies
npm install

# Start the app
npx expo start
```

## Usage

1. Enter your gateway WebSocket URL (e.g., `wss://your-gateway.example.com`)
2. Optionally enter your auth token
3. Tap "Configure"
4. Tap "Open Chat" to open the chat modal

## How It Works

The demo shows the basic integration pattern:

```tsx
import { createChat } from "expo-openclaw-chat";

// Create chat instance
const chat = createChat({
  gatewayUrl: "wss://your-gateway.example.com",
  token: "your-auth-token",
  title: "Demo Chat",
});

// Wrap your app with ChatProvider
function App() {
  return (
    <chat.ChatProvider>
      <YourApp />
    </chat.ChatProvider>
  );
}

// Open/close chat from anywhere
chat.open();
chat.close();
```
