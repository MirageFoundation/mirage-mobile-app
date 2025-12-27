import { createMMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

// Create MMKV instance using the v4 API
export const storage = createMMKV({ id: "mirage-storage" });

export const mmkvStorage: StateStorage = {
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name, value) => {
    storage.set(name, value);
  },
  removeItem: (name) => {
    storage.remove(name);
  },
};
