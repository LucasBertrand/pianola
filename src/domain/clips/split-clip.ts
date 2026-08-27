import {
  MAXIMUM_ENTITY_ID_LENGTH,
  type ClipId,
  type InstrumentId,
  type NoteId,
  type Tick,
} from "../identifiers";
import type { Note } from "../notes/note";
import {
  getMeasureSpans,
  getMeterAtTick,
  getScaleMarkerAtTick,
  getTempoAtTick,
  isMeasureBoundary,
  type MeterMarker,
  type ScaleMarker,
  type SectionMarker,
  type TempoMarker,
} from "../transport/time-map";
import type { ProjectClock } from "../transport/transport";
import { assertValidClipTimeline } from "../validation/transport-validation";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
  type Clip,
  type Track,
} from "./clip";

export type ClipSplitStrategy =
  | { readonly type: "measures" }
  | {
      readonly type: "section-markers";
      readonly selectedSectionMarkerTicks: readonly Tick[];
    };

export interface SplitClipSegmentSource {
  readonly sourceClipId: ClipId;
  readonly segmentIndex: number;
  readonly segmentCount: number;
  readonly startTick: Tick;
  readonly endTick: Tick;
}

export interface SplitClipNoteSource extends SplitClipSegmentSource {
  readonly sourceNote: Note;
  readonly targetStartTick: Tick;
  readonly durationTicks: Tick;
}

export interface SplitClipOptions {
  readonly clock: ProjectClock;
  readonly strategy: ClipSplitStrategy;
  readonly createClipId: (source: SplitClipSegmentSource) => ClipId;
  readonly createNoteId: (source: SplitClipNoteSource) => NoteId;
  readonly createClipName?: (source: SplitClipSegmentSource) => string;
}

/**
 * Creates independent consecutive clips from one source clip. The returned
 * array length is the number of clips that can be shown in a confirmation UI
 * before dispatching the state command.
 */
export function splitClip(
  source: Clip,
  options: SplitClipOptions,
): readonly Clip[] {
  const splitPoints = getClipSplitPoints(
    source,
    options.clock,
    options.strategy,
  );
  const boundaries = [
    0,
    ...splitPoints,
    source.timeline.durationTicks,
  ];
  const segmentCount = boundaries.length - 1;
  const generatedClipIds = new Set<ClipId>();
  const generatedNoteIds = new Set<NoteId>();

  return boundaries.slice(0, -1).map((startTick, segmentIndex) => {
    const endTick = boundaries[segmentIndex + 1];

    if (endTick === undefined) {
      throw new Error("A split clip segment is missing its end boundary.");
    }

    const segmentSource: SplitClipSegmentSource = {
      sourceClipId: source.id,
      segmentIndex,
      segmentCount,
      startTick,
      endTick,
    };
    const clipId = options.createClipId(segmentSource);

    assertValidGeneratedId(clipId, "clip");

    if (clipId === source.id || generatedClipIds.has(clipId)) {
      throw new Error(`Generated clip ID "${clipId}" is not unique.`);
    }

    generatedClipIds.add(clipId);
    const name = options.createClipName?.(segmentSource)
      ?? createDefaultSplitClipName(source.name, segmentIndex, segmentCount);

    if (name.trim().length === 0 || name.length > MAXIMUM_CLIP_NAME_LENGTH) {
      throw new Error(
        `Generated clip names must contain between 1 and ${MAXIMUM_CLIP_NAME_LENGTH} characters.`,
      );
    }

    const clip = createSegmentClip(
      source,
      segmentSource,
      clipId,
      name,
      options.createNoteId,
      generatedNoteIds,
    );

    assertValidClipTimeline(clip.timeline, options.clock);
    return clip;
  });
}

/** Returns the internal measure boundaries selected by a split strategy. */
export function getClipSplitPoints(
  source: Pick<Clip, "timeline">,
  clock: ProjectClock,
  strategy: ClipSplitStrategy,
): readonly Tick[] {
  assertValidClipTimeline(source.timeline, clock);

  if (strategy.type === "measures") {
    return getMeasureSpans(
      clock.ppqn,
      source.timeline.timeMap,
      source.timeline.durationTicks,
    )
      .slice(1)
      .map((span) => span.startTick);
  }

  const selectedTicks = new Set(strategy.selectedSectionMarkerTicks);

  if (selectedTicks.size !== strategy.selectedSectionMarkerTicks.length) {
    throw new RangeError("Selected section marker ticks must be unique.");
  }

  for (const tick of selectedTicks) {
    const isSectionMarker = source.timeline.timeMap.sectionMarkers.some(
      (marker) => marker.startTick === tick,
    );

    if (
      !isSectionMarker
      || !isMeasureBoundary(
        clock.ppqn,
        source.timeline.timeMap,
        source.timeline.durationTicks,
        tick,
      )
    ) {
      throw new RangeError(
        `Selected section marker at tick ${String(tick)} is not on an internal measure boundary.`,
      );
    }
  }

  return [...selectedTicks].sort((left, right) => left - right);
}

