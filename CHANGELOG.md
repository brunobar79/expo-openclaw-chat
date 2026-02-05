# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-02-05

### Added

- Initial release
- Core WebSocket client for OpenClaw gateway connections
- Device identity management with Ed25519 key generation
- Binary protocol encoding/decoding
- Chat engine with conversation and message management
- React components: `ChatBubble`, `ChatInput`, `ChatList`, `ChatModal`
- `createChat()` factory for easy integration
- Native keyboard animations via react-native-keyboard-controller
- Automatic `wss://` protocol handling for gateway URLs
- TypeScript support with full type definitions
