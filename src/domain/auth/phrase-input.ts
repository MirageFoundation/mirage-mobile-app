export const PHRASE_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
export const PHRASE_LENGTH_ERROR = "Use a complete 12, 15, 18, 21, or 24-word English recovery phrase. Nothing was changed.";
export function normalizeRecoveryPhrase(value: string): string {
  return value.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}
export function applyPhraseInput(words: string[], index: number, text: string): { words: string[]; error?: string } {
  const normalized = normalizeRecoveryPhrase(text);
  const incoming = normalized ? normalized.split(" ") : [""];
  if (incoming.some((word) => !/^[a-z]*$/.test(word))) {
    return { words, error: "Use English recovery words only. Nothing was changed." };
  }
  if (incoming.length >= 12) {
    if (!(PHRASE_WORD_COUNTS as readonly number[]).includes(incoming.length)) return { words, error: PHRASE_LENGTH_ERROR };
    return { words: incoming };
  }
  if (index < 0 || index + incoming.length > words.length) return { words, error: PHRASE_LENGTH_ERROR };
  const next = [...words];
  incoming.forEach((word, offset) => { next[index + offset] = word; });
  return { words: next };
}
export function resizePhraseInput(words: string[], count: number): { words: string[]; error?: string } {
  if (!(PHRASE_WORD_COUNTS as readonly number[]).includes(count) || words.slice(count).some(Boolean)) {
    return { words, error: "Clear the extra words before selecting a shorter phrase. Nothing was changed." };
  }
  return { words: Array.from({ length: count }, (_, index) => words[index] ?? "") };
}
