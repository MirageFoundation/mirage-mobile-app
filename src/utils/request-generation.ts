export type RequestGeneration = {
  generation: number;
  key: string;
};

export type RequestToken = RequestGeneration & {
  request: number;
  signal: AbortSignal;
};

export class RequestGenerationCoordinator {
  private generation = 0;
  private request = 0;
  private key: string | null = null;
  private controller: AbortController | null = null;

  activate(key: string): RequestGeneration {
    this.abortActive();
    this.generation += 1;
    this.key = key;
    return { generation: this.generation, key };
  }

  start(active: RequestGeneration): RequestToken | null {
    if (!this.isGenerationActive(active)) return null;

    this.abortActive();
    this.request += 1;
    this.controller = new AbortController();
    return {
      ...active,
      request: this.request,
      signal: this.controller.signal,
    };
  }

  isGenerationActive(active: RequestGeneration): boolean {
    return active.generation === this.generation && active.key === this.key;
  }

  isCurrent(token: RequestToken): boolean {
    return (
      this.isGenerationActive(token) &&
      token.request === this.request &&
      !token.signal.aborted
    );
  }

  settle(token: RequestToken): void {
    if (this.isCurrent(token)) this.controller = null;
  }

  invalidate(): void {
    this.abortActive();
    this.generation += 1;
    this.request += 1;
    this.key = null;
  }

  private abortActive(): void {
    this.controller?.abort();
    this.controller = null;
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (typeof error !== "object" || error === null) return false;
  return "code" in error && error.code === "ERR_CANCELED";
}
