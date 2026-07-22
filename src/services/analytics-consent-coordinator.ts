export type AnalyticsSdk = {
  init: () => Promise<void>;
  optInTracking: () => Promise<void>;
  optOutTracking: () => Promise<void>;
  reset: () => Promise<void>;
  registerSuperProperties: (properties: Record<string, unknown>) => void;
  identify: (distinctId: string) => Promise<void>;
  getPeople: () => {
    set: (properties: Record<string, unknown>) => void;
  };
  track: (event: string, properties?: Record<string, unknown>) => void;
  flush: () => void;
};

type Initialization = {
  generation: number;
  promise: Promise<void>;
};

export class AnalyticsConsentCoordinator {
  private generation = 0;
  private consentGranted = false;
  private instance: AnalyticsSdk | null = null;
  private initialization: Initialization | null = null;
  private pendingInstances = new Set<AnalyticsSdk>();
  private disposingInstances = new WeakSet<AnalyticsSdk>();

  constructor(
    private readonly createSdk: () => AnalyticsSdk,
    private readonly superProperties: Record<string, unknown>,
  ) {}

  async enable(): Promise<boolean> {
    const newlyGranted = !this.consentGranted;
    if (newlyGranted) {
      this.consentGranted = true;
      this.generation += 1;
    }

    const generation = this.generation;
    if (this.instance && this.isCurrent(generation)) return newlyGranted;

    if (
      !this.initialization ||
      this.initialization.generation !== generation
    ) {
      const promise = this.initialize(generation);
      this.initialization = { generation, promise };
    }

    await this.initialization.promise;
    return newlyGranted && this.isActiveFor(generation);
  }

  disable(): Promise<void> {
    this.consentGranted = false;
    this.generation += 1;
    this.initialization = null;

    const instance = this.instance;
    this.instance = null;
    return instance ? this.dispose(instance) : Promise.resolve();
  }

  isActive(): boolean {
    return this.consentGranted && this.instance !== null;
  }

  async identify(
    distinctId: string,
    profileProperties: Record<string, unknown>,
  ): Promise<void> {
    const current = this.captureActive();
    if (!current) return;

    await current.instance.identify(distinctId);
    if (!this.matches(current)) return;

    if (Object.keys(profileProperties).length > 0) {
      current.instance.getPeople().set(profileProperties);
    }
  }

  setProfile(properties: Record<string, unknown>): void {
    const current = this.captureActive();
    if (!current || Object.keys(properties).length === 0) return;
    if (!this.matches(current)) return;
    current.instance.getPeople().set(properties);
  }

  registerSuperProperties(properties: Record<string, unknown>): void {
    const current = this.captureActive();
    if (!current || !this.matches(current)) return;
    current.instance.registerSuperProperties(properties);
  }

  track(event: string, properties?: Record<string, unknown>): void {
    const current = this.captureActive();
    if (!current || !this.matches(current)) return;
    current.instance.track(event, properties);
  }

  flush(): void {
    const current = this.captureActive();
    if (!current || !this.matches(current)) return;
    current.instance.flush();
  }

  async resetIdentity(): Promise<void> {
    const current = this.captureActive();
    if (!current || !this.matches(current)) return;
    await current.instance.reset();
  }

  private async initialize(generation: number): Promise<void> {
    const instance = this.createSdk();
    this.pendingInstances.add(instance);

    try {
      await instance.init();
      if (!this.isCurrent(generation)) return;

      await instance.optInTracking();
      if (!this.isCurrent(generation)) return;

      instance.registerSuperProperties(this.superProperties);
      if (!this.isCurrent(generation)) return;

      this.instance = instance;
    } finally {
      this.pendingInstances.delete(instance);
      if (!this.isCurrent(generation) || this.instance !== instance) {
        await this.dispose(instance);
      }
      if (this.initialization?.generation === generation) {
        this.initialization = null;
      }
    }
  }

  private captureActive(): {
    generation: number;
    instance: AnalyticsSdk;
  } | null {
    if (!this.consentGranted || !this.instance) return null;
    return { generation: this.generation, instance: this.instance };
  }

  private matches(current: {
    generation: number;
    instance: AnalyticsSdk;
  }): boolean {
    return (
      this.isCurrent(current.generation) && this.instance === current.instance
    );
  }

  private isCurrent(generation: number): boolean {
    return this.consentGranted && this.generation === generation;
  }

  private isActiveFor(generation: number): boolean {
    return this.isCurrent(generation) && this.instance !== null;
  }

  private async dispose(instance: AnalyticsSdk): Promise<void> {
    if (this.disposingInstances.has(instance)) return;
    this.disposingInstances.add(instance);
    try {
      await instance.optOutTracking();
    } catch {
      // Best-effort cleanup continues with identity reset.
    }
    try {
      await instance.reset();
    } catch {
      // The generation guard still prevents any further use of this instance.
    }
  }
}
