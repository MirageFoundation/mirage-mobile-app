import { Transpiler } from 'bun';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import * as domain from '../src/domain/communities/index.ts';
import * as models from '../src/api/write/utils/curation-model.ts';
import { bech32 } from '@scure/base';
import { ripemd160 } from '@noble/hashes/legacy.js';

// Offline diagnostic, deliberately not part of the portable test suite. The web
// source/dependencies must already exist; this script never installs or sends.
const nodeRoot = resolve(process.argv[2] || '../mirage-node');
const webRoot = resolve(nodeRoot, 'web/frontend');
const webRequire = createRequire(resolve(webRoot, 'package.json'));
const { Secp256k1, sha256 } = webRequire('@cosmjs/crypto');
const webSecp = webRequire('@noble/secp256k1');
const transpiler = new Transpiler({ loader: 'ts' });
function load(path, names, bindings = {}) {
  const original = readFileSync(path, 'utf8');
  const source = original.replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export default .*;$/gm, '')
    .replace(/^export \{[^}]*\};$/gm, '')
    .replace(/\bexport /g, '');
  return new Function(...Object.keys(bindings), `${transpiler.transformSync(source)}\nreturn {${names.join(',')}};`)(...Object.values(bindings));
}
const mobileCrypto = load('src/wallet/crypto.ts', ['signCanonical', 'b64encode', 'hexToBytes', 'concatBytes'], { secp256k1 });
const canonical = load('src/api/write/signing/canonical.ts', ['canonBaseInviteCurator', 'canonSignedWithPow'], mobileCrypto);
const webCanonical = load(resolve(webRoot, 'src/utils/canonicalEncoding.js'), ['generateEnvelopeNonce', 'buildCanonical', 'encStr', 'uvarint64']);
const webCuration = load(resolve(webRoot, 'src/utils/curation.js'), ['curationPendingKey', 'requireCommunitySlug', 'requireTeamId']);
const { isValidAddress, deriveAddress: publicKeyToAddress } = load('src/wallet/address.ts', ['isValidAddress', 'deriveAddress'], { bech32, sha256, ripemd160, ADDRESS_PREFIX: 'mirage' });
const privateKey = new Uint8Array(32); privateKey[31] = 1;
const publicKey = secp256k1.getPublicKey(privateKey);
const owner = publicKeyToAddress(publicKey);
const targetKey = new Uint8Array(32); targetKey[31] = 2;
const target = publicKeyToAddress(secp256k1.getPublicKey(targetKey));
const now = 1788825600000;
const oldNow = Date.now;
Date.now = () => now;
globalThis.window = { crypto: { getRandomValues: (v) => (v.fill(42), v) } };
const oldCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: window.crypto });
let webBody, mobileBody, webPath, mobilePath, webSigned, mobileSigned;
const storage = new Map([['user_level', '1'], ['publicKey', owner]]);
const handler = load(resolve(webRoot, 'src/utils/TransactionHandler.js'), ['instance'], {
  ...webCanonical, ...webCuration,
  Storage: { load: (k, fallback) => storage.get(k) ?? fallback, save: (k, v) => storage.set(k, v) },
  secp256k1GetPublicKey: webSecp.getPublicKey,
  ensureCosmCryptoShared: async () => ({ Secp256k1, sha256 }),
  updateNotification: () => {}, invalidateCurationReads: () => {},
  derivePrivateKeyFromSeed: () => Buffer.from(privateKey).toString('hex'),
  Api: { post: async (path, body) => { webPath = path; webBody = body; return { error: 'offline_capture', error_code: 'offline_capture' }; }, get: async () => { throw new Error('Unexpected network read'); } },
}).instance;
// Wallet/session boundary only; actual enqueue, process, perform, canonical and
// handleTransactionResult remain unchanged source.
handler._requireOwnerBinding = () => ({ owner, sessionGeneration: 1, normalizedSeed: 'PUBLIC_TEST_FIXTURE', signerSource: 'vault' });
handler._verifyOwnerBinding = () => true;
const actualWebCanonical = handler.canonicalCuration.bind(handler);
handler.canonicalCuration = (...args) => (webSigned = actualWebCanonical(...args));
const envelope = load('src/api/write/signing/envelope.ts', ['buildSignedEnvelope'], {
  ...mobileCrypto, ...canonical,
  signCanonical: (key, bytes) => { mobileSigned = bytes; return mobileCrypto.signCanonical(key, bytes); },
  getCachedRelayDecision: () => ({ relay_allowed: true, pow_required: false, quota_exhausted: false }),
  useAuthStore: { getState: () => ({ userLevel: 1 }) }, queryClient: {},
});
const endpoints = load('src/api/write/endpoints/curation.ts', ['inviteCurator'], {
  ...domain, ...models, ...canonical, ...envelope, isValidAddress,
  withPowRetry: (run) => run(),
  api: { post: async (path, body) => { mobilePath = path; mobileBody = body; return { code: 0 }; } },
});
try {
  await handler.inviteCurationTeamMember('Tech', 7, target);
  await endpoints.inviteCurator({ address: owner, publicKey, privateKey }, { community: 'Tech', teamId: 7, target });
  assert(webBody && mobileBody, 'Both actual send paths must reach capture');
  assert.equal(`/api/${webPath}`, `/api${mobilePath}`);
  for (const body of [webBody, mobileBody]) assert.deepEqual(JSON.parse(JSON.stringify(body)), body);
  for (const key of ['pubkey', 'community', 'team_id', 'target', 'pow', 'pow_difficulty']) assert.deepEqual(webBody[key], mobileBody[key], key);
  assert.equal(webBody.timestamp, now - 15000);
  assert.equal(mobileBody.timestamp, now);
  assert.equal(webBody.last_block_hash, now.toString(16).padStart(64, '0'));
  assert.equal(mobileBody.last_block_hash, '');
  assert.equal(webBody.envelope_nonce, now * 1000 + 43);
  assert.equal(mobileBody.envelope_nonce, (BigInt(now) * 1000000n + 42n).toString());
  assert.equal(Buffer.from(webBody.signature, 'base64').length, 65);
  assert.equal(Buffer.from(mobileBody.signature, 'base64').length, 64);
  for (const [body, bytes] of [[webBody, webSigned], [mobileBody, mobileSigned]]) {
    // _parse_relay_envelope truncates CosmJS's trailing recovery byte.
    assert(secp256k1.verify(Buffer.from(body.signature, 'base64').subarray(0, 64), bytes, publicKey));
    const prefix = Buffer.from('mirage.core.v1:MsgInviteCurator\0');
    assert.deepEqual(Buffer.from(bytes.subarray(0, prefix.length)), prefix);
    let offset = prefix.length;
    const uint = () => {
      let value = 0n, shift = 0n, byte;
      do { byte = bytes[offset++]; value |= BigInt(byte & 127) << shift; shift += 7n; } while (byte & 128);
      return value;
    };
    const decoded = {};
    for (const tag of [2, 3, 4, 5, 6, 7, 100, 101, 102]) {
      assert.equal(bytes[offset++], tag);
      if ([2, 3, 100, 102].includes(tag)) {
        const length = Number(uint());
        decoded[tag] = Buffer.from(bytes.subarray(offset, offset + length)); offset += length;
      } else decoded[tag] = uint();
    }
    assert.equal(offset, bytes.length);
    assert.equal(decoded[2].toString('base64'), body.pubkey);
    assert.equal(decoded[3].toString('hex'), body.last_block_hash);
    assert.equal(decoded[4], BigInt(body.pow_difficulty));
    assert.equal(decoded[5], BigInt(body.pow));
    assert.equal(decoded[6], BigInt(body.timestamp));
    assert.equal(decoded[7], BigInt(body.envelope_nonce));
    assert.equal(decoded[100].toString(), body.community);
    assert.equal(decoded[101], BigInt(body.team_id));
    assert.equal(decoded[102].toString(), body.target);
  }
  // Re-run the actual web builder against the captured mobile envelope. A
  // decimal string is accepted by this builder; send's Number conversion is
  // deliberately NOT used to coerce mobile's uint64 nonce.
  const mobileThroughWeb = actualWebCanonical('invite_curator', { ...mobileBody, pub_bytes: publicKey, difficulty: mobileBody.pow_difficulty, proof: mobileBody.pow, nonce: mobileBody.envelope_nonce });
  assert.deepEqual(Buffer.from(mobileThroughWeb), Buffer.from(mobileSigned));
  const webThroughMobile = canonical.canonSignedWithPow(canonical.canonBaseInviteCurator({ pubkey33: publicKey, lastBlockHashBytes: mobileCrypto.hexToBytes(webBody.last_block_hash), difficulty: webBody.pow_difficulty, timestampMs: webBody.timestamp, envelopeNonce: BigInt(webBody.envelope_nonce), community: webBody.community, team_id: webBody.team_id, target: webBody.target }), webBody.pow);
  assert.deepEqual(Buffer.from(webThroughMobile), Buffer.from(webSigned));
  console.log(JSON.stringify({ result: 'PASS', actual_web_queue_and_send: true, actual_mobile_endpoint_and_envelope: true, signature_libraries: ['web @cosmjs/crypto', 'mobile @noble/curves'], equal_after_cross_building_captured_fields: true, signed_lengths: [webSigned.length, mobileSigned.length], intentional_differences: ['timestamp -15s vs fresh', 'synthetic 32-byte hash vs empty hash (paid)', 'safe-number microsecond nonce vs decimal-string uint64 nanosecond nonce', 'signatures differ with preimages'], network_requests: 0 }));
} finally {
  handler._stopStatusUpdates();
  Date.now = oldNow;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: oldCrypto });
}
