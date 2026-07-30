import { BoundedLruMap, type BoundedLruEvictionHandler } from "@/src/utils/bounded-lru";

export class AvatarSvgCache<T> {
  private readonly parsed: BoundedLruMap<string, T>;
  private readonly inflight: BoundedLruMap<string, Promise<T>>;

  constructor(
    parsedCapacity: number,
    inflightCapacity: number,
    onEvict?: BoundedLruEvictionHandler<string, T>,
  ) {
    this.parsed = new BoundedLruMap(parsedCapacity, onEvict);
    this.inflight = new BoundedLruMap(inflightCapacity);
  }

  get size(): number {
    return this.parsed.size;
  }

  get inflightSize(): number {
    return this.inflight.size;
  }

  get(key: string): T | undefined {
    return this.parsed.get(key);
  }

  load(
    key: string,
    fetchXml: () => Promise<string>,
    parseXml: (xml: string) => T,
  ): Promise<T> {
    const cached = this.parsed.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const existing = this.inflight.get(key);
    if (existing) return existing;

    let promise: Promise<T> | undefined;
    promise = (async () => {
      try {
        const parsed = parseXml(await fetchXml());
        this.parsed.set(key, parsed);
        return parsed;
      } finally {
        if (this.inflight.peek(key) === promise) this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }
}
