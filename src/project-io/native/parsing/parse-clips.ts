import { PROJECT_CONSTANTS } from "../../../config/domain-limits";
import { TONAL_SNAP_CONSTANTS } from "../../../config/music-config";
import {
  type Clip,
  type ClipTimeline,
  type Track,
} from "../../../domain/clips/clip";
import {
  type ClipId,
  type InstrumentId,
  type NoteId,
} from "../../../domain/identifiers";
import {
  type LoopRegion,
  type ProjectClock,
  type TransportState,
} from "../../../domain/transport/transport";
import {
  type MeterMarker,
  type TempoMarker,
  type TimeSignature,
} from "../../../domain/transport/time-map";
import {
  type Note,
} from "../../../domain/notes/note";
import {
  MAXIMUM_CLIP_NOTE_COUNT,
} from "../../../domain/notes/note";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../../domain/identifiers";
import { validateNoteForTrack } from "../../../domain/validation/note-validation";
import {
  validateClipTimeline,
  validateTransportState,
} from "../../../domain/validation/transport-validation";
import { fail } from "../native-project-error";
import {
  assertExactRecordKeys,
  readArray,
  readBoolean,
  readBoundedArray,
  readNonEmptyString,
  readNonNegativeSafeInteger,
  readNumberInRange,
  readPositiveSafeInteger,
  readRecord,
  readSafeInteger,
} from "./json-readers";
import { parseClipInstrumentStates } from "./parse-instruments";

const MAXIMUM_ID_LENGTH = MAXIMUM_ENTITY_ID_LENGTH;
const MAXIMUM_NOTE_COUNT = MAXIMUM_CLIP_NOTE_COUNT;

