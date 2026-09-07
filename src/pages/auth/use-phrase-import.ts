import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { wordlist } from "@scure/bip39/wordlists/english";
import { validateMnemonic } from "@scure/bip39";
import { normalizeRecoveryPhrase, PHRASE_WORD_COUNTS } from "@/src/domain/auth/phrase-input";
import { useAuthStore } from "@/src/stores/auth-store";
import { exitAuthModal } from "@/src/navigation/auth-navigation";
import { triggerHaptic } from "@/src/components/utils/haptics";

export function usePhraseImport(isVisible: () => boolean) {
  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const locked = useRef(false);
  const inputBlocked = useRef(false);
  const [hasInputError, setHasInputError] = useState(false);
  const handleInputError = useCallback((message: string | null) => {
    if (locked.current || !isVisible()) return;
    inputBlocked.current = message !== null;
    setHasInputError(message !== null);
    setLoginError(message);
  }, [isVisible]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const handleWordsChange = useCallback((next: string[]) => {
    if (locked.current || !isVisible()) return;
    inputBlocked.current = false;
    setHasInputError(false);
    setWords(next);
    setErrors({});
    setLoginError(null);
  }, [isVisible]);
  const isComplete = !hasInputError && words.every(Boolean) && (PHRASE_WORD_COUNTS as readonly number[]).includes(words.length);
  const handleLogin = useCallback(async () => {
    if (locked.current || inputBlocked.current || !isVisible() || !isComplete) return;
    locked.current = true;
    const phrase = normalizeRecoveryPhrase(words.join(" "));
    try {
      const invalid = Object.fromEntries(words.flatMap((word, index) => wordlist.includes(word) ? [] : [[index, true]]));
      if (Object.keys(invalid).length || !validateMnemonic(phrase, wordlist)) {
        setErrors(invalid);
        setLoginError(Object.keys(invalid).length ? "Check the highlighted English recovery words." : "These words do not form a valid recovery phrase. Check their order and checksum.");
        triggerHaptic("error");
        return;
      }
      setIsLoading(true);
      Keyboard.dismiss();
      await useAuthStore.getState().importWallet(phrase);
      if (!mounted.current) return;
      setWords(Array(12).fill(""));
      if (!isVisible() || !useAuthStore.getState().isLoggedIn) return;
      triggerHaptic("success");
      exitAuthModal();
    } catch {
      if (mounted.current) setLoginError("Unable to import. Your existing recovery key has not been intentionally discarded. Check any wallet recovery notice before retrying.");
    } finally {
      locked.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }, [isVisible, isComplete, words]);
  return { words, errors, isLoading, loginError, isComplete, handleWordsChange, handleInputError, handleLogin };
}
