# react-native-argon2-turbo

## Overview

A high-performance, general-purpose Argon2 library for React Native built with TurboModules (JSI). This is a **drop-in replacement** for `react-native-argon2` with 10x+ better performance, plus additional PoW (Proof-of-Work) utilities.

**Package Name:** `react-native-argon2-turbo`

**Target Audience:**
- Anyone using Argon2 in React Native (password hashing, KDF, PoW)
- Drop-in replacement for `react-native-argon2` users
- Blockchain/crypto apps needing fast PoW computation

**Key Features:**
- ⚡ **10x faster** than `react-native-argon2` (TurboModules vs Bridge)
- 🔄 **Drop-in compatible** API with `react-native-argon2`
- 🔐 **All Argon2 variants**: Argon2i, Argon2d, Argon2id
- ⛏️ **PoW utilities**: Native loop for proof-of-work computation
- 📱 **Both platforms**: iOS (Swift) + Android (Kotlin)
- 🏗️ **New Architecture**: Built for React Native 0.75+

---

## Problem Statement

### Current State of Argon2 in React Native

The existing `react-native-argon2` package uses the **old bridge architecture**:

```javascript
// react-native-argon2/index.js
import { NativeModules } from 'react-native';
const RNArgon2Module = NativeModules.RNArgon2;
export default RNArgon2Module.argon2;
```

**Problems:**
1. Every call goes through JSON serialization → Bridge → JSON deserialization
2. ~10-12ms overhead per call (actual hashing is only ~1-2ms)
3. For PoW loops, this means ~80 h/s instead of 500+ h/s
4. No support for New Architecture / TurboModules

### Our Solution

Build a modern TurboModule-based Argon2 library:
- **JSI-based**: Direct native calls, no JSON serialization
- **Synchronous option**: For single hashes where blocking is acceptable
- **Native PoW loop**: Entire loop runs natively for maximum performance

---

## API Design

### Core Hashing API (Drop-in Compatible)

```typescript
import { hash, hashSync, verify } from 'react-native-argon2-turbo';

// Async hashing (recommended)
const result = await hash({
  password: 'mypassword',
  salt: 'randomsalt123456',
  // Optional parameters (with defaults)
  iterations: 2,        // time cost
  memory: 65536,        // memory in KiB (64 MB)
  parallelism: 1,
  hashLength: 32,
  mode: 'argon2id',     // 'argon2i' | 'argon2d' | 'argon2id'
});

console.log(result.rawHash);     // hex string
console.log(result.encodedHash); // $argon2id$v=19$...

// Sync hashing (blocks JS thread - use carefully)
const syncResult = hashSync({ password, salt });

// Verify password against encoded hash
const isValid = await verify({
  password: 'mypassword',
  encodedHash: '$argon2id$v=19$m=65536,t=2,p=1$...',
});
```

### Advanced Options

```typescript
interface HashOptions {
  // Required
  password: string | Uint8Array;
  salt: string | Uint8Array;
  
  // Algorithm parameters
  iterations?: number;      // time cost, default: 2
  memory?: number;          // KiB, default: 65536 (64MB)
  parallelism?: number;     // threads, default: 1
  hashLength?: number;      // output bytes, default: 32
  mode?: 'argon2i' | 'argon2d' | 'argon2id';  // default: 'argon2id'
  
  // Encoding options
  passwordEncoding?: 'utf8' | 'hex' | 'base64';  // default: 'utf8'
  saltEncoding?: 'utf8' | 'hex' | 'base64';      // default: 'utf8'
}

interface HashResult {
  rawHash: string;      // hex-encoded hash
  encodedHash: string;  // PHC format: $argon2id$v=19$...
}
```

### Proof-of-Work API

```typescript
import { computePow, cancelPow, getPowProgress } from 'react-native-argon2-turbo';

// Compute PoW (entire loop runs natively)
const powResult = await computePow({
  base: baseHex,           // message bytes (hex)
  salt: saltHex,           // block hash (hex)
  difficulty: 12,          // required leading zero bits
  startNonce: 0,           // optional starting point
  maxAttempts: 10_000_000, // optional limit
  timeoutMs: 60_000,       // optional timeout
  
  // Argon2 parameters for PoW (defaults optimized for mobile)
  iterations: 1,
  memory: 4096,            // 4 MB (lighter for PoW)
  parallelism: 1,
  hashLength: 32,
});

console.log(powResult.nonce);      // winning nonce
console.log(powResult.digest);     // hex hash
console.log(powResult.attempts);   // hashes computed
console.log(powResult.elapsedMs);  // time taken

// Cancel ongoing PoW
cancelPow();

// Poll for progress (for UI updates)
const progress = await getPowProgress();
console.log(progress.attempts, progress.elapsedMs);
```

