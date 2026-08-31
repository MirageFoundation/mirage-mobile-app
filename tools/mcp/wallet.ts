import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { bech32 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";

const DERIVATION_PATH = "m/44'/118'/0'/0/0";
const ADDRESS_PREFIX = "mirage";

export function addressFromMnemonic(mnemonic: string): string {
  const normalized = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(normalized, wordlist)) throw new Error("Configured mnemonic is invalid");

  const child = HDKey.fromMasterSeed(mnemonicToSeedSync(normalized)).derive(DERIVATION_PATH);
  if (!child.privateKey) throw new Error("Failed to derive wallet key");

  const publicKey = secp256k1.getPublicKey(child.privateKey, true);
  const accountHash = ripemd160(sha256(publicKey));
  return bech32.encode(ADDRESS_PREFIX, bech32.toWords(accountHash));
}