function createSegmentClip(
  source: Clip,
  segment: SplitClipSegmentSource,
  clipId: ClipId,
  name: string,
  createNoteId: SplitClipOptions["createNoteId"],
  generatedNoteIds: Set<NoteId>,
): Clip {
  const durationTicks = segment.endTick - segment.startTick;
  const tracksByInstrumentId: Record<
    InstrumentId,
    Track & { notesById: Record<NoteId, Note> }
  > = {};

  for (const [instrumentId, sourceTrack] of Object.entries(
    source.tracksByInstrumentId,
  )) {
    const notesById: Record<NoteId, Note> = {};

    for (const sourceNote of Object.values(sourceTrack.notesById)) {
      const sourceNoteEndTick = sourceNote.startTick + sourceNote.durationTicks;
      const fragmentStartTick = Math.max(
        sourceNote.startTick,
        segment.startTick,
      );
      const fragmentEndTick = Math.min(sourceNoteEndTick, segment.endTick);

      if (fragmentStartTick >= fragmentEndTick) {
        continue;
      }

      const targetStartTick = fragmentStartTick - segment.startTick;
      const fragmentDurationTicks = fragmentEndTick - fragmentStartTick;
      const noteId = createNoteId({
        ...segment,
        sourceNote,
        targetStartTick,
        durationTicks: fragmentDurationTicks,
      });

      assertValidGeneratedId(noteId, "note");

      if (generatedNoteIds.has(noteId)) {
        throw new Error(`Generated note ID "${noteId}" is not unique.`);
      }

      notesById[noteId] = {
        ...sourceNote,
        id: noteId,
        startTick: targetStartTick,
        durationTicks: fragmentDurationTicks,
      };
      generatedNoteIds.add(noteId);
    }

    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById,
    };
  }

  return {
    id: clipId,
    name,
    color: source.color,
    // The state command transfers the source bypass to the generated group.
    bypassEnabled: false,
    timeline: {
      durationTicks,
      timeMap: {
        meterMarkers: sliceMeterMarkers(source, segment.startTick, segment.endTick),
        tempoMarkers: sliceTempoMarkers(source, segment.startTick, segment.endTick),
        scaleMarkers: sliceScaleMarkers(source, segment.startTick, segment.endTick),
        sectionMarkers: sliceSectionMarkers(source, segment.startTick, segment.endTick),
      },
    },
    tracksByInstrumentId,
    transportSettings: {
      loop: { startTick: 0, endTick: durationTicks },
      loopEnabled: false,
    },
  };
}

function sliceMeterMarkers(
  source: Pick<Clip, "timeline">,
  startTick: Tick,
  endTick: Tick,
): MeterMarker[] {
  const markers = source.timeline.timeMap.meterMarkers
    .filter((marker) => marker.startTick >= startTick && marker.startTick < endTick)
    .map((marker) => ({
      startTick: marker.startTick - startTick,
      timeSignature: cloneTimeSignature(marker.timeSignature),
    }));

  if (markers[0]?.startTick !== 0) {
    markers.unshift({
      startTick: 0,
      timeSignature: cloneTimeSignature(
        getMeterAtTick(source.timeline.timeMap, startTick),
      ),
    });
  }

  return markers;
}

function sliceTempoMarkers(
  source: Pick<Clip, "timeline">,
  startTick: Tick,
  endTick: Tick,
): TempoMarker[] {
  const markers = source.timeline.timeMap.tempoMarkers
    .filter((marker) => marker.startTick >= startTick && marker.startTick < endTick)
    .map((marker) => ({
      ...marker,
      startTick: marker.startTick - startTick,
    }));

  if (markers[0]?.startTick !== 0) {
    markers.unshift({
      startTick: 0,
      bpm: getTempoAtTick(source.timeline.timeMap, startTick),
    });
  }

  return markers;
}

function sliceScaleMarkers(
  source: Pick<Clip, "timeline">,
  startTick: Tick,
  endTick: Tick,
): ScaleMarker[] {
  const markers = source.timeline.timeMap.scaleMarkers
    .filter((marker) => marker.startTick >= startTick && marker.startTick < endTick)
    .map((marker) => ({
      ...marker,
      startTick: marker.startTick - startTick,
    }));

  if (markers[0]?.startTick !== 0) {
    markers.unshift({
      ...getScaleMarkerAtTick(source.timeline.timeMap, startTick),
      startTick: 0,
    });
  }

  return markers;
}

function sliceSectionMarkers(
  source: Pick<Clip, "timeline">,
  startTick: Tick,
  endTick: Tick,
): SectionMarker[] {
  return source.timeline.timeMap.sectionMarkers
    .filter((marker) => marker.startTick >= startTick && marker.startTick < endTick)
    .map((marker) => ({
      ...marker,
      startTick: marker.startTick - startTick,
    }));
}

function cloneTimeSignature(
  timeSignature: MeterMarker["timeSignature"],
): MeterMarker["timeSignature"] {
  return timeSignature.beatGroups === undefined
    ? { ...timeSignature }
    : { ...timeSignature, beatGroups: [...timeSignature.beatGroups] };
}

function createDefaultSplitClipName(
  sourceName: string,
  segmentIndex: number,
  segmentCount: number,
): string {
  const suffix = ` ${String(segmentIndex + 1)}/${String(segmentCount)}`;
  return `${sourceName.slice(0, MAXIMUM_CLIP_NAME_LENGTH - suffix.length)}${suffix}`;
}

function assertValidGeneratedId(id: string, kind: "clip" | "note"): void {
  if (id.trim().length === 0 || id.length > MAXIMUM_ENTITY_ID_LENGTH) {
    throw new Error(
      `Generated ${kind} IDs must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    );
  }
}
