import { getUserStatus } from "@/src/api/read/endpoints/users";
import { useRouter } from "@/src/navigation/guarded-router";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore } from "@/src/stores";
import { getTierName } from "@/src/utils/tiers";
import { isValidMnemonic } from "@/src/wallet";
import { Keyboard } from "react-native";
import { useCallback, useState } from "react";

export function useLoginForm() {
  const router = useRouter();
  const importWallet = useAuthStore((s) => s.importWallet);
  const setUserLevel = useAuthStore((s) => s.setUserLevel);
  const setHasUsername = useAuthStore((s) => s.setHasUsername);
  const setUser = useAuthStore((s) => s.setUser);

  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const isComplete = words.every((word) => word.length > 0);

  const handleWordsChange = useCallback((nextWords: string[]) => {
    setWords(nextWords);
    setLoginError(null);
    setErrors({});
  }, []);

  const handleComplete = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const validatePhrase = useCallback(() => {
    const phrase = words.join(" ").trim().toLowerCase();

    if (!isValidMnemonic(phrase)) {
      const nextErrors: Record<number, boolean> = {};

      words.forEach((word, index) => {
        if (word.length < 3) {
          nextErrors[index] = true;
        }
      });

      if (Object.keys(nextErrors).length === 0) {
        words.forEach((_, index) => {
          nextErrors[index] = true;
        });
      }

      setErrors(nextErrors);
      return false;
    }

    return true;
  }, [words]);

  const handleLogin = useCallback(async () => {
    if (!isComplete) return;

    const phrase = words.join(" ").trim().toLowerCase();

    if (!validatePhrase()) {
      triggerHaptic("error");
      setLoginError("Invalid recovery phrase. Please check your words.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("selection");
    Keyboard.dismiss();

    try {
      await importWallet(phrase);

      const walletAddress = useAuthStore.getState().walletAddress;

      if (walletAddress) {
        try {
          const userStatus = await getUserStatus({ address: walletAddress });
          setUserLevel(userStatus.user_level);

          if (userStatus.username) {
            setHasUsername(true);
            setUser({
              id: walletAddress,
              username: userStatus.username,
              walletAddress,
              tier: getTierName(userStatus.user_level),
            });
          }
        } catch (apiError) {
          console.warn("[Login] Failed to fetch user status:", apiError);
        }
      }

      triggerHaptic("success");
      router.dismissAll();
    } catch (error) {
      console.error("[Login] Failed to import wallet:", error);
      triggerHaptic("error");

      if (error instanceof Error) {
        if (error.message.includes("Invalid mnemonic")) {
          setLoginError("Invalid recovery phrase. Please check your words.");
        } else if (error.message.includes("already exists")) {
          setLoginError("A wallet already exists. Please logout first.");
        } else {
          setLoginError("Failed to import wallet. Please try again.");
        }
      } else {
        setLoginError("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    importWallet,
    isComplete,
    router,
    setHasUsername,
    setUser,
    setUserLevel,
    validatePhrase,
    words,
  ]);

  return {
    errors,
    handleComplete,
    handleLogin,
    handleWordsChange,
    isComplete,
    isLoading,
    loginError,
    words,
  };
}
