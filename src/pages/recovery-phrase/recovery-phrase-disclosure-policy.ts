export const RECOVERY_PHRASE_DISCLOSURE_TIMEOUT_MS = 60_000;

export type RecoveryPhraseDisclosurePhase =
  | "locked"
  | "authenticating"
  | "exporting"
  | "revealed";

export type RecoveryPhraseDisclosureSnapshot = {
  phase: RecoveryPhraseDisclosurePhase;
  phrase: string | null;
  expiresAt: number | null;
};

export type DisclosureClearReason =
  | "auth-failure"
  | "inactivity"
  | "app-inactive"
  | "background"
  | "blur"
  | "cleanup";

export class RecoveryPhraseDisclosurePolicy {
  private generation = 0;
  private snapshot: RecoveryPhraseDisclosureSnapshot = {
    phase: "locked",
    phrase: null,
    expiresAt: null,
  };

  constructor(
    private readonly timeoutMs = RECOVERY_PHRASE_DISCLOSURE_TIMEOUT_MS,
  ) {}

  getSnapshot(): RecoveryPhraseDisclosureSnapshot {
    return this.snapshot;
  }

  beginAuthentication(): number {
    const request = ++this.generation;
    this.snapshot = {
      phase: "authenticating",
      phrase: null,
      expiresAt: null,
    };
    return request;
  }

  authenticationSucceeded(request: number): number | null {
    if (
      request !== this.generation ||
      this.snapshot.phase !== "authenticating"
    ) {
      return null;
    }

    this.snapshot = { phase: "exporting", phrase: null, expiresAt: null };
    return request;
  }

  authenticationFailed(request: number): void {
    if (request === this.generation) {
      this.clear("auth-failure");
    }
  }

  completeExport(request: number, phrase: string | null, now: number): boolean {
    if (
      request !== this.generation ||
      this.snapshot.phase !== "exporting" ||
      !phrase
    ) {
      return false;
    }

    this.snapshot = {
      phase: "revealed",
      phrase,
      expiresAt: now + this.timeoutMs,
    };
    return true;
  }

  getActivePhrase(now: number): string | null {
    if (
      this.snapshot.phase !== "revealed" ||
      this.snapshot.expiresAt === null
    ) {
      return null;
    }

    if (now >= this.snapshot.expiresAt) {
      this.clear("inactivity");
      return null;
    }

    return this.snapshot.phrase;
  }

  expire(now: number): boolean {
    if (
      this.snapshot.phase === "revealed" &&
      this.snapshot.expiresAt !== null &&
      now >= this.snapshot.expiresAt
    ) {
      this.clear("inactivity");
      return true;
    }
    return false;
  }

  clear(_reason: DisclosureClearReason): void {
    this.generation += 1;
    this.snapshot = { phase: "locked", phrase: null, expiresAt: null };
  }
}
