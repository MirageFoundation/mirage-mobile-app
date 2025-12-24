// 1. AI Polyfills (TextEncoder, ReadableStream)
// import "./polyfills/ai";

// 2. Standard Crypto Polyfills (must be early)
import "react-native-get-random-values";
import "./polyfills/crypto-subtle";

// 3. Solana-specific Polyfill (Removed as requested)
// import { install as installEd25519Polyfill } from "@solana/webcrypto-ed25519-polyfill";
// installEd25519Polyfill();

// 4. Buffer Polyfill (Global Buffer)
import "@/src/utils/buffer";

// 5. Additional Polyfills
import "fast-text-encoding"; // Redundant if in ai.ts, but safe
import "react-native-url-polyfill/auto";

// 6. Styles (Unistyles/others)
// import "@/utils/unistyles"; // Replace with your style setup if different

// 7. Expo Router Entry
import "expo-router/entry";

// 8. Reanimated Logger Configuration (Optional but recommended)
try {
  const { configureReanimatedLogger } = require("react-native-reanimated");
  if (configureReanimatedLogger) {
    configureReanimatedLogger({
      level: "warn",
      strict: true,
      onWarn: (...args: any[]) => {
        // Filter out noisy warnings if needed
        console.warn(...args, new Error().stack);
      },
    });
  }
} catch (e) {
  // Ignore if reanimated is not present or too old
}
