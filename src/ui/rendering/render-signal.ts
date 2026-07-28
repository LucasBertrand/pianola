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