### TypeScript Definitions

```typescript
// Full type definitions
export interface PowOptions {
  base: string;              // hex-encoded base bytes
  salt: string;              // hex-encoded salt
  difficulty: number;        // leading zero bits required
  startNonce?: number;       // default: random
  maxAttempts?: number;      // default: 10_000_000
  timeoutMs?: number;        // default: 60_000
  iterations?: number;       // default: 1
  memory?: number;           // default: 4096
  parallelism?: number;      // default: 1
  hashLength?: number;       // default: 32
}

export interface PowResult {
  nonce: number;
  digest: string;            // hex
  attempts: number;
  elapsedMs: number;
}

export interface PowProgress {
  attempts: number;
  elapsedMs: number;
  hashesPerSecond: number;
}
```

---

## Migration from react-native-argon2

### Before (react-native-argon2)
```typescript
import argon2 from 'react-native-argon2';

const result = await argon2(password, salt, {
  iterations: 2,
  memory: 65536,
  parallelism: 1,
  hashLength: 32,
  mode: 'argon2id',
});

const { rawHash, encodedHash } = result;
```

### After (react-native-argon2-turbo)
```typescript
import { hash } from 'react-native-argon2-turbo';

const result = await hash({
  password,
  salt,
  iterations: 2,
  memory: 65536,
  parallelism: 1,
  hashLength: 32,
  mode: 'argon2id',
});

const { rawHash, encodedHash } = result;
```

**Changes:**
- Named import `hash` instead of default import
- Options passed as single object (password/salt included)
- Everything else is identical!

### Legacy Compatibility Layer (Optional)

```typescript
// For zero-change migration
import argon2 from 'react-native-argon2-turbo/legacy';

// Works exactly like react-native-argon2
const result = await argon2(password, salt, options);
```

---

## Project Structure

```
react-native-argon2-turbo/
├── package.json
├── tsconfig.json
├── README.md
├── MIGRATION.md                    # Migration guide from react-native-argon2
│
├── src/
│   ├── index.ts                    # Main exports
│   ├── legacy.ts                   # Legacy API compatibility
│   ├── types.ts                    # TypeScript definitions
│   │
│   ├── specs/                      # TurboModule Codegen specs
│   │   └── NativeArgon2Module.ts
│   │
│   ├── hash.ts                     # hash(), hashSync(), verify()
│   └── pow.ts                      # computePow(), cancelPow()
│
├── android/
│   ├── build.gradle.kts
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   └── java/com/argon2turbo/
│   │       ├── Argon2TurboModule.kt      # TurboModule implementation
│   │       ├── Argon2TurboPackage.kt     # Package registration
│   │       └── Argon2Core.kt             # Argon2 + PoW logic
│   └── CMakeLists.txt
│
├── ios/
│   ├── Argon2Turbo.podspec
│   ├── Argon2TurboModule.mm              # TurboModule bridge
│   ├── Argon2TurboModule.swift           # Swift implementation
│   └── Argon2Core.swift                  # Argon2 + PoW logic
│
├── cpp/                                   # Optional shared C++ code
│   ├── Argon2Core.h
│   └── Argon2Core.cpp
│
├── example/                               # Example app
│   ├── App.tsx
│   ├── package.json
│   └── ...
│
└── __tests__/
    ├── hash.test.ts
    ├── pow.test.ts
    └── compatibility.test.ts
```

---

## Implementation Plan

### Phase 1: Project Setup (1 day)
1. Initialize React Native library with TurboModule template
   ```bash
   npx create-react-native-library@latest react-native-argon2-turbo \
     --type module-turbo
   ```
2. Configure Codegen for TypeScript spec
3. Set up iOS CocoaPods with Argon2Swift
4. Set up Android Gradle with argon2kt
5. Create basic project structure

