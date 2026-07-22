export type ServerRequestContext = {
  baseUrl: string;
  identity: string;
  generation: number;
};

export type ServerSwitchHooks = {
  beforeCommit?: (previous: ServerRequestContext) => Promise<void> | void;
  afterCommit?: (
    previous: ServerRequestContext,
    current: ServerRequestContext,
  ) => Promise<void> | void;
  rollback?: (
    previous: ServerRequestContext,
    failed: ServerRequestContext | null,
  ) => Promise<void> | void;
};

export class StaleServerResponseError extends Error {
  constructor() {
    super("Response belongs to an inactive API server generation");
    this.name = "StaleServerResponseError";
  }
}

export function normalizeServerBaseUrl(value: string): string {
  const trimmed = value.trim();
  const parsed = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  return parsed.toString().replace(/\/$/, "");
}

let activeServerIdentity = normalizeServerBaseUrl("https://mirage.talk");

export function getServerIdentity(): string {
  return activeServerIdentity;
}

export function serverQueryRoot(identity = getServerIdentity()) {
  return ["server", normalizeServerBaseUrl(identity)] as const;
}

export class ServerRequestCoordinator {
  private context: ServerRequestContext;
  private activeWrites = 0;
  private writeWaiters: (() => void)[] = [];
  private readControllers = new Map<number, Set<AbortController>>();
  private switchGate: Promise<void> | null = null;
  private releaseSwitchGate: (() => void) | null = null;
  private pendingSwitches = 0;
  private switchTail = Promise.resolve();

  constructor(baseUrl: string) {
    this.context = this.createContext(baseUrl, 0);
    activeServerIdentity = this.context.identity;
  }

  getContext(): ServerRequestContext {
    return this.context;
  }

  assertCurrent(context: ServerRequestContext): void {
    if (context.generation !== this.context.generation) {
      throw new StaleServerResponseError();
    }
  }

  replaceImmediately(baseUrl: string): ServerRequestContext {
    const normalized = normalizeServerBaseUrl(baseUrl);
    if (normalized === this.context.identity) return this.context;

    this.cancelReads(this.context.generation);
    this.context = this.createContext(normalized, this.context.generation + 1);
    activeServerIdentity = this.context.identity;
    return this.context;
  }

  runRead<T>(
    operation: (
      context: ServerRequestContext,
      signal: AbortSignal,
    ) => Promise<T>,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    const context = this.context;
    const controller = new AbortController();
    const abortFromExternalSignal = () => controller.abort();
    if (externalSignal?.aborted) {
      controller.abort();
    } else {
      externalSignal?.addEventListener("abort", abortFromExternalSignal, {
        once: true,
      });
    }
    const controllers = this.readControllers.get(context.generation) ?? new Set();
    controllers.add(controller);
    this.readControllers.set(context.generation, controllers);

    return operation(context, controller.signal)
      .then((result) => {
        this.assertCurrent(context);
        return result;
      })
      .finally(() => {
        externalSignal?.removeEventListener("abort", abortFromExternalSignal);
        controllers.delete(controller);
        if (controllers.size === 0) {
          this.readControllers.delete(context.generation);
        }
      });
  }

  runWrite<T>(operation: (context: ServerRequestContext) => Promise<T>): Promise<T> {
    if (this.switchGate) {
      return this.switchGate.then(() => this.runWrite(operation));
    }
    return this.startWrite(operation);
  }

  switchServer(baseUrl: string, hooks: ServerSwitchHooks = {}): Promise<void> {
    this.pendingSwitches += 1;
    if (!this.switchGate) {
      this.switchGate = new Promise<void>((resolve) => {
        this.releaseSwitchGate = resolve;
      });
    }

    const run = () => this.executeSwitch(baseUrl, hooks);
    const result = this.switchTail.then(run, run);
    this.switchTail = result.then(
      () => undefined,
      () => undefined,
    );
    result.then(
      () => this.finishSwitch(),
      () => this.finishSwitch(),
    );
    return result;
  }

  private startWrite<T>(
    operation: (context: ServerRequestContext) => Promise<T>,
  ): Promise<T> {
    const context = this.context;
    this.activeWrites += 1;
    return operation(context)
      .then((result) => {
        this.assertCurrent(context);
        return result;
      })
      .finally(() => {
        this.activeWrites -= 1;
        if (this.activeWrites === 0) {
          this.writeWaiters.splice(0).forEach((resolve) => resolve());
        }
      });
  }

  private async executeSwitch(
    baseUrl: string,
    hooks: ServerSwitchHooks,
  ): Promise<void> {
    const normalized = normalizeServerBaseUrl(baseUrl);
    if (normalized === this.context.identity) return;

    const previous = this.context;
    let failedContext: ServerRequestContext | null = null;
    this.cancelReads(previous.generation);

    try {
      await this.waitForWrites();
      await hooks.beforeCommit?.(previous);
      failedContext = this.replaceImmediately(normalized);
      await hooks.afterCommit?.(previous, failedContext);
    } catch (error) {
      if (failedContext) {
        this.replaceImmediately(previous.baseUrl);
      }
      try {
        await hooks.rollback?.(previous, failedContext);
      } catch {
        // Preserve the transaction failure; rollback diagnostics belong to the caller.
      }
      throw error;
    }
  }

  private finishSwitch(): void {
    this.pendingSwitches -= 1;
    if (this.pendingSwitches === 0) {
      const release = this.releaseSwitchGate;
      this.switchGate = null;
      this.releaseSwitchGate = null;
      release?.();
    }
  }

  private waitForWrites(): Promise<void> {
    if (this.activeWrites === 0) return Promise.resolve();
    return new Promise((resolve) => this.writeWaiters.push(resolve));
  }

  private cancelReads(generation: number): void {
    this.readControllers.get(generation)?.forEach((controller) => controller.abort());
  }

  private createContext(baseUrl: string, generation: number): ServerRequestContext {
    const normalized = normalizeServerBaseUrl(baseUrl);
    return { baseUrl: normalized, identity: normalized, generation };
  }
}
