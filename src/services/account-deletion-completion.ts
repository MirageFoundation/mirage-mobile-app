export type AccountDeletionCompletionResult =
  | { status: "completed" }
  | { status: "cancelled" }
  | { status: "request_failed"; error: unknown }
  | {
      status: "logout_failed";
      error: unknown;
      fallbackError?: unknown;
    };

export type AccountDeletionCompletionDependencies = {
  requestDeletion: () => Promise<void>;
  logout: () => Promise<void>;
  ensureLoggedOut: () => void | Promise<void>;
  onCompleted: () => void | Promise<void>;
  successDelayMs?: number;
};

export class AccountDeletionCompletionCoordinator {
  private generation = 0;
  private active: Promise<AccountDeletionCompletionResult> | null = null;
  private cancelDelay: (() => void) | null = null;

  run(
    dependencies: AccountDeletionCompletionDependencies,
  ): Promise<AccountDeletionCompletionResult> {
    if (this.active) return this.active;

    const generation = ++this.generation;
    const execution = this.execute(generation, dependencies);
    const active = execution.finally(() => {
      if (this.active === active) this.active = null;
    });
    this.active = active;
    return active;
  }

  cancel(): void {
    this.generation += 1;
    this.cancelDelay?.();
    this.cancelDelay = null;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private async wait(generation: number, delayMs: number): Promise<boolean> {
    if (delayMs <= 0) return this.isCurrent(generation);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (isCurrent: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.cancelDelay === cancel) this.cancelDelay = null;
        resolve(isCurrent);
      };
      const timer = setTimeout(
        () => finish(this.isCurrent(generation)),
        delayMs,
      );
      const cancel = () => finish(false);
      this.cancelDelay = cancel;
    });
  }

  private async execute(
    generation: number,
    dependencies: AccountDeletionCompletionDependencies,
  ): Promise<AccountDeletionCompletionResult> {
    try {
      await dependencies.requestDeletion();
    } catch (error) {
      return this.isCurrent(generation)
        ? { status: "request_failed", error }
        : { status: "cancelled" };
    }

    if (!this.isCurrent(generation)) return { status: "cancelled" };
    const delayCompleted = await this.wait(
      generation,
      dependencies.successDelayMs ?? 0,
    );
    if (!delayCompleted || !this.isCurrent(generation)) {
      return { status: "cancelled" };
    }

    try {
      await dependencies.logout();
    } catch (error) {
      let fallbackError: unknown;
      try {
        await dependencies.ensureLoggedOut();
      } catch (fallbackFailure) {
        fallbackError = fallbackFailure;
      }

      return this.isCurrent(generation)
        ? { status: "logout_failed", error, fallbackError }
        : { status: "cancelled" };
    }

    if (!this.isCurrent(generation)) return { status: "cancelled" };
    await dependencies.onCompleted();
    return { status: "completed" };
  }
}