### Phase 2: Core Hashing API (2 days)
1. Implement `hash()` async function
2. Implement `hashSync()` sync function
3. Implement `verify()` function
4. Add encoding support (utf8, hex, base64)
5. Add legacy compatibility layer
6. Unit tests for all variants

### Phase 3: iOS Implementation (2-3 days)
1. Create TurboModule spec binding (Obj-C++)
2. Implement hashing using Argon2Swift
3. Implement PoW loop with cancellation
4. Background thread execution
5. Progress reporting support

### Phase 4: Android Implementation (2-3 days)
1. Create TurboModule spec binding (Kotlin)
2. Implement hashing using argon2kt
3. Implement PoW loop with AtomicBoolean cancellation
4. Coroutine-based background execution
5. Progress reporting support

### Phase 5: PoW Utilities (1-2 days)
1. Implement `computePow()` with native loop
2. Implement `cancelPow()`
3. Implement `getPowProgress()` for polling
4. Verify output matches web/backend implementations

### Phase 6: Testing & Documentation (1-2 days)
1. Unit tests for all functions
2. Integration tests with example app
3. Performance benchmarks
4. README with examples
5. Migration guide
6. API documentation

### Phase 7: Publishing (0.5 day)
1. npm publish
2. GitHub repository setup
3. CI/CD for releases

---

## Dependencies

### iOS
```ruby
# Podfile
s.dependency 'Argon2Swift', '~> 1.0'
```

**Argon2Swift:** https://github.com/nicedoc/Argon2Swift
- Pure Swift implementation
- Supports all Argon2 variants
- MIT licensed

### Android
```kotlin
// build.gradle.kts
dependencies {
    implementation("com.lambdapioneer.argon2kt:argon2kt:1.5.0")
}
```

**argon2kt:** https://github.com/nicedoc/argon2-kt
- Kotlin wrapper around reference C implementation
- Supports all Argon2 variants
- MIT licensed

---

## Technical Details

### TurboModule Spec (Codegen)

```typescript
// src/specs/NativeArgon2Module.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Core hashing
  hash(
    password: string,
    salt: string,
    iterations: number,
    memory: number,
    parallelism: number,
    hashLength: number,
    mode: string,
    passwordEncoding: string,
    saltEncoding: string
  ): Promise<{ rawHash: string; encodedHash: string }>;

  hashSync(
    password: string,
    salt: string,
    iterations: number,
    memory: number,
    parallelism: number,
    hashLength: number,
    mode: string,
    passwordEncoding: string,
    saltEncoding: string
  ): { rawHash: string; encodedHash: string };

  verify(password: string, encodedHash: string): Promise<boolean>;

  // PoW functions
  computePow(
    base: string,
    salt: string,
    difficulty: number,
    startNonce: number,
    maxAttempts: number,
    timeoutMs: number,
    iterations: number,
    memory: number,
    parallelism: number,
    hashLength: number
  ): Promise<{
    nonce: number;
    digest: string;
    attempts: number;
    elapsedMs: number;
  }>;

  cancelPow(): void;

  getPowProgress(): Promise<{
    attempts: number;
    elapsedMs: number;
    hashesPerSecond: number;
  }>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Argon2Turbo');
```

### Native PoW Algorithm

```swift
// iOS - Argon2Core.swift
func computePow(
    base: Data,
    salt: Data,
    difficulty: Int,
    startNonce: UInt32,
    maxAttempts: Int,
    timeoutMs: Int,
    params: Argon2Params
) throws -> PowResult {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
    var nonce = startNonce
    var attempts = 0
    let colon = ":".data(using: .utf8)!
    
    while attempts < maxAttempts && !cancelFlag.load(ordering: .relaxed) {
        // Check timeout
        if Date() > deadline {
            throw PowError.timeout
        }
        
        // Build password: base + ":" + uvarint(nonce)
        let password = base + colon + uvarint(nonce)
        
        // Compute Argon2id hash
        let digest = try Argon2Swift.hash(
            password: password,
            salt: salt,
            iterations: params.iterations,
            memory: params.memory,
            parallelism: params.parallelism,
            length: params.hashLength,
            type: .id
        )
        
        attempts += 1
        currentAttempts.store(attempts, ordering: .relaxed)
        
        // Check if we have enough leading zeros
        if leadingZeroBits(digest) >= difficulty {
            return PowResult(
                nonce: nonce,
                digest: digest.hexString,
                attempts: attempts,
                elapsedMs: startTime.elapsedMs
            )
        }
        
        nonce = nonce &+ 1  // Wrap around
    }
    
    throw PowError.maxAttemptsExceeded
}
```

