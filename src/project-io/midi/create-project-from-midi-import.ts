import { MIDI_CONSTANTS } from "../../config/midi-config";
import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import { TONAL_SNAP_CONSTANTS } from "../../config/music-config";
import {
  type Clip,
  type Track,
  DEFAULT_CLIP_COLOR,
} from "../../domain/clips/clip";
import {
  createFlatClipHierarchy,
  getClipPlaybackOrder,
} from "../../domain/clips/clip-hierarchy";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import {
  type Note,
} from "../../domain/notes/note";
import {
  type ProjectInstrument,
} from "../../domain/instruments/instrument";
import {
  type ProjectState,
} from "../../domain/project/project-document";
import {
  createDefaultMasterBusState,
} from "../../domain/master-bus";
import {
  createDefaultProjectClock,
  createDefaultTransportState,
} from "../../domain/transport/transport";
import {
  getDurationForMeasureCount,
  getMeasureCountCoveringTick,
} from "../../domain/transport/time-map";
import {
  getClip,
  PROJECT_SCHEMA_VERSION,
} from "../../domain/project/project-document";
import { createDefaultProjectInstrument } from "../../domain/project-instrument-factory";
import {
  createDefaultInstrumentConfig,
  createDefaultInstrumentPresetLibrary,
} from "../../domain/instrument-presets";
import { assertValidTrack } from "../../domain/validation/note-validation";
import { assertValidProjectInstrument } from "../../domain/validation/instrument-validation";
import {
  assertValidClipTimeline,
  assertValidProjectClock,
  assertValidTransportState,
} from "../../domain/validation/transport-validation";
import {
  compareNotesByTime,
  resolveImportedNotes,
} from "./midi-import-collisions";
import { MidiImportError } from "./midi-import-error";
import type {
  MidiImportAnalysis,
  MidiImportCollisionStrategy,
  MidiImportInstrumentCandidate,
} from "./midi-import-types";

export function createProjectFromMidiImport(
  analysis: MidiImportAnalysis,
  strategy: MidiImportCollisionStrategy,
): ProjectState {
  if (strategy !== "merge" && strategy !== "slice") {
    throw new MidiImportError(
      "The MIDI collision strategy is invalid.",
    );
  }

  const candidates =
    analysis.instrumentCandidates.length > 0
      ? analysis.instrumentCandidates
      : [createEmptyInstrumentCandidate()];
  const projectInstrumentsById: Record<InstrumentId, ProjectInstrument> = {};
  const tracksByInstrumentId: Record<InstrumentId, Track> = {};
  const mutableTracks: Record<
    InstrumentId,
    {
      readonly instrumentId: InstrumentId;
      readonly notesById: Record<string, Note>;
    }
  > = {};
  const instrumentOrder: InstrumentId[] = [];
  let maximumNoteEndTick = 0;
  let resolvedNoteCount = 0;

  if (
    !Number.isSafeInteger(analysis.timelineEndTick)
    || analysis.timelineEndTick < 0
  ) {
    throw new MidiImportError(
      "The imported timeline end is invalid.",
    );
  }

  for (const candidate of candidates) {
    const resolvedNotes = resolveImportedNotes(
      candidate.notes,
      strategy,
    );
    const notesById: Record<string, Note> = {};

    for (const note of resolvedNotes) {
      notesById[note.id] = note;
      maximumNoteEndTick = Math.max(
        maximumNoteEndTick,
        note.startTick + note.durationTicks,
      );
    }

    resolvedNoteCount += resolvedNotes.length;
    projectInstrumentsById[candidate.projectInstrument.id] =
      candidate.projectInstrument;
    instrumentOrder.push(candidate.projectInstrument.id);
    mutableTracks[candidate.projectInstrument.id] = {
      instrumentId: candidate.projectInstrument.id,
      notesById,
    };
  }

  if (resolvedNoteCount > PROJECT_CONSTANTS.maximumNoteCount) {
    throw new MidiImportError(
      "Collision slicing would exceed the project note limit.",
    );
  }

  Object.assign(tracksByInstrumentId, mutableTracks);
  const clock = createDefaultProjectClock();
  const transport = createDefaultTransportState();

  assertValidProjectClock(clock);
  assertValidTransportState(transport);

  const timeMap = {
    meterMarkers: analysis.meterMarkers,
    tempoMarkers: analysis.tempoMarkers,
    scaleMarkers: [{
      startTick: 0,
      rootNote: TONAL_SNAP_CONSTANTS.defaultRootNote,
      patternType: "scale" as const,
      patternId: TONAL_SNAP_CONSTANTS.defaultPatternId,
    }],
    sectionMarkers: [],
  };
  const measureCount = Math.max(
    PROJECT_CONSTANTS.minimumMeasureCount,
    getMeasureCountCoveringTick(
      clock.ppqn,
      analysis.meterMarkers,
      Math.max(
        maximumNoteEndTick,
        analysis.timelineEndTick,
      ),
    ),
  );

  if (measureCount > PROJECT_CONSTANTS.maximumMeasureCount) {
    throw new MidiImportError(
      `The imported timeline requires ${String(measureCount)} measures, exceeding the ${String(PROJECT_CONSTANTS.maximumMeasureCount)} measure limit.`,
    );
  }

  const projectDurationTicks = getDurationForMeasureCount(
    clock.ppqn,
    analysis.meterMarkers,
    measureCount,
  );
  const firstMeasureTicks = getDurationForMeasureCount(
    clock.ppqn,
    analysis.meterMarkers,
    1,
  );
  const clipId = "clip-imported";
  const clip: Clip = {
    id: clipId,
    name: "Imported Clip",
    color: DEFAULT_CLIP_COLOR,
    bypassEnabled: PROJECT_CONSTANTS.defaultClipBypassEnabled,
    timeline: {
      durationTicks: projectDurationTicks,
      timeMap,
    },
    tracksByInstrumentId,
    transportSettings: {
      ...transport,
      loop: {
        startTick: 0,
        endTick: Math.min(
          firstMeasureTicks,
          projectDurationTicks,
        ),
      },
      loopEnabled: false,
    },
  };
  const presetLibrary = createDefaultInstrumentPresetLibrary();
  const projectState: ProjectState = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title: analysis.title,
    clock,
    projectInstrumentsById,
    instrumentOrder,
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById: {
      [clipId]: clip,
    },
    clipHierarchy: createFlatClipHierarchy([clipId]),
    autoAdvanceEnabled: PROJECT_CONSTANTS.defaultAutoAdvanceEnabled,
    autoScrollEnabled: PROJECT_CONSTANTS.defaultAutoScrollEnabled,
    workspace: { activeClipId: clipId },
    masterBus: createDefaultMasterBusState(),
  };

  assertImportedProjectState(projectState);
  return projectState;
}

