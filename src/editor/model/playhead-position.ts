import type {
  ClipId,
  Tick,
} from "../../domain/identifiers";
import {
  MutableRenderSignal,
} from "./render-signal";

/** The single project playhead, located inside exactly one clip. */
export interface PlayheadPosition {
  readonly clipId: ClipId;
  readonly tick: Tick;
}

/**
 * Compatibility view for clip-local editor code. Setting it relocates the
 * unique playhead into the clip currently displayed by the editor.
 */
export class ActiveClipPlayheadTickSignal
  extends MutableRenderSignal<number> {
  public constructor(
    private readonly position: MutableRenderSignal<PlayheadPosition>,
    private readonly getActiveClipId: () => ClipId,
  ) {
    super(0);
  }

  public override get version(): number {
    return this.position.version;
  }

  public override get(): number {
    const current = this.position.get();

    return current.clipId === this.getActiveClipId() ? current.tick : 0;
  }

  public override set(tick: number): void {
    const clipId = this.getActiveClipId();
    const current = this.position.get();

    if (current.clipId !== clipId || current.tick !== tick) {
      this.position.set({ clipId, tick });
    }
  }

  public override invalidate(): void {
    this.position.invalidate();
  }

  public override subscribe(listener: () => void): () => void {
    return this.position.subscribe(listener);
  }
}
