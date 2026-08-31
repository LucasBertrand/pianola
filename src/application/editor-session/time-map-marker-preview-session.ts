import type {
  ClipId,
  Tick,
} from "../../domain/identifiers";
import type {
  TimeMap,
} from "../../domain/transport/time-map";
import {
  MutableRenderSignal,
  type ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import type {
  SelectedTimeMapMarkerGroup,
} from "../../editor-core/selection/editor-selection";
import type {
  ProjectStorePort,
} from "../history/project-store";
import type {
  TimeMapMarkerCollision,
} from "../piano-roll/timeline/marker-collision-resolution";
import {
  projectTimeMapMarkerMove,
} from "../piano-roll/timeline/time-map-marker-move-projection";

export interface TimeMapMarkerMovePreview {
  readonly clipId: ClipId;
  readonly sourceRevision: number;
  readonly deltaTicks: Tick;
  readonly movedGroups: readonly SelectedTimeMapMarkerGroup[];
  readonly projectedTimeMap: TimeMap;
  readonly collisions: readonly TimeMapMarkerCollision[];
}

export interface TimeMapMarkerPreviewStart {
  readonly clipId: ClipId;
  readonly movedGroups: readonly SelectedTimeMapMarkerGroup[];
}

export type TimeMapMarkerPreviewToken = number;

interface ActiveTimeMapMarkerPreview {
  readonly token: TimeMapMarkerPreviewToken;
  readonly clipId: ClipId;
  readonly sourceRevision: number;
  readonly sourceTimeMap: TimeMap;
  readonly durationTicks: Tick;
  readonly movedGroups: readonly SelectedTimeMapMarkerGroup[];
}

/** Owns the transient musical projection of point-marker gestures. */
export class TimeMapMarkerPreviewSession {
  private readonly mutableSignal =
    new MutableRenderSignal<TimeMapMarkerMovePreview | null>(null);
  private active: ActiveTimeMapMarkerPreview | null = null;
  private nextToken = 0;

  public readonly signal: ReadonlyRenderSignal<
    TimeMapMarkerMovePreview | null
  > = this.mutableSignal;

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

  public begin(
    input: TimeMapMarkerPreviewStart,
  ): TimeMapMarkerPreviewToken {
    const state = this.projectStore.getState();
    const clip = state.clipsById[input.clipId];

    if (clip === undefined) {
      throw new Error(`Clip "${input.clipId}" does not exist.`);
    }

    const movedGroups = input.movedGroups.map((group) => ({
      startTick: group.startTick,
      kinds: group.kinds.slice(),
    }));
    const token = ++this.nextToken;

    this.active = {
      token,
      clipId: input.clipId,
      sourceRevision: state.revision,
      sourceTimeMap: clip.timeline.timeMap,
      durationTicks: clip.timeline.durationTicks,
      movedGroups,
    };
    this.publish(this.active, 0);
    return token;
  }

  public update(
    token: TimeMapMarkerPreviewToken,
    deltaTicks: Tick,
  ): void {
    const active = this.resolveActive(token);

    if (active !== null) {
      this.publish(active, deltaTicks);
    }
  }

  public clear(token: TimeMapMarkerPreviewToken): void {
    if (this.active?.token === token) {
      this.clearActive();
    }
  }

  public isActive(token: TimeMapMarkerPreviewToken): boolean {
    return this.resolveActive(token) !== null;
  }

  private resolveActive(
    token: TimeMapMarkerPreviewToken,
  ): ActiveTimeMapMarkerPreview | null {
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

  private publish(
    active: ActiveTimeMapMarkerPreview,
    deltaTicks: Tick,
  ): void {
    const projection = projectTimeMapMarkerMove({
      timeMap: active.sourceTimeMap,
      durationTicks: active.durationTicks,
      movedGroups: active.movedGroups,
      deltaTicks,
    });

    this.mutableSignal.set({
      clipId: active.clipId,
      sourceRevision: active.sourceRevision,
      deltaTicks,
      movedGroups: active.movedGroups,
      projectedTimeMap: projection.timeMap,
      collisions: projection.collisions,
    });
  }

  private clearActive(): void {
    this.active = null;
    this.mutableSignal.set(null);
  }
}

/** Resolves one clip's editorial time map without creating another owner. */
export function resolveEffectiveTimeMap(
  committedTimeMap: TimeMap,
  preview: TimeMapMarkerMovePreview | null,
  clipId: ClipId,
  sourceRevision: number,
): TimeMap {
  return preview !== null
    && preview.clipId === clipId
    && preview.sourceRevision === sourceRevision
    ? preview.projectedTimeMap
    : committedTimeMap;
}
