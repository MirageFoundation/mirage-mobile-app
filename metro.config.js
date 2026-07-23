const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// @scure/bip32 and @scure/bip39 import "@noble/hashes/crypto.js" from their
// nested @noble/hashes 1.x copies, whose package-exports map only lists
// "./crypto" (no ".js" key). Metro resolves it via file fallback but logs a
// WARN on every bundle. Bridge the upstream mismatch by stripping the
// extension for those importers only; the top-level @noble/hashes 2.x (used
// by app code) lists ".js" keys and is unaffected.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "@noble/hashes/crypto.js" &&
    context.originModulePath.includes("/@scure/")
  ) {
    moduleName = "@noble/hashes/crypto";
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;