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
  // Force React to always resolve from demo's node_modules
  extraNodeModules: {
    react: path.resolve(demoNodeModules, "react"),
    "react-native": path.resolve(demoNodeModules, "react-native"),
  },
};

module.exports = config;
