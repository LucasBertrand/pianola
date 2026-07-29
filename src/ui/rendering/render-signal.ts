export type RenderSignalListener = () => void;

export interface ReadonlyRenderSignal<T> {
  readonly version: number;
  get(): T;
  subscribe(listener: RenderSignalListener): () => void;
}

export class MutableRenderSignal<T> implements ReadonlyRenderSignal<T> {
  private currentValue: T;
  private currentVersion = 0;
  private readonly listeners = new Set<RenderSignalListener>();

  public constructor(initialValue: T) {
    this.currentValue = initialValue;
  }

  public get version(): number {
    return this.currentVersion;
  }

  public get(): T {
    return this.currentValue;
  }

  public set(value: T): void {
    if (Object.is(value, this.currentValue)) {
      return;
    }

    this.currentValue = value;
    this.invalidate();
  }

  public invalidate(): void {
    this.currentVersion += 1;

    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe(listener: RenderSignalListener): () => void {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  }
}

export class MappedRenderSignal<TSource, TValue>
  implements ReadonlyRenderSignal<TValue> {
  private readonly source: ReadonlyRenderSignal<TSource>;
  private readonly mapValue: (source: TSource) => TValue;

  public constructor(
    source: ReadonlyRenderSignal<TSource>,
    mapValue: (source: TSource) => TValue,
  ) {
    this.source = source;
    this.mapValue = mapValue;
  }

  public get version(): number {
    return this.source.version;
  }

  public get(): TValue {
    return this.mapValue(this.source.get());
  }

  public subscribe(listener: RenderSignalListener): () => void {
    return this.source.subscribe(listener);
  }
}
