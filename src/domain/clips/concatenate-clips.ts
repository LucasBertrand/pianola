import {
  MAXIMUM_CLIP_NOTE_COUNT,
  type Note,
} from "../notes/note";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
  type ClipId,
  type InstrumentId,
  type NoteId,
  type Tick,
} from "../identifiers";
import type {
  ProjectClock,
} from "../transport/transport";
import {
  assertValidClipTimeline,
} from "../validation/transport-validation";
import type {
  Clip,
  ClipInstrumentState,
  Track,
} from "./clip";

export interface ConcatenatedNoteSource {
  readonly sourceClipId: ClipId;
  readonly sourceClipIndex: number;
  readonly sourceNote: Note;
  readonly targetStartTick: Tick;
}

export interface ConcatenateClipsOptions {
  readonly id: ClipId;
  readonly name: string;
  readonly color: string;
  readonly clock: ProjectClock;
  readonly createNoteId: (source: ConcatenatedNoteSource) => NoteId;
}

/**
 * Creates a new clip by placing the supplied clips consecutively. Source clips
 * are left untouched and every note receives a new ID in the target clip.
 */
export function concatenateClips(
  clips: readonly Clip[],
  options: ConcatenateClipsOptions,
): Clip {
  const firstClip = clips[0];

  if (firstClip === undefined) {
    throw new RangeError("At least one clip is required for concatenation.");
  }

  const instrumentIds = Object.keys(
    firstClip.tracksByInstrumentId,
  ) as InstrumentId[];
  const expectedInstrumentIds = new Set(instrumentIds);
  let noteCount = 0;

  for (const clip of clips) {
    assertValidClipTimeline(clip.timeline, options.clock);
    assertCompatibleInstrumentIds(clip, expectedInstrumentIds);
    noteCount += Object.values(clip.tracksByInstrumentId).reduce(
      (count, track) => count + Object.keys(track.notesById).length,
      0,
    );

    if (noteCount > MAXIMUM_CLIP_NOTE_COUNT) {
      throw new RangeError(
        `A concatenated clip cannot contain more than ${MAXIMUM_CLIP_NOTE_COUNT} notes.`,
      );
    }
  }

  const tracksByInstrumentId = createEmptyTracks(instrumentIds);
  const instrumentStatesById = cloneInstrumentStates(
    firstClip.instrumentStatesById,
    instrumentIds,
  );
  const meterMarkers = [];
  const tempoMarkers = [];
  const scaleMarkers = [];
  const generatedNoteIds = new Set<NoteId>();
  let offsetTicks = 0;

  for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
    const clip = clips[clipIndex];

    if (clip === undefined) {
      continue;
    }

    for (const marker of clip.timeline.timeMap.meterMarkers) {
      meterMarkers.push({
        startTick: offsetTicks + marker.startTick,
        timeSignature: marker.timeSignature.beatGroups === undefined
          ? { ...marker.timeSignature }
          : {
              ...marker.timeSignature,
              beatGroups: [...marker.timeSignature.beatGroups],
            },
      });
    }

    for (const marker of clip.timeline.timeMap.tempoMarkers) {
      tempoMarkers.push({
        ...marker,
        startTick: offsetTicks + marker.startTick,
      });
    }

    for (const marker of clip.timeline.timeMap.scaleMarkers) {
      scaleMarkers.push({
        ...marker,
        startTick: offsetTicks + marker.startTick,
      });
    }

    for (const instrumentId of instrumentIds) {
      const sourceTrack = clip.tracksByInstrumentId[instrumentId];
      const targetTrack = tracksByInstrumentId[instrumentId];

      if (sourceTrack === undefined || targetTrack === undefined) {
        throw new Error(
          `Clip "${clip.id}" is missing instrument "${instrumentId}".`,
        );
      }

      for (const sourceNote of Object.values(sourceTrack.notesById)) {
        const targetStartTick = offsetTicks + sourceNote.startTick;
        const noteId = options.createNoteId({
          sourceClipId: clip.id,
          sourceClipIndex: clipIndex,
          sourceNote,
          targetStartTick,
        });

        assertValidGeneratedNoteId(noteId, generatedNoteIds);
        targetTrack.notesById[noteId] = {
          ...sourceNote,
          id: noteId,
          startTick: targetStartTick,
        };
        generatedNoteIds.add(noteId);
      }
    }

    offsetTicks += clip.timeline.durationTicks;

    if (!Number.isSafeInteger(offsetTicks)) {
      throw new RangeError(
        "The concatenated clip duration exceeds the supported tick range.",
      );
    }
  }

  const concatenatedClip: Clip = {
    id: options.id,
    name: options.name,
    color: options.color,
    timeline: {
      durationTicks: offsetTicks,
      timeMap: {
        meterMarkers,
        tempoMarkers,
        scaleMarkers,
      },
    },
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings: {
      loop: {
        startTick: 0,
        endTick: offsetTicks,
      },
      loopEnabled: false,
    },
  };

  assertValidClipTimeline(concatenatedClip.timeline, options.clock);
  return concatenatedClip;
}

function assertCompatibleInstrumentIds(
  clip: Clip,
  expectedInstrumentIds: ReadonlySet<InstrumentId>,
): void {
  const trackIds = Object.keys(clip.tracksByInstrumentId);
  const stateIds = Object.keys(clip.instrumentStatesById);

  if (
    trackIds.length !== expectedInstrumentIds.size
    || stateIds.length !== expectedInstrumentIds.size
    || trackIds.some((instrumentId) => !expectedInstrumentIds.has(instrumentId))
    || stateIds.some((instrumentId) => !expectedInstrumentIds.has(instrumentId))
  ) {
    throw new Error(
      `Clip "${clip.id}" does not contain the same instruments as the first clip.`,
    );
  }
}

function createEmptyTracks(
  instrumentIds: readonly InstrumentId[],
): Record<InstrumentId, Track & { notesById: Record<NoteId, Note> }> {
  const tracks: Record<
    InstrumentId,
    Track & { notesById: Record<NoteId, Note> }
  > = {};

  for (const instrumentId of instrumentIds) {
    tracks[instrumentId] = {
      instrumentId,
      notesById: {},
    };
  }

  return tracks;
}

function cloneInstrumentStates(
  sourceStates: Readonly<Record<InstrumentId, ClipInstrumentState>>,
  instrumentIds: readonly InstrumentId[],
): Record<InstrumentId, ClipInstrumentState> {
  const states: Record<InstrumentId, ClipInstrumentState> = {};

  for (const instrumentId of instrumentIds) {
    const sourceState = sourceStates[instrumentId];

    if (sourceState === undefined) {
      throw new Error(
        `The first clip is missing instrument state "${instrumentId}".`,
      );
    }

    states[instrumentId] = { ...sourceState };
  }

  return states;
}

function assertValidGeneratedNoteId(
  noteId: NoteId,
  generatedNoteIds: ReadonlySet<NoteId>,
): void {
  if (noteId.trim().length === 0 || noteId.length > MAXIMUM_ENTITY_ID_LENGTH) {
    throw new Error(
      `Generated note IDs must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    );
  }

  if (generatedNoteIds.has(noteId)) {
    throw new Error(`Generated note ID "${noteId}" is not unique.`);
  }
}
