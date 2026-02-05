const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watch the parent expo-openclaw-chat package for hot reload
const sdkPath = path.resolve(__dirname, "..");
const sdkNodeModules = path.resolve(sdkPath, "node_modules");
const demoNodeModules = path.resolve(__dirname, "node_modules");

config.watchFolders = [sdkPath];

config.resolver = {
  ...config.resolver,
  // Search demo's node_modules first, then SDK's for its dependencies
  nodeModulesPaths: [demoNodeModules, sdkNodeModules],
  // Force shared packages to always resolve from demo's node_modules
  extraNodeModules: {
    react: path.resolve(demoNodeModules, "react"),
    "react-native": path.resolve(demoNodeModules, "react-native"),
    "react-native-reanimated": path.resolve(demoNodeModules, "react-native-reanimated"),
    "react-native-keyboard-controller": path.resolve(demoNodeModules, "react-native-keyboard-controller"),
    "react-native-safe-area-context": path.resolve(demoNodeModules, "react-native-safe-area-context"),
  },
};

module.exports = config;
