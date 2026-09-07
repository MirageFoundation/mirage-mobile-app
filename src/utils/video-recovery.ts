export type VideoRecoveryPhase = "loading" | "playable" | "recovering" | "terminal";

export function isPermanentVideoFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  return [401, 403, 404, 410, 415].includes(error.status as number);
}

export function createVideoRecovery({
  eligible, reload, changed, schedule = setTimeout, cancel = clearTimeout,
}: {
  eligible: () => boolean;
  reload: () => Promise<unknown>;
  changed: (phase: VideoRecoveryPhase) => void;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}) {
  let phase: VideoRecoveryPhase = "loading";
  let retries = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let version = 0;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const set = (next: VideoRecoveryPhase) => { phase = next; changed(next); };
  const valid = () => !disposed && eligible();
  const fail = (error?: unknown) => {
    if (!valid() || phase === "terminal") return;
    if (isPermanentVideoFailure(error)) { clear(); set("terminal"); return; }
    if (timer !== undefined) return;
    if (retries >= 2) { set("terminal"); return; }
    set("recovering");
    const generation = version;
    timer = schedule(() => {
      timer = undefined;
      if (!valid() || generation !== version) return;
      retries += 1;
      void reload().catch((error) => {
        if (valid() && generation === version) fail(error);
      });
    }, 1000 * (retries + 1));
  };
  return {
    fail,
    terminal: () => { if (valid()) { clear(); set("terminal"); } },
    firstFrame: () => {
      if (!valid() || phase === "terminal") return false;
      clear(); retries = 0; version += 1; set("playable"); return true;
    },
    retry: () => {
      if (!valid()) return;
      clear(); version += 1; retries = 0; set("loading");
      const generation = version;
      void reload().catch((error) => { if (valid() && generation === version) fail(error); });
    },
    suspend: () => { clear(); version += 1; },
    resume: () => { if (phase === "recovering") fail(); },
    dispose: () => { disposed = true; clear(); version += 1; },
  };
}
