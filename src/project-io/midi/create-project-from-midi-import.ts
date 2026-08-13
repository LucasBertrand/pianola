import { MIDI_CONSTANTS } from "../../config/midi-config";
import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import type {
  Clip,
  ClipInstrumentState,
  InstrumentId,
  Note,
  ProjectInstrument,
  ProjectState,
  Track,
} from "../../domain/model";
import {
  createDefaultMasterBusState,
  createDefaultProjectClock,
  createDefaultTransportState,
  getClip,
  getClipTimeSignature,
  getTicksPerMeasure,
  PROJECT_SCHEMA_VERSION,
} from "../../domain/model";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
} from "../../domain/project-instrument-factory";
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
  const instrumentStatesById: Record<InstrumentId, ClipInstrumentState> = {};
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
    instrumentStatesById[candidate.projectInstrument.id] =
      createDefaultClipInstrumentState();
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
  const clock = {
    ...createDefaultProjectClock(),
    tempoBpm: analysis.tempoBpm,
  };
  const transport = createDefaultTransportState();

  assertValidProjectClock(clock);
  assertValidTransportState(transport);

  const ticksPerMeasure = getTicksPerMeasure(clock, analysis.timeSignature);
  const measureCount = Math.max(
    PROJECT_CONSTANTS.minimumMeasureCount,
    Math.ceil(
      Math.max(
        maximumNoteEndTick,
        analysis.timelineEndTick,
      ) / ticksPerMeasure,
    ),
  );

  if (measureCount > PROJECT_CONSTANTS.maximumMeasureCount) {
    throw new MidiImportError(
      `The imported timeline requires ${String(measureCount)} measures, exceeding the ${String(PROJECT_CONSTANTS.maximumMeasureCount)} measure limit.`,
    );
  }

  const projectDurationTicks = measureCount * ticksPerMeasure;
  const clipId = "clip-imported";
  const clip: Clip = {
    id: clipId,
    name: "Imported Clip",
    timeline: {
      durationTicks: projectDurationTicks,
      meterMap: {
        segments: [{ startTick: 0, timeSignature: analysis.timeSignature }],
      },
    },
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings: {
      ...transport,
      loop: {
        startTick: 0,
        endTick: Math.min(
          ticksPerMeasure,
          projectDurationTicks,
        ),
      },
      loopEnabled: false,
      anchorTick: 0,
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
    clipOrder: [clipId],
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
  const clipId = state.clipOrder[0];

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
    const instrumentState = importedClip.instrumentStatesById[instrumentId];

    if (
      instrument === undefined
      || track === undefined
      || instrumentState === undefined
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

  if (
    !Number.isFinite(state.clock.tempoBpm)
    || state.clock.tempoBpm
      < PROJECT_CONSTANTS.minimumTempoBpm
    || state.clock.tempoBpm
      > PROJECT_CONSTANTS.maximumTempoBpm
    || !Number.isSafeInteger(
      getClipTimeSignature(importedClip).numerator,
    )
    || getClipTimeSignature(importedClip).numerator <= 0
  ) {
    throw new MidiImportError(
      "The imported transport settings are invalid.",
    );
  }
}
