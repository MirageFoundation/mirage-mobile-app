const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// The nested @noble/hashes 1.x copies inside @scure/bip32 and @scure/bip39
// have a `browser` field mapping "./crypto" -> "./crypto.js". Metro applies
// that redirect and then re-checks the package-exports map with the redirected
// subpath "./crypto.js", which is not an exports key, producing a WARN on
// every bundle before falling back to the same file anyway. Resolve the
// import directly to the sibling crypto.js (the browser/WebCrypto variant the
// browser field points at) to skip the broken detour. The top-level
// @noble/hashes 2.x used by app code is unaffected.
const path = require("path");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "@noble/hashes/crypto" &&
    context.originModulePath.includes("/@scure/")
  ) {
    return {
      type: "sourceFile",
      filePath: path.join(path.dirname(context.originModulePath), "crypto.js"),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;