### Leading Zero Bits Check

```swift
func leadingZeroBits(_ data: Data) -> Int {
    var count = 0
    for byte in data {
        if byte == 0 {
            count += 8
        } else {
            // Count leading zeros in this byte
            var mask: UInt8 = 0x80
            while mask != 0 && (byte & mask) == 0 {
                count += 1
                mask >>= 1
            }
            break
        }
    }
    return count
}
```

### Uvarint Encoding (Must Match Web/Backend)

```swift
func uvarint(_ n: UInt32) -> Data {
    var value = n
    var result = Data()
    while value >= 0x80 {
        result.append(UInt8((value & 0x7F) | 0x80))
        value >>= 7
    }
    result.append(UInt8(value))
    return result
}
```

---

## Performance Expectations

### Single Hash Performance

| Scenario | react-native-argon2 | react-native-argon2-turbo | Improvement |
|----------|---------------------|---------------------------|-------------|
| Single hash | ~12ms | ~2ms | 6x |
| 10 hashes | ~120ms | ~20ms | 6x |
| 100 hashes | ~1.2s | ~200ms | 6x |

### PoW Performance (Native Loop)

| Scenario | Current (Bridge per hash) | Turbo (Native loop) | Improvement |
|----------|---------------------------|---------------------|-------------|
| Hashes/sec | ~80 | 500-1000+ | 6-12x |
| Difficulty 8 (~256 avg) | ~3s | ~0.5s | 6x |
| Difficulty 12 (~4096 avg) | ~49s | ~8s | 6x |

---

## Use Cases

### 1. Password Hashing (Most Common)
```typescript
import { hash, verify } from 'react-native-argon2-turbo';

// Registration
const { encodedHash } = await hash({
  password: userPassword,
  salt: generateSalt(),
  memory: 65536,
  iterations: 3,
});
// Store encodedHash in database

// Login
const isValid = await verify({
  password: attemptedPassword,
  encodedHash: storedHash,
});
```

### 2. Key Derivation (Wallets, Encryption)
```typescript
import { hash } from 'react-native-argon2-turbo';

const { rawHash } = await hash({
  password: masterPassword,
  salt: uniqueSalt,
  hashLength: 32,  // 256-bit key
  memory: 65536,
  iterations: 3,
});

const encryptionKey = hexToBytes(rawHash);
```

### 3. Proof-of-Work (Blockchain, Anti-Spam)
```typescript
import { computePow } from 'react-native-argon2-turbo';

const result = await computePow({
  base: canonicalMessageHex,
  salt: blockHashHex,
  difficulty: 12,
  memory: 4096,    // Lighter for PoW
  iterations: 1,
});

// Submit transaction with result.nonce
```

---

## Testing Checklist

### Core Hashing
- [ ] hash() produces correct output for all modes
- [ ] hashSync() matches hash() output
- [ ] verify() correctly validates passwords
- [ ] All encoding options work (utf8, hex, base64)
- [ ] Edge cases: empty password, empty salt, unicode

### PoW
- [ ] Output matches web worker for same inputs
- [ ] Output matches backend verification
- [ ] Handles difficulty 0 correctly
- [ ] Cancellation works mid-computation
- [ ] Timeout triggers correctly
- [ ] Progress reporting accurate

### Performance
- [ ] hash() < 5ms for default params
- [ ] PoW achieves 500+ h/s
- [ ] No memory leaks in repeated calls
- [ ] Background thread doesn't block UI

### Platforms
- [ ] iOS arm64 (device)
- [ ] iOS x86_64 (simulator)
- [ ] Android arm64-v8a
- [ ] Android armeabi-v7a
- [ ] Android x86_64

### Compatibility
- [ ] Legacy API works as drop-in replacement
- [ ] React Native 0.75+
- [ ] New Architecture only (TurboModules)

---

## Timeline Estimate

| Phase | Task | Estimate |
|-------|------|----------|
| 1 | Project setup | 1 day |
| 2 | Core hashing API | 2 days |
| 3 | iOS implementation | 2-3 days |
| 4 | Android implementation | 2-3 days |
| 5 | PoW utilities | 1-2 days |
| 6 | Testing & docs | 1-2 days |
| 7 | Publishing | 0.5 day |
| **Total** | | **10-14 days** |

