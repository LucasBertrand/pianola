import type {
  ClipId,
} from "../../domain/identifiers";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import {
  MutableRenderSignal,
  type ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import type {
  ProjectStorePort,
} from "../history/project-store";

export interface LoopPreview {
  readonly clipId: ClipId;
  readonly sourceRevision: number;
  readonly loop: LoopRegion;
  readonly loopEnabled: boolean;
}

export interface LoopPreviewStart {
  readonly clipId: ClipId;
}

export type LoopPreviewToken = number;

interface ActiveLoopPreview {
  readonly token: LoopPreviewToken;
  readonly clipId: ClipId;
  readonly sourceRevision: number;
  readonly durationTicks: number;
  readonly loopEnabled: boolean;
}

/** Owns the transient loop region independently from marker projections. */
export class LoopPreviewSession {
  private readonly mutableSignal =
    new MutableRenderSignal<LoopPreview | null>(null);
  private active: ActiveLoopPreview | null = null;
  private nextToken = 0;

  public readonly signal: ReadonlyRenderSignal<LoopPreview | null> =
    this.mutableSignal;

  public constructor(private readonly projectStore: ProjectStorePort) {
    projectStore.subscribe((state) => {
      if (
        this.active !== null
        && (
          state.revision !== this.active.sourceRevision
          || state.clipsById[this.active.clipId] === undefined
          || state.workspace.activeClipId !== this.active.clipId
        )
      ) {
        this.clearActive();
      }
    });
  }

  public begin(input: LoopPreviewStart): LoopPreviewToken {
    const state = this.projectStore.getState();
    const clip = state.clipsById[input.clipId];

    if (clip === undefined) {
      throw new Error(`Clip "${input.clipId}" does not exist.`);
    }

    const token = ++this.nextToken;

    this.active = {
      token,
      clipId: input.clipId,
      sourceRevision: state.revision,
      durationTicks: clip.timeline.durationTicks,
      loopEnabled: clip.transportSettings.loopEnabled,
    };
    this.publish(this.active, clip.transportSettings.loop);
    return token;
  }

  public update(token: LoopPreviewToken, loop: LoopRegion): void {
    const active = this.resolveActive(token);

    if (active !== null) {
      this.publish(active, loop);
    }
  }

  public clear(token: LoopPreviewToken): void {
    if (this.active?.token === token) {
      this.clearActive();
    }
  }

  public isActive(token: LoopPreviewToken): boolean {
    return this.resolveActive(token) !== null;
  }

  private resolveActive(token: LoopPreviewToken): ActiveLoopPreview | null {
    const active = this.active;

    if (active === null || active.token !== token) {
      return null;
    }

    const state = this.projectStore.getState();

    if (
      state.revision !== active.sourceRevision
      || state.clipsById[active.clipId] === undefined
      || state.workspace.activeClipId !== active.clipId
    ) {
      this.clearActive();
      return null;
    }

    return active;
  }

  private publish(active: ActiveLoopPreview, loop: LoopRegion): void {
    if (
      !Number.isSafeInteger(loop.startTick)
      || !Number.isSafeInteger(loop.endTick)
      || loop.startTick < 0
      || loop.endTick <= loop.startTick
      || loop.endTick > active.durationTicks
    ) {
      throw new RangeError("A loop preview must stay inside the clip.");
    }

    this.mutableSignal.set({
      clipId: active.clipId,
      sourceRevision: active.sourceRevision,
      loop: { ...loop },
      loopEnabled: active.loopEnabled,
    });
  }

  private clearActive(): void {
    this.active = null;
    this.mutableSignal.set(null);
  }
}

export function resolveEffectiveLoop(
  committedLoop: LoopRegion,
  preview: LoopPreview | null,
  clipId: ClipId,
  sourceRevision: number,
): LoopRegion {
  return preview !== null
    && preview.clipId === clipId
    && preview.sourceRevision === sourceRevision
    ? preview.loop
    : committedLoop;
}
