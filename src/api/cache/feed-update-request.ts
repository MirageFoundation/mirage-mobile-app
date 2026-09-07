export function createFeedUpdateRequestGuard(getIdentity: () => string) {
  let active: { controller: AbortController; identity: string } | null = null;
  return {
    start() {
      if (active) return null;
      active = { controller: new AbortController(), identity: getIdentity() };
      return active.controller;
    },
    isCurrent(controller: AbortController) {
      return active?.controller === controller && !controller.signal.aborted &&
        active.identity === getIdentity();
    },
    finish(controller: AbortController) {
      if (active?.controller === controller) active = null;
    },
    cancel() {
      active?.controller.abort();
      active = null;
    },
  };
}