---

## Resources

### TurboModules
- [Official TurboModule Guide](https://reactnative.dev/docs/turbo-native-modules-introduction)
- [TurboModule Working Group](https://github.com/reactwg/react-native-new-architecture/blob/main/docs/turbo-modules.md)
- [create-react-native-library](https://github.com/callstack/react-native-builder-bob)

### Argon2
- [Argon2Swift (iOS)](https://github.com/nicedoc/Argon2Swift)
- [argon2kt (Android)](https://github.com/lambdapioneer/argon2kt)
- [Argon2 Reference](https://github.com/P-H-C/phc-winner-argon2)
- [RFC 9106 - Argon2](https://www.rfc-editor.org/rfc/rfc9106.html)

### Existing Implementations (Reference)
- [react-native-argon2](https://github.com/poowf/react-native-argon2) - Old bridge version
- [argon2-browser](https://github.com/nicedoc/argon2-browser) - Web WASM version
- Web Worker: `reference/mirage-node/web/frontend/public/pow/worker.js`
- Backend: `reference/mirage-node/web/backend/pow.py`

---

## Marketing / README Pitch

```markdown
# react-native-argon2-turbo ⚡

> High-performance Argon2 hashing for React Native, powered by TurboModules

**10x faster** than `react-native-argon2` • **Drop-in replacement** • **PoW utilities included**

## Why?

The existing `react-native-argon2` uses the old React Native bridge, adding ~10ms 
overhead per hash. This library uses TurboModules (JSI) for direct native calls, 
making it 10x faster.

## Features

- ⚡ **10x faster** - TurboModules, no bridge overhead
- 🔄 **Drop-in replacement** - Same API as react-native-argon2
- 🔐 **All variants** - Argon2i, Argon2d, Argon2id
- ⛏️ **PoW support** - Native proof-of-work loop (500+ h/s)
- 📱 **Cross-platform** - iOS + Android
- 🏗️ **Modern** - React Native 0.75+, New Architecture

## Quick Start

\`\`\`bash
npm install react-native-argon2-turbo
\`\`\`

\`\`\`typescript
import { hash } from 'react-native-argon2-turbo';

const { rawHash, encodedHash } = await hash({
  password: 'mypassword',
  salt: 'randomsalt',
});
\`\`\`
```

---

## Next Steps

1. **Create repository**: `github.com/nicedoc/react-native-argon2-turbo`
2. **Initialize project** with TurboModule template
3. **Implement iOS** first (faster iteration)
4. **Port to Android**
5. **Write tests** and documentation
6. **Publish to npm**
7. **Announce** on React Native community channels

---

## Integration with Mirage App

Once published, update Mirage's `src/wallet/pow.ts`:

```typescript
import { computePow } from 'react-native-argon2-turbo';

export async function computePoW(
  input: PoWInput,
  onProgress?: (attempts: number, elapsedMs: number) => void,
  maxAttempts = 10_000_000
): Promise<PoWResult> {
  const { base, lastBlockHash, requiredBits } = input;

  if (requiredBits === 0) {
    return { pow: 0, digest: new Uint8Array(32), computeTimeMs: 0, attempts: 0 };
  }

  // Set up progress polling if callback provided
  let progressInterval: ReturnType<typeof setInterval> | undefined;
  if (onProgress) {
    progressInterval = setInterval(async () => {
      try {
        const progress = await getPowProgress();
        onProgress(progress.attempts, progress.elapsedMs);
      } catch {}
    }, 100);
  }

  try {
    const result = await computePow({
      base: bytesToHex(base),
      salt: lastBlockHash.replace(/^0x/, ''),
      difficulty: requiredBits,
      startNonce: Math.floor(Math.random() * 0xffffffff),
      maxAttempts,
      timeoutMs: 60000,
      iterations: 1,
      memory: 4096,
      parallelism: 1,
      hashLength: 32,
    });

    return {
      pow: result.nonce,
      digest: hexToUint8Array(result.digest),
      computeTimeMs: result.elapsedMs,
      attempts: result.attempts,
    };
  } finally {
    if (progressInterval) clearInterval(progressInterval);
  }
}
```
