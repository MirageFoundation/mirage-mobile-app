#!/usr/bin/env node
/**
 * Standalone PoW + signing test (no React Native).
 *
 * Usage:
 *   node tools/pow-test/set-username.mjs <username> [--node https://mirage.talk] [--mnemonic "<words>"] [--submit]
 */

import { argon2id } from "@noble/hashes/argon2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bech32 } from "@scure/base";
import {
  generateMnemonic,
  mnemonicToSeedSync,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";

const DERIVATION_PATH = "m/44'/118'/0'/0/0";
const ADDRESS_PREFIX = "mirage";

function uvarint(n) {
  const out = [];
  let v = typeof n === "bigint" ? n : BigInt(n >>> 0);
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Uint8Array.from(out);
}

function uvarint64(n) {
  const out = [];
  let v = BigInt(n);
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Uint8Array.from(out);
}

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/^0x/i, "").trim();
  if (!clean || clean.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function encBytes(arr) {
  return concatBytes(uvarint(arr.length), arr);
}

function encStr(s) {
  const b = new TextEncoder().encode(String(s ?? ""));
  return concatBytes(uvarint(b.length), b);
}

function leadingZeroBits(bytes) {
  let total = 0;
  for (const b of bytes) {
    if (b === 0) {
      total += 8;
      continue;
    }
    for (let i = 7; i >= 0; i--) {
      if (((b >> i) & 1) === 0) total++;
      else return total;
    }
  }
  return total;
}

function deriveWallet(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(DERIVATION_PATH);
  if (!child.privateKey) throw new Error("Failed to derive private key");

  const privateKey = child.privateKey;
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const addrHash = ripemd160(sha256(publicKey));
  const words = bech32.toWords(addrHash);
  const address = bech32.encode(ADDRESS_PREFIX, words);
  return { mnemonic, privateKey, publicKey, address };
}

function canonBaseSetUsername({ pubkey33, lastBlockHashHex, difficulty, timestampMs, target, username }) {
  const prefix = new TextEncoder().encode("mirage.core.v1:MsgSetUsername");
  const nul = new Uint8Array([0]);
  const tag2 = new Uint8Array([2]);
  const tag3 = new Uint8Array([3]);
  const tag4 = new Uint8Array([4]);
  const tag6 = new Uint8Array([6]);
  const tag100 = new Uint8Array([100]);
  const tag101 = new Uint8Array([101]);

  return concatBytes(
    prefix,
    nul,
    tag2,
    encBytes(pubkey33),
    tag3,
    encBytes(hexToBytes(lastBlockHashHex)),
    tag4,
    uvarint(difficulty),
    tag6,
    uvarint64(timestampMs),
    tag100,
    encStr(target),
    tag101,
    encStr(username)
  );
}

function canonSignedSetUsername({ pubkey33, lastBlockHashHex, difficulty, pow, timestampMs, target, username }) {
  const prefix = new TextEncoder().encode("mirage.core.v1:MsgSetUsername");
  const nul = new Uint8Array([0]);
  const tag2 = new Uint8Array([2]);
  const tag3 = new Uint8Array([3]);
  const tag4 = new Uint8Array([4]);
  const tag5 = new Uint8Array([5]);
  const tag6 = new Uint8Array([6]);
  const tag100 = new Uint8Array([100]);
  const tag101 = new Uint8Array([101]);

  return concatBytes(
    prefix,
    nul,
    tag2,
    encBytes(pubkey33),
    tag3,
    encBytes(hexToBytes(lastBlockHashHex)),
    tag4,
    uvarint(difficulty),
    tag5,
    uvarint(pow >>> 0),
    tag6,
    uvarint64(timestampMs),
    tag100,
    encStr(target),
    tag101,
    encStr(username)
  );
}

async function getParameters(nodeUrl, address) {
  const url = new URL("/api/get_parameters", nodeUrl);
  url.searchParams.set("address", address);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`get_parameters failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function postSetUsername(nodeUrl, body) {
  const url = new URL("/api/core/set_username", nodeUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!res.ok) {
    throw new Error(`set_username failed: ${res.status} ${text}`);
  }
  return json ?? text;
}

async function computePow({ baseBytes, saltHex, difficulty, maxSeconds = 60 }) {
  const start = Date.now();
  const deadline = start + maxSeconds * 1000;
  const saltBytes = hexToBytes(saltHex);
  const colon = new TextEncoder().encode(":");

  let pow = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 0;
  let attempts = 0;

  while (Date.now() < deadline) {
    const pw = concatBytes(baseBytes, colon, uvarint(pow));
    const digest = argon2id(pw, saltBytes, { t: 1, m: 4096, p: 1, dkLen: 32 });
    attempts++;
    if (leadingZeroBits(digest) >= difficulty) {
      return { pow, attempts, ms: Date.now() - start };
    }
    pow = (pow + 1) >>> 0;
  }

  throw new Error(`PoW timed out after ${maxSeconds}s (attempts=${attempts})`);
}

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function parseArgs(argv) {
  const args = { username: null, node: "https://mirage.talk", mnemonic: null, submit: false, maxSeconds: 60 };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!args.username && !a.startsWith("--")) {
      args.username = a;
      continue;
    }
    if (a === "--node") {
      args.node = rest[++i];
      continue;
    }
    if (a === "--mnemonic") {
      args.mnemonic = rest[++i];
      continue;
    }
    if (a === "--submit") {
      args.submit = true;
      continue;
    }
    if (a === "--max-seconds") {
      args.maxSeconds = Number(rest[++i]);
      continue;
    }
    if (a === "--help" || a === "-h") {
      return { ...args, help: true };
    }
    throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.username) {
    console.log("Usage: node tools/pow-test/set-username.mjs <username> [--node https://mirage.talk] [--mnemonic \"...\"] [--max-seconds 60] [--submit]");
    process.exit(args.help ? 0 : 1);
  }

  const username = String(args.username).trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(username)) {
    throw new Error("Username must match /^[a-z0-9-]+$/");
  }

  const mnemonic = args.mnemonic ?? generateMnemonic(wordlist, 128);
  const wallet = deriveWallet(mnemonic);

  console.log("wallet.address:", wallet.address);
  console.log("wallet.mnemonic:", wallet.mnemonic);

  const params = await getParameters(args.node, wallet.address);
  const lastBlockHash = params.last_block_hash;
  const difficulty = Number(params.pow_difficulty) >>> 0;
  const timestampMs = Math.max(0, Date.now() - 15000);

  console.log("params.last_block_hash:", lastBlockHash);
  console.log("params.pow_difficulty:", difficulty);

  const baseBytes = canonBaseSetUsername({
    pubkey33: wallet.publicKey,
    lastBlockHashHex: lastBlockHash,
    difficulty,
    timestampMs,
    target: wallet.address,
    username,
  });

  console.log("pow: computing...");
  const powRes = await computePow({
    baseBytes,
    saltHex: lastBlockHash,
    difficulty,
    maxSeconds: Number.isFinite(args.maxSeconds) ? args.maxSeconds : 60,
  });
  console.log("pow: found", powRes);

  const signedBytes = canonSignedSetUsername({
    pubkey33: wallet.publicKey,
    lastBlockHashHex: lastBlockHash,
    difficulty,
    pow: powRes.pow,
    timestampMs,
    target: wallet.address,
    username,
  });

  const digest = sha256(signedBytes);
  const sig = secp256k1.sign(digest, wallet.privateKey, { lowS: true, prehash: false });
  const sig64 =
    sig instanceof Uint8Array
      ? sig
      : typeof sig.toCompactRawBytes === "function"
      ? sig.toCompactRawBytes()
      : sig.toBytes("compact");

  const body = {
    pubkey: b64(wallet.publicKey),
    signature: b64(sig64),
    timestamp: timestampMs,
    last_block_hash: lastBlockHash,
    pow_difficulty: difficulty,
    pow: powRes.pow,
    username,
  };

  if (!args.submit) {
    console.log("dry-run: built request body (pass --submit to POST it):");
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  console.log("submitting...");
  const out = await postSetUsername(args.node, body);
  console.log("response:", out);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