export function parseClipOrder(
  source: unknown,
  path: string,
): readonly ClipId[] {
  const values = readArray(source, path);

  if (
    values.length < 1
    || values.length > PROJECT_CONSTANTS.maximumClipCount
  ) {
    fail(
      "INVALID_DATA",
      path,
      `A project must contain between 1 and ${PROJECT_CONSTANTS.maximumClipCount} clips.`,
    );
  }

  const clipOrder: ClipId[] = [];
  const uniqueIds = new Set<ClipId>();

  for (let index = 0; index < values.length; index += 1) {
    const clipId = readNonEmptyString(
      values[index],
      `${path}[${index}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniqueIds.has(clipId)) {
      fail(
        "INVALID_DATA",
        `${path}[${index}]`,
        "Clip IDs must be unique.",
      );
    }

    uniqueIds.add(clipId);
    clipOrder.push(clipId);
  }

  return clipOrder;
}

export function parseClip(
  source: unknown,
  clipId: ClipId,
  instrumentOrder: readonly InstrumentId[],
  clock: ProjectClock,
  path: string,
): Clip {
  const clip = readRecord(source, path);
  const storedId = readNonEmptyString(
    clip["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (storedId !== clipId) {
    fail("INVALID_DATA", `${path}.id`, "Clip ID must match its record key.");
  }

  const name = readNonEmptyString(
    clip["name"],
    `${path}.name`,
    PROJECT_CONSTANTS.maximumClipNameLength,
  );
  const timeline = parseClipTimeline(clip["timeline"], clock, `${path}.timeline`);
  const transportSettings = parseTransport(
    clip["transportSettings"],
    `${path}.transportSettings`,
  );
  const durationTicks = timeline.durationTicks;
  const tracksByInstrumentId = parseTracks(
    clip["tracksByInstrumentId"],
    instrumentOrder,
    durationTicks,
    `${path}.tracksByInstrumentId`,
  );
  const instrumentStatesById = parseClipInstrumentStates(
    clip["instrumentStatesById"],
    instrumentOrder,
    `${path}.instrumentStatesById`,
  );
  const parsedClip: Clip = {
    id: clipId,
    name,
    timeline,
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings,
  };

  assertTransportWithinClip(parsedClip, path);
  return parsedClip;
}

function parseTransport(
  source: unknown,
  path: string,
): TransportState {
  const transport = readRecord(source, path);
  assertExactRecordKeys(transport, [
    "loop",
    "loopEnabled",
    "anchorTick",
  ], path);
  const loop = parseLoop(transport["loop"], `${path}.loop`);
  const loopEnabled = readBoolean(
    transport["loopEnabled"],
    `${path}.loopEnabled`,
  );

  const parsedTransport: TransportState = {
    loop,
    loopEnabled,
    anchorTick: readNonNegativeSafeInteger(
      transport["anchorTick"],
      `${path}.anchorTick`,
    ),
  };
  const validation = validateTransportState(parsedTransport);

  if (!validation.valid) {
    fail(
      "INVALID_DATA",
      path,
      validation.issues[0]?.message
        ?? "Transport settings are invalid.",
    );
  }

  return parsedTransport;
}

function parseClipTimeline(
  source: unknown,
  clock: ProjectClock,
  path: string,
): ClipTimeline {
  const stored = readRecord(source, path);
  assertExactRecordKeys(stored, ["durationTicks", "timeMap"], path);
  const timeMap = readRecord(stored["timeMap"], `${path}.timeMap`);
  assertExactRecordKeys(
    timeMap,
    ["meterMarkers", "tempoMarkers"],
    `${path}.timeMap`,
  );
  const meterMarkers = parseMeterMarkers(
    timeMap["meterMarkers"],
    `${path}.timeMap.meterMarkers`,
  );
  const tempoMarkers = parseTempoMarkers(
    timeMap["tempoMarkers"],
    `${path}.timeMap.tempoMarkers`,
  );
  const scaleMarkers = parseScaleMarkers(
    timeMap["scaleMarkers"],
    `${path}.timeMap.scaleMarkers`,
  );
  const timeline: ClipTimeline = {
    durationTicks: readPositiveSafeInteger(
      stored["durationTicks"],
      `${path}.durationTicks`,
    ),
    timeMap: { meterMarkers, tempoMarkers, scaleMarkers },
  };
  const validation = validateClipTimeline(timeline, clock);

  if (!validation.valid) {
    const issue = validation.issues[0];
    fail(
      "INVALID_DATA",
      issue === undefined ? path : `${path}.${issue.path}`,
      issue?.message ?? "Clip timeline is invalid.",
    );
  }

  return timeline;
}

function parseMeterMarkers(
  source: unknown,
  path: string,
): MeterMarker[] {
  const sourceMarkers = readBoundedArray(
    source,
    path,
    PROJECT_CONSTANTS.maximumMeasureCount,
  );

  return sourceMarkers.map((sourceMarker, index) => {
    const markerPath = `${path}[${String(index)}]`;
    const marker = readRecord(sourceMarker, markerPath);
    assertExactRecordKeys(marker, ["startTick", "timeSignature"], markerPath);

    return {
      startTick: readNonNegativeSafeInteger(
        marker["startTick"],
        `${markerPath}.startTick`,
      ),
      timeSignature: parseTimeSignature(
        marker["timeSignature"],
        `${markerPath}.timeSignature`,
      ),
    };
  });
}

function parseTempoMarkers(
  source: unknown,
  path: string,
): TempoMarker[] {
  const sourceMarkers = readBoundedArray(
    source,
    path,
    PROJECT_CONSTANTS.maximumMeasureCount,
  );

  return sourceMarkers.map((sourceMarker, index) => {
    const markerPath = `${path}[${String(index)}]`;
    const marker = readRecord(sourceMarker, markerPath);
    assertExactRecordKeys(marker, ["startTick", "bpm"], markerPath);

    return {
      startTick: readNonNegativeSafeInteger(
        marker["startTick"],
        `${markerPath}.startTick`,
      ),
      bpm: readNumberInRange(
        marker["bpm"],
        `${markerPath}.bpm`,
        PROJECT_CONSTANTS.minimumTempoBpm,
        PROJECT_CONSTANTS.maximumTempoBpm,
      ),
    };
  });
}

function parseScaleMarkers(
  source: unknown,
  path: string,
): any[] {
  if (source === undefined) {
    return [{
      startTick: 0,
      tonicPitchClass: TONAL_SNAP_CONSTANTS.defaultTonicPitchClass,
      patternId: TONAL_SNAP_CONSTANTS.defaultPatternId,
      scaleDegreeIndex: TONAL_SNAP_CONSTANTS.defaultScaleDegreeIndex,
    }];
  }

  const sourceMarkers = readBoundedArray(
    source,
    path,
    PROJECT_CONSTANTS.maximumMeasureCount,
  );

  return sourceMarkers.map((sourceMarker, index) => {
    const markerPath = `${path}[${String(index)}]`;
    const marker = readRecord(sourceMarker, markerPath);
    return {
      startTick: readNonNegativeSafeInteger(
        marker["startTick"],
        `${markerPath}.startTick`,
      ),
      tonicPitchClass: readSafeInteger(marker["tonicPitchClass"], `${markerPath}.tonicPitchClass`),
      patternId: readNonEmptyString(marker["patternId"], `${markerPath}.patternId`, 64) as any,
      scaleDegreeIndex: marker["scaleDegreeIndex"] === null ? null : readSafeInteger(marker["scaleDegreeIndex"], `${markerPath}.scaleDegreeIndex`),
    };
  });
}

function parseTimeSignature(source: unknown, path: string): TimeSignature {
  const stored = readRecord(source, path);
  const hasBeatGroups = "beatGroups" in stored;
  assertExactRecordKeys(
    stored,
    hasBeatGroups
      ? ["numerator", "denominator", "beatGroups"]
      : ["numerator", "denominator"],
    path,
  );
  const denominator = readSafeInteger(stored["denominator"], `${path}.denominator`);

  if (![1, 2, 4, 8, 16, 32].includes(denominator)) {
    fail("INVALID_DATA", `${path}.denominator`, "Time signature denominator is not supported.");
  }

  const timeSignature: TimeSignature = {
    numerator: readPositiveSafeInteger(stored["numerator"], `${path}.numerator`),
    denominator: denominator as TimeSignature["denominator"],
  };

  if (!hasBeatGroups) {
    return timeSignature;
  }

  const beatGroups = readBoundedArray(
    stored["beatGroups"],
    `${path}.beatGroups`,
    PROJECT_CONSTANTS.maximumMeasureCount,
  ).map((group, index) =>
    readPositiveSafeInteger(
      group,
      `${path}.beatGroups[${String(index)}]`,
    ));

  return {
    ...timeSignature,
    beatGroups,
  };
}

function parseLoop(
  source: unknown,
  path: string,
): LoopRegion {
  const loop = readRecord(source, path);

  return {
    startTick: readNonNegativeSafeInteger(
      loop["startTick"],
      `${path}.startTick`,
    ),
    endTick: readNonNegativeSafeInteger(
      loop["endTick"],
      `${path}.endTick`,
    ),
  };
}

function parseTracks(
  source: unknown,
  instrumentOrder: readonly InstrumentId[],
  projectDurationTicks: number,
  path: string,
): Readonly<Record<InstrumentId, Track>> {
  const sourceTracks = readRecord(source, path);

  assertExactRecordKeys(sourceTracks, instrumentOrder, path);
  const tracksByInstrumentId =
    Object.create(null) as Record<InstrumentId, Track>;
  const globalNoteIds = new Set<NoteId>();
  let totalNoteCount = 0;

  for (
    let instrumentIndex = 0;
    instrumentIndex < instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = instrumentOrder[instrumentIndex];

    if (instrumentId === undefined) {
      continue;
    }

    const trackPath = `${path}.${instrumentId}`;
    const track = readRecord(sourceTracks[instrumentId], trackPath);
    const trackInstrumentId = readNonEmptyString(
      track["instrumentId"],
      `${trackPath}.instrumentId`,
      MAXIMUM_ID_LENGTH,
    );

    if (trackInstrumentId !== instrumentId) {
      fail(
        "INVALID_DATA",
        `${trackPath}.instrumentId`,
        `Track instrument ID "${trackInstrumentId}" must match "${instrumentId}".`,
      );
    }

    const notesById = parseNotes(
      track["notesById"],
      instrumentId,
      projectDurationTicks,
      globalNoteIds,
      trackPath,
    );

    totalNoteCount += Object.keys(notesById).length;

    if (totalNoteCount > MAXIMUM_NOTE_COUNT) {
      fail(
        "INVALID_DATA",
        path,
        `A project cannot contain more than ${MAXIMUM_NOTE_COUNT} notes.`,
      );
    }

    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById,
    };
  }

  return tracksByInstrumentId;
}

function parseNotes(
  source: unknown,
  instrumentId: InstrumentId,
  projectDurationTicks: number,
  globalNoteIds: Set<NoteId>,
  trackPath: string,
): Readonly<Record<NoteId, Note>> {
  const sourceNotes = readRecord(
    source,
    `${trackPath}.notesById`,
  );
  const notesById =
    Object.create(null) as Record<NoteId, Note>;
  for (const [noteKey, sourceNote] of Object.entries(sourceNotes)) {
    const notePath = `${trackPath}.notesById.${noteKey}`;
    const noteRecord = readRecord(sourceNote, notePath);
    const note: Note = {
      id: readNonEmptyString(
        noteRecord["id"],
        `${notePath}.id`,
        MAXIMUM_ID_LENGTH,
      ),
      pitch: readSafeInteger(
        noteRecord["pitch"],
        `${notePath}.pitch`,
      ),
      startTick: readNonNegativeSafeInteger(
        noteRecord["startTick"],
        `${notePath}.startTick`,
      ),
      durationTicks: readPositiveSafeInteger(
        noteRecord["durationTicks"],
        `${notePath}.durationTicks`,
      ),
      velocity: readSafeInteger(
        noteRecord["velocity"],
        `${notePath}.velocity`,
      ),
      enabled: readBoolean(
        noteRecord["enabled"],
        `${notePath}.enabled`,
      ),
      instrumentId: readNonEmptyString(
        noteRecord["instrumentId"],
        `${notePath}.instrumentId`,
        MAXIMUM_ID_LENGTH,
      ),
    };

    if (note.id !== noteKey) {
      fail(
        "INVALID_DATA",
        `${notePath}.id`,
        `Note ID "${note.id}" must match its record key "${noteKey}".`,
      );
    }

    if (globalNoteIds.has(note.id)) {
      fail(
        "INVALID_DATA",
        `${notePath}.id`,
        `Note ID "${note.id}" must be unique within its clip.`,
      );
    }

    const validation = validateNoteForTrack(note, instrumentId);

    if (!validation.valid) {
      fail(
        "INVALID_DATA",
        notePath,
        validation.issues[0]?.message ?? "Note data is invalid.",
      );
    }

    const endTick = note.startTick + note.durationTicks;

    if (
      !Number.isSafeInteger(endTick)
      || endTick > projectDurationTicks
    ) {
      fail(
        "INVALID_DATA",
        notePath,
        `Note "${note.id}" exceeds the clip duration.`,
      );
    }

    globalNoteIds.add(note.id);
    notesById[note.id] = note;
  }

  return notesById;
}

function assertTransportWithinClip(
  clip: Clip,
  clipPath: string,
): void {
  const durationTicks =
    clip.timeline.durationTicks;
  const transport = clip.transportSettings;

  if (transport.anchorTick > durationTicks) {
    fail(
      "INVALID_DATA",
      `${clipPath}.transportSettings.anchorTick`,
      "Transport anchor exceeds the clip duration.",
    );
  }

  if (
    transport.loop.endTick > durationTicks
  ) {
    fail(
      "INVALID_DATA",
      `${clipPath}.transportSettings.loop`,
      "Loop region exceeds the clip duration.",
    );
  }
}
