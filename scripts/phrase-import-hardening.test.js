import { expect, test } from "bun:test";
import { entropyToMnemonic, validateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { applyPhraseInput, resizePhraseInput, normalizeRecoveryPhrase, PHRASE_WORD_COUNTS } from "../src/domain/auth/phrase-input.ts";
import { loadInjectedModule } from "./fixtures/wallet-service-harness.js";
import { deferred, hookHarness } from "./fixtures/auth-hooks-harness.js";

function fixture(count) {
  return entropyToMnemonic(new Uint8Array(count / 3 * 4), wordlist);
}
function importHarness() {
  const hooks = hookHarness();
  const calls = [];
  let visible = true;
  let imported = async () => {};
  const usePhraseImport = loadInjectedModule("../../src/pages/auth/use-phrase-import.ts", {
    ...hooks, Keyboard: { dismiss() {} }, wordlist, validateMnemonic, normalizeRecoveryPhrase, PHRASE_WORD_COUNTS,
    useAuthStore: { getState: () => ({ isLoggedIn: true, importWallet: (phrase) => { calls.push(phrase); return imported(); } }) },
    exitAuthModal: () => calls.push("exit"), triggerHaptic() {},
  }, "usePhraseImport");
  return { hooks, calls, render: () => hooks.render(() => usePhraseImport(() => visible)), setVisible: (value) => { visible = value; }, setImport: (fn) => { imported = fn; } };
}

test("all BIP39 English lengths paste losslessly, normalize case/whitespace, and reach production import handler intact", async () => {
  for (const count of PHRASE_WORD_COUNTS) {
    const phrase = fixture(count);
    const pasted = applyPhraseInput(Array(12).fill(""), 7, `  ${phrase.toUpperCase().split(" ").join("\n\t ")}  `);
    expect(pasted.error).toBeUndefined();
    expect(pasted.words).toHaveLength(count);
    expect(pasted.words.join(" ")).toBe(phrase);
    const h = importHarness();
    h.render().handleWordsChange(pasted.words);
    await h.render().handleLogin();
    expect(h.calls).toEqual([phrase, "exit"]);
  }
});

test("valid 24-word phrase with a valid 12-word prefix never imports the prefix wallet", async () => {
  let phrase;
  for (let byte = 0; byte < 256; byte++) {
    const entropy = new Uint8Array(32); entropy[0] = byte;
    const candidate = entropyToMnemonic(entropy, wordlist);
    if (validateMnemonic(candidate.split(" ").slice(0, 12).join(" "), wordlist)) { phrase = candidate; break; }
  }
  expect(phrase).toBeDefined();
  const prefix = phrase.split(" ").slice(0, 12).join(" ");
  expect(mnemonicToSeedSync(phrase)).not.toEqual(mnemonicToSeedSync(prefix));
  const h = importHarness();
  h.render().handleWordsChange(applyPhraseInput(Array(12).fill(""), 0, phrase).words);
  await h.render().handleLogin();
  expect(h.calls[0]).toBe(phrase);
  expect(h.calls[0]).not.toBe(prefix);
});

test("unsupported/excess paste and invalid characters reject before altering fields; manual resize never truncates", () => {
  const original = fixture(12).split(" ");
  for (const length of [13, 14, 16, 17, 19, 20, 22, 23, 25, 48]) {
    const result = applyPhraseInput(original, 0, Array(length).fill("abandon").join(" "));
    expect(result.error).toBeDefined();
    expect(result.words).toBe(original);
  }
  expect(applyPhraseInput(original, 0, "abandon!").words).toBe(original);
  expect(applyPhraseInput(original, 11, "ability able").words).toBe(original);
  const longer = resizePhraseInput(original, 24).words;
  expect(longer.slice(0, 12)).toEqual(original);
  const entered = applyPhraseInput(longer, 23, "zoo").words;
  expect(resizePhraseInput(entered, 12).words).toBe(entered);
  const cleared = applyPhraseInput(entered, 23, "").words;
  expect(resizePhraseInput(cleared, 12).words).toEqual(original);
});

test("invalid word and checksum errors are accurate and never invoke import", async () => {
  const h = importHarness();
  const words = fixture(12).split(" "); words[3] = "notaword";
  h.render().handleWordsChange(words);
  await h.render().handleLogin();
  expect(h.render().errors).toEqual({ 3: true });
  expect(h.render().loginError).toContain("highlighted");
  h.render().handleWordsChange(Array(12).fill("abandon"));
  await h.render().handleLogin();
  expect(h.render().loginError).toContain("checksum");
  expect(h.calls).toHaveLength(0);
});

test("production import handler locks same-frame taps, ignores edits in flight, clears successful secrets, and fences unmount", async () => {
  const h = importHarness();
  const waiting = deferred();
  h.setImport(() => waiting.promise);
  h.render().handleWordsChange(fixture(24).split(" "));
  const action = h.render();
  const first = action.handleLogin();
  await action.handleLogin();
  action.handleWordsChange(fixture(12).split(" "));
  expect(h.render().words).toHaveLength(24);
  expect(h.calls).toHaveLength(1);
  h.hooks.unmount();
  waiting.resolve();
  await first;
  expect(h.calls).toHaveLength(1);
});

test("inactive import cannot submit and a failed replacement retains the input for explicit retry", async () => {
  const h = importHarness();
  h.render().handleWordsChange(fixture(15).split(" "));
  h.setVisible(false);
  await h.render().handleLogin();
  expect(h.calls).toHaveLength(0);
  h.setVisible(true);
  h.setImport(async () => { throw new Error("synthetic storage rollback"); });
  await h.render().handleLogin();
  expect(h.render().words).toHaveLength(15);
  expect(h.render().loginError).toContain("existing recovery key");
});

test("a rejected paste cannot leave an old valid phrase authorized for accidental import", async () => {
  const h = importHarness();
  h.render().handleWordsChange(fixture(12).split(" "));
  const previousAction = h.render();
  const rejected = applyPhraseInput(previousAction.words, 0, Array(25).fill("abandon").join(" "));
  previousAction.handleInputError(rejected.error);
  await previousAction.handleLogin();
  expect(h.calls).toHaveLength(0);
  expect(h.render().isComplete).toBe(false);
  expect(h.render().words.join(" ")).toBe(fixture(12));
  h.render().handleWordsChange(fixture(24).split(" "));
  await h.render().handleLogin();
  expect(h.calls[0]).toBe(fixture(24));
});