function createEmptyInstrumentCandidate(): MidiImportInstrumentCandidate {
  const id = "midi-instrument-0-0";

  return {
    projectInstrument: createDefaultProjectInstrument({
      id,
      name: "MIDI Instrument",
      color:
        MIDI_CONSTANTS.importedInstrumentColors[0]
        ?? MIDI_CONSTANTS.defaultImportedInstrumentColor,
      instrument: createDefaultInstrumentConfig(0),
    }),
    notes: [],
  };
}

function assertImportedProjectState(state: ProjectState): void {
  const clipId = getClipPlaybackOrder(state.clipHierarchy)[0];

  if (clipId === undefined) {
    throw new MidiImportError("The imported project must contain a clip.");
  }

  const importedClip = getClip(state, clipId);
  const globalNoteIds = new Set<string>();
  const orderedInstrumentIds = new Set<InstrumentId>();
  let noteCount = 0;
  const projectDurationTicks =
    importedClip.timeline.durationTicks;

  assertValidTransportState(importedClip.transportSettings);
  assertValidProjectClock(state.clock);
  assertValidClipTimeline(importedClip.timeline, state.clock);

  if (
    state.instrumentOrder.length < 1
    || state.instrumentOrder.length
      > PROJECT_CONSTANTS.maximumInstrumentCount
  ) {
    throw new MidiImportError(
      "The imported instrument count is invalid.",
    );
  }

  for (const instrumentId of state.instrumentOrder) {
    if (orderedInstrumentIds.has(instrumentId)) {
      throw new MidiImportError(
        "The imported instrument order contains a duplicate instrument.",
      );
    }

    orderedInstrumentIds.add(instrumentId);
    const instrument = state.projectInstrumentsById[instrumentId];
    const track = importedClip.tracksByInstrumentId[instrumentId];
    if (
      instrument === undefined
      || track === undefined
      || instrument.id !== instrumentId
      || track.instrumentId !== instrumentId
    ) {
      throw new MidiImportError(
        "The imported instrument and track maps are inconsistent.",
      );
    }

    assertValidProjectInstrument(instrument);
    assertValidTrack(track);

    const notesByPitch = new Map<number, Note[]>();

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (
        note === undefined
        || note.id !== noteId
        || note.instrumentId !== instrumentId
        || globalNoteIds.has(note.id)
        || !Number.isInteger(note.pitch)
        || note.pitch < PROJECT_CONSTANTS.minimumMidiPitch
        || note.pitch > PROJECT_CONSTANTS.maximumMidiPitch
        || !Number.isInteger(note.velocity)
        || note.velocity < PROJECT_CONSTANTS.minimumMidiVelocity
        || note.velocity > PROJECT_CONSTANTS.maximumMidiVelocity
        || !Number.isSafeInteger(note.startTick)
        || note.startTick < 0
        || !Number.isSafeInteger(note.durationTicks)
        || note.durationTicks <= 0
        || !Number.isSafeInteger(
          note.startTick + note.durationTicks,
        )
        || note.startTick + note.durationTicks
          > projectDurationTicks
      ) {
        throw new MidiImportError(
          "The imported note data is inconsistent.",
        );
      }

      globalNoteIds.add(note.id);
      noteCount += 1;
      let pitchNotes = notesByPitch.get(note.pitch);

      if (pitchNotes === undefined) {
        pitchNotes = [];
        notesByPitch.set(note.pitch, pitchNotes);
      }

      pitchNotes.push(note);
    }

    for (const pitchNotes of notesByPitch.values()) {
      pitchNotes.sort(compareNotesByTime);

      for (
        let noteIndex = 1;
        noteIndex < pitchNotes.length;
        noteIndex += 1
      ) {
        const previous = pitchNotes[noteIndex - 1];
        const current = pitchNotes[noteIndex];

        if (
          previous !== undefined
          && current !== undefined
          && current.startTick
            < previous.startTick + previous.durationTicks
        ) {
          throw new MidiImportError(
            "The selected collision strategy did not resolve every overlap.",
          );
        }
      }
    }
  }

  if (noteCount > PROJECT_CONSTANTS.maximumNoteCount) {
    throw new MidiImportError(
      "The imported note count exceeds the project limit.",
    );
  }
}
