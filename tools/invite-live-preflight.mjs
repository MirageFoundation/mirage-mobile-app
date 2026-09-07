import { Transpiler } from 'bun';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { Buffer } from 'node:buffer';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { bech32 } from '@scure/base';
import * as walletTypes from '../src/wallet/types.ts';

const transpiler = new Transpiler({ loader: 'ts' });
function load(path, names, bindings = {}) {
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\s*$/gm, '').replace(/\bexport /g, '');
  return new Function(...Object.keys(bindings), `${transpiler.transformSync(source)}\nreturn {${names.join(',')}};`)(...Object.values(bindings));
}
const silent = { captureException() {}, addBreadcrumb() {}, log() {}, warn() {}, error() {} };
const crypto = load('src/wallet/crypto.ts', ['derivePrivateKey', 'getCompressedPublicKey', 'signCanonical'], {
  ...walletTypes, mnemonicToSeedSync, validateMnemonic, wordlist, HDKey, secp256k1, Sentry: silent,
});
const address = load('src/wallet/address.ts', ['deriveAddress', 'isValidAddress'], { bech32, sha256, ripemd160, ADDRESS_PREFIX: 'mirage' });
const visitor = globalThis.crypto.randomUUID();
let requests = 0;
async function get(path, params = {}) {
  assert(['/get_user_status', '/get_parameters', '/get_address_from_username', '/communities/life/teams'].includes(path) || /^\/curators\/mirage1[a-z0-9]+\/communities$/.test(path));
  assert(++requests <= 8);
  const url = new URL(`/api${path}`, 'https://mirage.talk');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'X-Mirage-Visitor': visitor, 'X-Mirage-Platform': 'ios', Accept: 'application/json' } });
    assert(response.status < 300 || response.status >= 400, 'redirect rejected');
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 262144) { await reader.cancel(); throw new Error('body limit'); } chunks.push(value); }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    console.log(JSON.stringify({ utc: new Date().toISOString(), request: path.startsWith('/curators/') ? '/curators/[redacted]/communities' : path, http_status: response.status, error_code: typeof data.error_code === 'string' ? data.error_code.replace(/mirage1[a-z0-9]+/g, '[address]') : undefined }));
    if (!response.ok) throw new Error('Live read rejected; stop');
    return data;
  } catch { throw new Error('Live read unavailable/rejected; stop without writes'); }
}
async function secretInput() {
  assert(stdin.isTTY, 'Requires echo-disabled TTY input');
  stdin.setRawMode(true); stdin.resume();
  stdout.write('Secure input ready (echo disabled)\n');
  return new Promise((resolve, reject) => {
    let secret = '';
    const listener = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') { cleanup(); reject(new Error('cancelled')); return; }
        if (character === '\r' || character === '\n') { cleanup(); resolve(secret); secret = ''; return; }
        secret += character;
      }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('input timeout')); }, 60000);
    function cleanup() { clearTimeout(timer); stdin.removeListener('data', listener); stdin.setRawMode(false); stdin.pause(); }
    stdin.on('data', listener);
  });
}
try {
  let mnemonic = await secretInput();
  const privateKey = crypto.derivePrivateKey(mnemonic); mnemonic = '';
  const publicKey = crypto.getCompressedPublicKey(privateKey);
  const owner = address.deriveAddress(publicKey);
  assert(address.isValidAddress(owner));
  const challenge = new TextEncoder().encode('local-only live diagnostic verification');
  assert(secp256k1.verify(crypto.signCanonical(privateKey, challenge), challenge, publicKey));
  console.log(JSON.stringify({ local_wallet_verification: 'PASS', writes_enabled: false }));
  const ownerStatus = await get('/get_user_status', { address: owner });
  console.log(JSON.stringify({ owner: { user_level: ownerStatus.user_level, effective_paid: ownerStatus.effective_paid, balance_present: Number.isFinite(ownerStatus.balance), daily_quota: ownerStatus.daily_quota ?? 'not returned' } }));
  const users = load('src/api/read/endpoints/users.ts', ['getAddressFromUsername'], { api: { get } });
  const recipientUsername = process.argv[2];
  assert(recipientUsername === 'batman', 'Explicit authorized recipient batman required');
  const resolved = await users.getAddressFromUsername({ username: recipientUsername });
  assert(resolved.exists === true && resolved.username === recipientUsername, 'Exact recipient lookup failed');
  const target = resolved.address;
  assert(typeof target === 'string' && address.isValidAddress(target), 'Recipient checksum failed');
  console.log(JSON.stringify({ recipient_resolution: 'checksum valid', self: owner === target, exact_username: resolved.username === recipientUsername }));
  const recipientStatus = await get('/get_user_status', { address: target });
  console.log(JSON.stringify({ recipient: { username: recipientStatus.username, user_level: recipientStatus.user_level, effective_paid: recipientStatus.effective_paid } }));
  const memberships = [];
  for (const [label, account] of [['owner', owner], ['recipient', target]]) {
    const data = await get(`/curators/${account}/communities`);
    memberships.push(data);
    console.log(JSON.stringify({ label, memberships: JSON.parse(JSON.stringify(data).replace(/mirage1[a-z0-9]+/g, '[address]')) }));
  }
  const teams = await get('/communities/life/teams');
  console.log(JSON.stringify({ life_teams: JSON.parse(JSON.stringify(teams).replace(/mirage1[a-z0-9]+/g, '[address]')) }));
  privateKey.fill(0);
  assert(Array.isArray(teams.items) && teams.has_more === false, 'Team list incomplete');
  console.log(JSON.stringify({ owned_life_teams: teams.items.filter((team) => !team.deleted && team.owner === owner).map((team) => ({ team_id: team.team_id, name: team.name })), owner_can_curate: ownerStatus.effective_paid === true || ownerStatus.user_level >= 100, recipient_can_curate: recipientStatus.effective_paid === true || recipientStatus.user_level >= 100 }));
  console.log(JSON.stringify({ preflight_complete: true, requests, creates: 0, invites: 0 }));
} catch (error) {
  console.log(JSON.stringify({ stopped: true, reason: error.message.replace(/mirage1[a-z0-9]+/g, '[address]'), requests, creates: 0, invites: 0 }));
}
