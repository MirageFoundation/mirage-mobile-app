export type BoundedLruEvictionHandler<K, V> = (
  key: K,
  value: V,
  entryCount: number,
) => void;

export class BoundedLruMap<K, V> {
  private readonly values = new Map<K, V>();

  constructor(
    readonly capacity: number,
    private readonly onEvict?: BoundedLruEvictionHandler<K, V>,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("BoundedLruMap capacity must be a positive integer");
    }
  }

  get size(): number {
    return this.values.size;
  }

  get(key: K): V | undefined {
    const value = this.values.get(key);
    if (value === undefined && !this.values.has(key)) return undefined;
    this.values.delete(key);
    this.values.set(key, value as V);
    return value;
  }

  peek(key: K): V | undefined {
    return this.values.get(key);
  }

  has(key: K): boolean {
    if (!this.values.has(key)) return false;
    const value = this.values.get(key) as V;
    this.values.delete(key);
    this.values.set(key, value);
    return true;
  }

  set(key: K, value: V): this {
    this.values.delete(key);
    this.values.set(key, value);
    if (this.values.size > this.capacity) {
      const oldest = this.values.entries().next().value as [K, V] | undefined;
      if (oldest) {
        this.values.delete(oldest[0]);
        this.onEvict?.(oldest[0], oldest[1], this.values.size);
      }
    }
    return this;
  }

  delete(key: K): boolean {
    return this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

export class BoundedLruSet<T> {
  private readonly values: BoundedLruMap<T, true>;

  constructor(
    capacity: number,
    onEvict?: (value: T, entryCount: number) => void,
  ) {
    this.values = new BoundedLruMap(
      capacity,
      (key, _value, entryCount) => onEvict?.(key, entryCount),
    );
  }

  get size(): number {
    return this.values.size;
  }

  has(value: T): boolean {
    return this.values.has(value);
  }

  add(value: T): this {
    this.values.set(value, true);
    return this;
  }

  delete(value: T): boolean {
    return this.values.delete(value);
  }

  clear(): void {
    this.values.clear();
  }
}
