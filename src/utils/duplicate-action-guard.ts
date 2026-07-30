export type DuplicateActionGuard = {
  tryAcquire: () => boolean;
  release: () => void;
};

export function createDuplicateActionGuard(): DuplicateActionGuard {
  let isLocked = false;

  return {
    tryAcquire() {
      if (isLocked) return false;
      isLocked = true;
      return true;
    },
    release() {
      isLocked = false;
    },
  };
}
