import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type User = {
  id: string;
  username: string;
  walletAddress: string;
  tier: string;
};

type AuthState = {
  user: User | null;
  isLoggedIn: boolean;
  recoveryPhrase: string | null;

  // Actions
  setUser: (user: User) => void;
  setRecoveryPhrase: (phrase: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      recoveryPhrase: null,

      setUser: (user) => set({ user, isLoggedIn: true }),
      setRecoveryPhrase: (phrase) => set({ recoveryPhrase: phrase }),
      logout: () =>
        set({ user: null, isLoggedIn: false, recoveryPhrase: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
