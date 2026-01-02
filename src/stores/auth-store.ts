import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type User = {
  id: string;
  username: string;
  walletAddress: string;
  tier: string;
  avatar?: string;
  followerCount?: number;
};

// Mock user for development
const MOCK_USER: User = {
  id: "user_123",
  username: "sonali",
  walletAddress: "0x1234...abcd",
  tier: "Premium",
  avatar: undefined,
  followerCount: 128,
};

// Set to true to force mock user (for development)
const USE_MOCK_USER = true;

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
      // Set mock user as logged in for development
      user: USE_MOCK_USER ? MOCK_USER : null,
      isLoggedIn: USE_MOCK_USER,
      recoveryPhrase: null,

      setUser: (user) => set({ user, isLoggedIn: true }),
      setRecoveryPhrase: (phrase) => set({ recoveryPhrase: phrase }),
      logout: () =>
        set({ user: null, isLoggedIn: false, recoveryPhrase: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => mmkvStorage),
      // Force mock user in development by overriding persisted state
      merge: (persistedState, currentState) => {
        if (USE_MOCK_USER) {
          return {
            ...currentState,
            ...(persistedState as Partial<AuthState>),
            // Override with mock user in development
            user: MOCK_USER,
            isLoggedIn: true,
          };
        }
        return {
          ...currentState,
          ...(persistedState as Partial<AuthState>),
        };
      },
    }
  )
);
