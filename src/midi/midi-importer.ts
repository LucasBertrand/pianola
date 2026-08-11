import {
  EDITOR_CONSTANTS,
  MIDI_CONSTANTS,
  PROJECT_CONSTANTS,
  RENDERING_CONSTANTS,
} from "../config/program-constants";
import type {
  Note,
  Clip,
  ProjectState,
  Track,
  TimeSignature,
  ProjectInstrument,
  InstrumentId,
  ClipInstrumentState,
} from "../domain/model";
import {
  createDefaultMasterBusState,
  createDefaultTransportState,
  getActiveClip,
  getTicksPerMeasure,
  PROJECT_SCHEMA_VERSION,
} from "../domain/model";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
} from "../domain/project-instrument-factory";
import {
  createDefaultInstrumentPresetLibrary,
  getDefaultInstrumentPresetId,
} from "../domain/instrument-presets";
import {
  assertValidInstrumentPreset,
  assertValidProjectDuration,
  assertValidTrack,
  assertValidTransportState,
  assertValidProjectInstrument,
} from "../domain/validation";
import { MidiCodecError } from "./errors";
import type {
  MidiEvent,
  ParsedMidiFile,
} from "./types";

export type MidiImportCollisionStrategy = "merge" | "slice";

export interface MidiImportInstrumentCandidate {
  readonly projectInstrument: ProjectInstrument;
  readonly notes: readonly Note[];
}

export interface MidiImportAnalysis {
  readonly title: string;
  readonly sourceFormat: 0 | 1;
  readonly sourceTicksPerQuarterNote: number;
  readonly tempoBpm: number;
  readonly timeSignature: TimeSignature;
  readonly timelineEndTick: number;
  readonly instrumentCandidates: readonly MidiImportInstrumentCandidate[];
  readonly noteCount: number;
  readonly collisionCount: number;
  readonly ignoredControlChangeCount: number;
  readonly ignoredSustainControlChangeCount: number;
  readonly warnings: readonly string[];
}

interface ActiveMidiNote {
  readonly startTick: number;
  readonly velocity: number;
  readonly sourceOrder: number;
}

interface ActiveMidiNoteQueue {
  readonly notes: ActiveMidiNote[];
  headIndex: number;
}

interface ImportedSourceNote {
  readonly pitch: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly velocity: number;
  readonly sourceOrder: number;
}

interface MutableInstrumentGroup {
  readonly trackIndex: number;
  readonly channel: number;
  readonly activeNotesByPitch: Map<number, ActiveMidiNoteQueue>;
  readonly sourceNotes: ImportedSourceNote[];
  trackName: string;
  maximumTrackTick: number;
}

interface TempoCandidate {
  readonly event: Extract<MidiEvent, { readonly kind: "tempo" }>;
  readonly trackIndex: number;
  readonly eventIndex: number;
}

interface TimeSignatureCandidate {
  readonly event: Extract<
    MidiEvent,
    { readonly kind: "time-signature" }
  >;
  readonly trackIndex: number;
  readonly eventIndex: number;
}

interface SliceHeapEntry {
  readonly note: Note;
  readonly endTick: number;
}

interface ResolvedFragment {
  readonly note: Note;
  readonly sourceNoteId: string;
}

export class MidiImportError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MidiImportError";
  }
}

/** Analyses a parsed MIDI file without mutating the active project. */
export function analyzeMidiImport(
  file: ParsedMidiFile,
  sourceFileName: string,
): MidiImportAnalysis {
  const instrumentGroups = new Map<string, MutableInstrumentGroup>();
  const tempoCandidates: TempoCandidate[] = [];
  const timeSignatureCandidates: TimeSignatureCandidate[] = [];
  let sourceOrder = 0;
  let orphanNoteOffCount = 0;
  let danglingNoteOnCount = 0;
  let ignoredControlChangeCount = 0;
  let ignoredSustainControlChangeCount = 0;
  let ignoredExpressiveEventCount = 0;
  let maximumSourceTick = 0;

  for (
    let trackIndex = 0;
    trackIndex < file.tracks.length;
    trackIndex += 1
  ) {
    const track = file.tracks[trackIndex];

    if (track === undefined) {
      continue;
    }

    const trackName = findTrackName(track.events);
    let maximumTrackTick = 0;

    for (
      let eventIndex = 0;
      eventIndex < track.events.length;
      eventIndex += 1
    ) {
      const event = track.events[eventIndex];

      if (event === undefined) {
        continue;
      }

      maximumTrackTick = Math.max(
        maximumTrackTick,
        event.absoluteTick,
      );
      maximumSourceTick = Math.max(
        maximumSourceTick,
        event.absoluteTick,
      );

      switch (event.kind) {
        case "tempo":
          tempoCandidates.push({
            event,
            trackIndex,
            eventIndex,
          });
          break;
        case "time-signature":
          timeSignatureCandidates.push({
            event,
            trackIndex,
            eventIndex,
          });
          break;
        case "control-change":
          ignoredControlChangeCount += 1;

          if (event.controller === 64) {
            ignoredSustainControlChangeCount += 1;
          }
          break;
        case "program-change":
        case "polyphonic-key-pressure":
        case "channel-pressure":
        case "pitch-bend":
          ignoredExpressiveEventCount += 1;
          break;
        case "note-on":
          if (event.velocity === 0) {
            const matched = closeActiveNote(
              instrumentGroups,
              file.format,
              trackIndex,
              trackName,
              event.channel,
              event.note,
              event.absoluteTick,
            );

            if (!matched) {
              orphanNoteOffCount += 1;
            }
          } else {
            sourceOrder += 1;
            if (
              sourceOrder
              > MIDI_CONSTANTS.maximumImportedNoteCount
            ) {
              throw new MidiImportError(
                `The MIDI file exceeds the ${String(MIDI_CONSTANTS.maximumImportedNoteCount)} note import limit.`,
              );
            }

            const group = getOrCreateInstrumentGroup(
              instrumentGroups,
              file.format,
              trackIndex,
              trackName,
              event.channel,
            );
            let activeNoteQueue =
              group.activeNotesByPitch.get(event.note);

            if (activeNoteQueue === undefined) {
              activeNoteQueue = {
                notes: [],
                headIndex: 0,
              };
              group.activeNotesByPitch.set(
                event.note,
                activeNoteQueue,
              );
            }

            activeNoteQueue.notes.push({
              startTick: event.absoluteTick,
              velocity: event.velocity,
              sourceOrder,
            });
          }
          break;
        case "note-off": {
          const matched = closeActiveNote(
            instrumentGroups,
            file.format,
            trackIndex,
            trackName,
            event.channel,
            event.note,
            event.absoluteTick,
          );

          if (!matched) {
            orphanNoteOffCount += 1;
          }
          break;
        }
        case "track-name":
        case "end-of-track":
          break;
      }
    }

    for (const group of instrumentGroups.values()) {
      if (
        file.format === 1
        && group.trackIndex !== trackIndex
      ) {
        continue;
      }

      group.maximumTrackTick = Math.max(
        group.maximumTrackTick,
        maximumTrackTick,
      );
    }
  }

  for (const group of instrumentGroups.values()) {
    for (
      const [pitch, activeNoteQueue]
      of group.activeNotesByPitch
    ) {
      for (
        let activeNoteIndex = activeNoteQueue.headIndex;
        activeNoteIndex < activeNoteQueue.notes.length;
        activeNoteIndex += 1
      ) {
        const activeNote =
          activeNoteQueue.notes[activeNoteIndex];

        if (activeNote === undefined) {
          continue;
        }

        danglingNoteOnCount += 1;
        group.sourceNotes.push({
          pitch,
          startTick: activeNote.startTick,
          endTick: Math.max(
            activeNote.startTick + 1,
            group.maximumTrackTick,
          ),
          velocity: activeNote.velocity,
          sourceOrder: activeNote.sourceOrder,
        });
      }
    }

    group.activeNotesByPitch.clear();
  }

  const sortedGroups = Array.from(instrumentGroups.values())
    .filter((group) => group.sourceNotes.length > 0)
    .sort((left, right) =>
      left.trackIndex - right.trackIndex
      || left.channel - right.channel);

  if (sortedGroups.length > PROJECT_CONSTANTS.maximumInstrumentCount) {
    throw new MidiImportError(
      `The MIDI file requires ${String(sortedGroups.length)} instruments, exceeding the ${String(PROJECT_CONSTANTS.maximumInstrumentCount)} instrument limit.`,
    );
  }

  const channelsPerTrack = countChannelsPerTrack(sortedGroups);
  const instrumentCandidates: MidiImportInstrumentCandidate[] = [];
  let noteCount = 0;

  for (
    let groupIndex = 0;
    groupIndex < sortedGroups.length;
    groupIndex += 1
  ) {
    const group = sortedGroups[groupIndex];

    if (group === undefined) {
      continue;
    }

    const instrumentId = createImportedInstrumentId(
      group.trackIndex,
      group.channel,
    );
    const instrumentName = createImportedInstrumentName(
      file.format,
      group,
      channelsPerTrack.get(group.trackIndex) ?? 1,
    );
    const color =
      RENDERING_CONSTANTS.userInstrumentColors[
        groupIndex % RENDERING_CONSTANTS.userInstrumentColors.length
      ] ?? RENDERING_CONSTANTS.defaultNoteColor;
    const notes = convertSourceNotes(
      group.sourceNotes,
      instrumentId,
      file.ticksPerQuarterNote,
      groupIndex,
    );

    noteCount += notes.length;
    instrumentCandidates.push({
      projectInstrument: createDefaultProjectInstrument({
        id: instrumentId,
        name: instrumentName,
        color,
        presetId: getDefaultInstrumentPresetId(groupIndex),
      }),
      notes,
    });
  }

  if (noteCount > MIDI_CONSTANTS.maximumImportedNoteCount) {
    throw new MidiImportError(
      `The MIDI file contains ${String(noteCount)} notes, exceeding the ${String(MIDI_CONSTANTS.maximumImportedNoteCount)} note import limit.`,
    );
  }

  const sourceTempoBpm = selectTempo(tempoCandidates);
  const tempoBpm = normalizeImportedTempo(sourceTempoBpm);
  const meterSelection =
    selectTimeSignature(timeSignatureCandidates);
  const timelineEndTick = convertTick(
    maximumSourceTick,
    file.ticksPerQuarterNote,
  );
  const importedTicksPerMeasure =
    PROJECT_CONSTANTS.ppqn
    * 4
    * meterSelection.timeSignature.numerator
    / meterSelection.timeSignature.denominator;
  const requiredMeasureCount = Math.max(
    PROJECT_CONSTANTS.minimumMeasureCount,
    Math.ceil(timelineEndTick / importedTicksPerMeasure),
  );

  if (
    requiredMeasureCount
    > PROJECT_CONSTANTS.maximumMeasureCount
  ) {
    throw new MidiImportError(
      `The MIDI timeline requires ${String(requiredMeasureCount)} measures, exceeding the ${String(PROJECT_CONSTANTS.maximumMeasureCount)} measure limit.`,
    );
  }

  const collisionCount =
    countImportedNoteCollisions(instrumentCandidates);
  const warnings = [...createImportWarnings({
    tempoChangeCount: Math.max(0, tempoCandidates.length - 1),
    timeSignatureChangeCount: Math.max(
      0,
      timeSignatureCandidates.length
        - meterSelection.invalidEventCount
        - meterSelection.acceptedEventCount,
    ),
    invalidTimeSignatureCount:
      meterSelection.invalidEventCount,
    orphanNoteOffCount,
    danglingNoteOnCount,
    ignoredControlChangeCount:
      ignoredControlChangeCount
      - ignoredSustainControlChangeCount,
    ignoredSustainControlChangeCount,
    ignoredExpressiveEventCount,
    skippedSystemExclusiveEventCount:
      file.summary.skippedSystemExclusiveEventCount,
    skippedUnknownMetaEventCount:
      file.summary.skippedUnknownMetaEventCount,
    missingEndOfTrackEventCount:
      countTracksWithoutEndOfTrack(file),
  })];

  if (tempoBpm !== sourceTempoBpm) {
    warnings.unshift(
      `Tempo ${formatTempoForWarning(sourceTempoBpm)} BPM was adjusted to ${formatTempoForWarning(tempoBpm)} BPM to match editor limits.`,
    );
  }

  return {
    title: createImportedProjectTitle(
      sourceFileName,
      sortedGroups[0]?.trackName,
    ),
    sourceFormat: file.format,
    sourceTicksPerQuarterNote:
      file.ticksPerQuarterNote,
    tempoBpm,
    timeSignature: meterSelection.timeSignature,
    timelineEndTick,
    instrumentCandidates,
    noteCount,
    collisionCount,
    ignoredControlChangeCount,
    ignoredSustainControlChangeCount,
    warnings,
  };
}

/** Builds a valid immutable project from a previously analysed MIDI file. */
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
  const transport = {
    ...createDefaultTransportState(),
    bpm: analysis.tempoBpm,
    timeSignature: analysis.timeSignature,
  };

  assertValidTransportState(transport);
  assertValidProjectDuration(
    PROJECT_CONSTANTS.minimumMeasureCount,
    transport,
  );

  const ticksPerMeasure = getTicksPerMeasure(transport);
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
    measureCount,
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
      anchorAudioTimeSeconds: null,
    },
  };
  const presetLibrary = createDefaultInstrumentPresetLibrary();
  const projectState: ProjectState = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title: analysis.title,
    projectInstrumentsById,
    instrumentOrder,
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById: {
      [clipId]: clip,
    },
    clipOrder: [clipId],
    activeClipId: clipId,
    masterBus: createDefaultMasterBusState(),
  };

  assertImportedProjectState(projectState);
  return projectState;
}

function getOrCreateInstrumentGroup(
  groups: Map<string, MutableInstrumentGroup>,
  format: 0 | 1,
  trackIndex: number,
  trackName: string,
  channel: number,
): MutableInstrumentGroup {
  const effectiveTrackIndex = format === 0 ? 0 : trackIndex;
  const key = `${String(effectiveTrackIndex)}:${String(channel)}`;
  let group = groups.get(key);

  if (group === undefined) {
    group = {
      trackIndex: effectiveTrackIndex,
      channel,
      trackName,
      activeNotesByPitch: new Map(),
      sourceNotes: [],
      maximumTrackTick: 0,
    };
    groups.set(key, group);
  } else if (group.trackName.length === 0 && trackName.length > 0) {
    group.trackName = trackName;
  }

  return group;
}

function closeActiveNote(
  groups: Map<string, MutableInstrumentGroup>,
  format: 0 | 1,
  trackIndex: number,
  trackName: string,
  channel: number,
  pitch: number,
  endTick: number,
): boolean {
  const group = getOrCreateInstrumentGroup(
    groups,
    format,
    trackIndex,
    trackName,
    channel,
  );
  const activeNoteQueue = group.activeNotesByPitch.get(pitch);

  if (activeNoteQueue === undefined) {
    return false;
  }

  const activeNote =
    activeNoteQueue.notes[activeNoteQueue.headIndex];

  if (activeNote === undefined) {
    return false;
  }

  activeNoteQueue.headIndex += 1;
  group.sourceNotes.push({
    pitch,
    startTick: activeNote.startTick,
    endTick: Math.max(activeNote.startTick + 1, endTick),
    velocity: activeNote.velocity,
    sourceOrder: activeNote.sourceOrder,
  });

  if (
    activeNoteQueue.headIndex
    >= activeNoteQueue.notes.length
  ) {
    group.activeNotesByPitch.delete(pitch);
  }

  return true;
}

function findTrackName(events: readonly MidiEvent[]): string {
  for (const event of events) {
    if (event.kind === "track-name") {
      return sanitizeInstrumentName(event.text);
    }
  }

  return "";
}

function countChannelsPerTrack(
  groups: readonly MutableInstrumentGroup[],
): Map<number, number> {
  const channelsByTrack = new Map<number, Set<number>>();

  for (const group of groups) {
    let channels = channelsByTrack.get(group.trackIndex);

    if (channels === undefined) {
      channels = new Set<number>();
      channelsByTrack.set(group.trackIndex, channels);
    }

    channels.add(group.channel);
  }

  const counts = new Map<number, number>();

  for (const [trackIndex, channels] of channelsByTrack) {
    counts.set(trackIndex, channels.size);
  }

  return counts;
}

function createImportedInstrumentName(
  format: 0 | 1,
  group: MutableInstrumentGroup,
  channelCount: number,
): string {
  if (format === 0) {
    return `Channel ${String(group.channel + 1)}`;
  }

  const baseName =
    group.trackName.length > 0
      ? group.trackName
      : `Track ${String(group.trackIndex + 1)}`;

  return sanitizeInstrumentName(
    channelCount > 1
      ? `${baseName} · Ch ${String(group.channel + 1)}`
      : baseName,
  );
}

function createImportedInstrumentId(
  trackIndex: number,
  channel: number,
): InstrumentId {
  return `midi-instrument-${String(trackIndex)}-${String(channel)}`;
}

function convertSourceNotes(
  sourceNotes: readonly ImportedSourceNote[],
  instrumentId: InstrumentId,
  sourcePpqn: number,
  instrumentIndex: number,
): readonly Note[] {
  const sortedNotes = [...sourceNotes].sort((left, right) =>
    left.startTick - right.startTick
    || left.sourceOrder - right.sourceOrder);
  const notes: Note[] = [];

  for (
    let noteIndex = 0;
    noteIndex < sortedNotes.length;
    noteIndex += 1
  ) {
    const sourceNote = sortedNotes[noteIndex];

    if (sourceNote === undefined) {
      continue;
    }

    let startTick = convertTick(
      sourceNote.startTick,
      sourcePpqn,
    );
    let endTick = convertTick(
      sourceNote.endTick,
      sourcePpqn,
    );
    const minimumDuration =
      MIDI_CONSTANTS.minimumImportedDurationTicks;

    if (endTick - startTick < minimumDuration) {
      const shiftedStartTick = endTick - minimumDuration;

      if (shiftedStartTick >= 0) {
        startTick = shiftedStartTick;
      } else {
        endTick = startTick + minimumDuration;
      }
    }

    notes.push({
      id:
        `midi-note-${String(instrumentIndex)}-${String(noteIndex).padStart(8, "0")}`,
      pitch: sourceNote.pitch,
      startTick,
      durationTicks: endTick - startTick,
      velocity: sourceNote.velocity,
      instrumentId,
      enabled: true,
    });
  }

  return notes;
}

function convertTick(tick: number, sourcePpqn: number): number {
  const wholeQuarters = Math.floor(tick / sourcePpqn);
  const remainder = tick % sourcePpqn;
  const converted =
    wholeQuarters * PROJECT_CONSTANTS.ppqn
    + Math.round(
      remainder * PROJECT_CONSTANTS.ppqn / sourcePpqn,
    );

  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new MidiImportError(
      "A MIDI tick cannot be represented safely in the project timeline.",
    );
  }

  return converted;
}

function selectTempo(candidates: TempoCandidate[]): number {
  candidates.sort(compareMetaCandidates);
  const selected = candidates[0]?.event;

  if (selected === undefined) {
    return PROJECT_CONSTANTS.defaultTempoBpm;
  }

  return Number(
    (
      60_000_000 / selected.microsecondsPerQuarterNote
    ).toFixed(6),
  );
}

function normalizeImportedTempo(tempoBpm: number): number {
  const steppedTempo =
    Math.round(
      tempoBpm / EDITOR_CONSTANTS.tempoStepBpm,
    ) * EDITOR_CONSTANTS.tempoStepBpm;

  return Number(
    Math.min(
      EDITOR_CONSTANTS.tempoMaximumBpm,
      Math.max(
        EDITOR_CONSTANTS.tempoMinimumBpm,
        steppedTempo,
      ),
    ).toFixed(6),
  );
}

function formatTempoForWarning(tempoBpm: number): string {
  return tempoBpm
    .toFixed(6)
    .replace(/0+$/u, "")
    .replace(/\.$/u, "");
}

function selectTimeSignature(
  candidates: TimeSignatureCandidate[],
): {
  readonly timeSignature: TimeSignature;
  readonly acceptedEventCount: number;
  readonly invalidEventCount: number;
} {
  candidates.sort(compareMetaCandidates);
  let invalidEventCount = 0;
  let selectedTimeSignature: TimeSignature | null = null;

  for (const candidate of candidates) {
    const event = candidate.event;

    if (
      Number.isSafeInteger(event.numerator)
      && event.numerator > 0
      && isSupportedTimeSignatureDenominator(
        event.denominator,
      )
    ) {
      if (selectedTimeSignature === null) {
        selectedTimeSignature = {
          numerator: event.numerator,
          denominator: event.denominator,
        };
      }
    } else {
      invalidEventCount += 1;
    }
  }

  if (selectedTimeSignature !== null) {
    return {
      timeSignature: selectedTimeSignature,
      acceptedEventCount: 1,
      invalidEventCount,
    };
  }

  return {
    timeSignature: {
      numerator:
        PROJECT_CONSTANTS.defaultTimeSignatureNumerator,
      denominator:
        PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
    },
    acceptedEventCount: 0,
    invalidEventCount,
  };
}

function compareMetaCandidates(
  left: TempoCandidate | TimeSignatureCandidate,
  right: TempoCandidate | TimeSignatureCandidate,
): number {
  return (
    left.event.absoluteTick - right.event.absoluteTick
    || left.trackIndex - right.trackIndex
    || left.eventIndex - right.eventIndex
  );
}

function isSupportedTimeSignatureDenominator(
  denominator: number,
): denominator is TimeSignature["denominator"] {
  return (
    denominator === 1
    || denominator === 2
    || denominator === 4
    || denominator === 8
    || denominator === 16
    || denominator === 32
  );
}

function countImportedNoteCollisions(
  candidates: readonly MidiImportInstrumentCandidate[],
): number {
  let collisionCount = 0;

  for (const candidate of candidates) {
    const notesByPitch = groupNotesByPitch(candidate.notes);

    for (const notes of notesByPitch.values()) {
      const sortedNotes = [...notes].sort(compareNotesByTime);
      let maximumEndTick = -1;

      for (const note of sortedNotes) {
        if (note.startTick < maximumEndTick) {
          collisionCount += 1;
        }

        maximumEndTick = Math.max(
          maximumEndTick,
          note.startTick + note.durationTicks,
        );
      }
    }
  }

  return collisionCount;
}

function resolveImportedNotes(
  notes: readonly Note[],
  strategy: MidiImportCollisionStrategy,
): readonly Note[] {
  const resolvedNotes: Note[] = [];
  const notesByPitch = groupNotesByPitch(notes);

  for (const pitchNotes of notesByPitch.values()) {
    const resolvedPitchNotes =
      strategy === "merge"
        ? mergePitchNotes(pitchNotes)
        : slicePitchNotes(pitchNotes);

    resolvedNotes.push(...resolvedPitchNotes);
  }

  resolvedNotes.sort((left, right) =>
    left.startTick - right.startTick
    || left.pitch - right.pitch
    || left.id.localeCompare(right.id));
  return resolvedNotes;
}

function groupNotesByPitch(
  notes: readonly Note[],
): Map<number, Note[]> {
  const notesByPitch = new Map<number, Note[]>();

  for (const note of notes) {
    let pitchNotes = notesByPitch.get(note.pitch);

    if (pitchNotes === undefined) {
      pitchNotes = [];
      notesByPitch.set(note.pitch, pitchNotes);
    }

    pitchNotes.push(note);
  }

  return notesByPitch;
}

function mergePitchNotes(notes: readonly Note[]): readonly Note[] {
  const sortedNotes = [...notes].sort(compareNotesByTime);
  const mergedNotes: Note[] = [];
  let noteIndex = 0;

  while (noteIndex < sortedNotes.length) {
    const firstNote = sortedNotes[noteIndex];

    if (firstNote === undefined) {
      noteIndex += 1;
      continue;
    }

    let endTick =
      firstNote.startTick + firstNote.durationTicks;
    let nextIndex = noteIndex + 1;

    while (nextIndex < sortedNotes.length) {
      const candidate = sortedNotes[nextIndex];

      if (
        candidate === undefined
        || candidate.startTick >= endTick
      ) {
        break;
      }

      endTick = Math.max(
        endTick,
        candidate.startTick + candidate.durationTicks,
      );
      nextIndex += 1;
    }

    mergedNotes.push({
      ...firstNote,
      durationTicks: endTick - firstNote.startTick,
    });
    noteIndex = nextIndex;
  }

  return mergedNotes;
}

function slicePitchNotes(notes: readonly Note[]): readonly Note[] {
  const sortedNotes = [...notes].sort(compareNotesByTime);
  const boundaries: number[] = [];

  for (const note of sortedNotes) {
    boundaries.push(
      note.startTick,
      note.startTick + note.durationTicks,
    );
  }

  boundaries.sort((left, right) => left - right);
  const uniqueBoundaries: number[] = [];

  for (const boundary of boundaries) {
    if (
      uniqueBoundaries.length === 0
      || uniqueBoundaries[uniqueBoundaries.length - 1]
        !== boundary
    ) {
      uniqueBoundaries.push(boundary);
    }
  }

  const heap: SliceHeapEntry[] = [];
  const fragments: ResolvedFragment[] = [];
  const fragmentCountsBySourceId = new Map<string, number>();
  let noteIndex = 0;

  for (
    let boundaryIndex = 0;
    boundaryIndex < uniqueBoundaries.length - 1;
    boundaryIndex += 1
  ) {
    const startTick = uniqueBoundaries[boundaryIndex];
    const endTick = uniqueBoundaries[boundaryIndex + 1];

    if (startTick === undefined || endTick === undefined) {
      continue;
    }

    while (
      noteIndex < sortedNotes.length
      && sortedNotes[noteIndex]?.startTick === startTick
    ) {
      const note = sortedNotes[noteIndex];

      if (note !== undefined) {
        pushSliceHeap(heap, {
          note,
          endTick: note.startTick + note.durationTicks,
        });
      }

      noteIndex += 1;
    }

    while (heap[0] !== undefined && heap[0].endTick <= startTick) {
      popSliceHeap(heap);
    }

    const winner = heap[0]?.note;

    if (winner === undefined || endTick <= startTick) {
      continue;
    }

    const previousFragment =
      fragments[fragments.length - 1];

    if (
      previousFragment !== undefined
      && previousFragment.sourceNoteId === winner.id
      && previousFragment.note.startTick
        + previousFragment.note.durationTicks === startTick
    ) {
      fragments[fragments.length - 1] = {
        sourceNoteId: winner.id,
        note: {
          ...previousFragment.note,
          durationTicks:
            endTick - previousFragment.note.startTick,
        },
      };
      continue;
    }

    const fragmentCount =
      fragmentCountsBySourceId.get(winner.id) ?? 0;
    const fragmentId =
      fragmentCount === 0
        ? winner.id
        : createSliceFragmentId(winner.id, fragmentCount);

    fragmentCountsBySourceId.set(
      winner.id,
      fragmentCount + 1,
    );
    fragments.push({
      sourceNoteId: winner.id,
      note: {
        ...winner,
        id: fragmentId,
        startTick,
        durationTicks: endTick - startTick,
      },
    });
  }

  return fragments.map((fragment) => fragment.note);
}

function pushSliceHeap(
  heap: SliceHeapEntry[],
  entry: SliceHeapEntry,
): void {
  heap.push(entry);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = heap[parentIndex];

    if (
      parent === undefined
      || compareSlicePriority(parent, entry) >= 0
    ) {
      break;
    }

    heap[index] = parent;
    index = parentIndex;
  }

  heap[index] = entry;
}

function popSliceHeap(heap: SliceHeapEntry[]): void {
  const last = heap.pop();

  if (last === undefined || heap.length === 0) {
    return;
  }

  let index = 0;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    const left = heap[leftIndex];
    const right = heap[rightIndex];

    if (left === undefined) {
      break;
    }

    const higherPriorityChild =
      right !== undefined
      && compareSlicePriority(right, left) > 0
        ? right
        : left;
    const childIndex =
      higherPriorityChild === right
        ? rightIndex
        : leftIndex;

    if (compareSlicePriority(last, higherPriorityChild) >= 0) {
      break;
    }

    heap[index] = higherPriorityChild;
    index = childIndex;
  }

  heap[index] = last;
}

function compareSlicePriority(
  left: SliceHeapEntry,
  right: SliceHeapEntry,
): number {
  return (
    left.note.startTick - right.note.startTick
    || left.note.id.localeCompare(right.note.id)
  );
}

function createSliceFragmentId(
  sourceNoteId: string,
  fragmentIndex: number,
): string {
  const suffix = `-slice-${String(fragmentIndex)}`;
  return (
    sourceNoteId.slice(
      0,
      PROJECT_CONSTANTS.maximumEntityIdLength - suffix.length,
    )
    + suffix
  );
}

function compareNotesByTime(left: Note, right: Note): number {
  return (
    left.startTick - right.startTick
    || left.id.localeCompare(right.id)
  );
}

function createEmptyInstrumentCandidate(): MidiImportInstrumentCandidate {
  const id = "midi-instrument-0-0";

  return {
    projectInstrument: createDefaultProjectInstrument({
      id,
      name: "MIDI Instrument",
      color:
        RENDERING_CONSTANTS.userInstrumentColors[0]
        ?? RENDERING_CONSTANTS.defaultNoteColor,
      presetId: getDefaultInstrumentPresetId(0),
    }),
    notes: [],
  };
}

function createImportedProjectTitle(
  sourceFileName: string,
  fallbackTrackName: string | undefined,
): string {
  const baseName = sourceFileName
    .replace(/^.*[\\/]/u, "")
    .replace(/\.midi?$/iu, "")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();
  const title =
    baseName.length > 0
      ? baseName
      : fallbackTrackName?.trim() || "Imported MIDI";

  return title.slice(
    0,
    PROJECT_CONSTANTS.maximumProjectTitleLength,
  );
}

function sanitizeInstrumentName(name: string): string {
  const sanitized = name
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();

  return (
    sanitized.length > 0
      ? sanitized
      : "MIDI Instrument"
  ).slice(0, PROJECT_CONSTANTS.maximumInstrumentNameLength);
}

function countTracksWithoutEndOfTrack(
  file: ParsedMidiFile,
): number {
  let count = 0;

  for (const track of file.summary.tracks) {
    if (!track.endedByEndOfTrackEvent) {
      count += 1;
    }
  }

  return count;
}

function createImportWarnings(options: {
  readonly tempoChangeCount: number;
  readonly timeSignatureChangeCount: number;
  readonly invalidTimeSignatureCount: number;
  readonly orphanNoteOffCount: number;
  readonly danglingNoteOnCount: number;
  readonly ignoredControlChangeCount: number;
  readonly ignoredSustainControlChangeCount: number;
  readonly ignoredExpressiveEventCount: number;
  readonly skippedSystemExclusiveEventCount: number;
  readonly skippedUnknownMetaEventCount: number;
  readonly missingEndOfTrackEventCount: number;
}): readonly string[] {
  const warnings: string[] = [];

  appendCountWarning(
    warnings,
    options.tempoChangeCount,
    "later tempo event was ignored",
    "later tempo events were ignored",
  );
  appendCountWarning(
    warnings,
    options.timeSignatureChangeCount,
    "later time-signature event was ignored",
    "later time-signature events were ignored",
  );
  appendCountWarning(
    warnings,
    options.invalidTimeSignatureCount,
    "unsupported time signature was ignored",
    "unsupported time signatures were ignored",
  );
  appendCountWarning(
    warnings,
    options.ignoredControlChangeCount,
    "Control Change event was ignored",
    "Control Change events were ignored",
  );
  appendCountWarning(
    warnings,
    options.ignoredSustainControlChangeCount,
    "CC64 sustain event was ignored",
    "CC64 sustain events were ignored",
  );
  appendCountWarning(
    warnings,
    options.ignoredExpressiveEventCount,
    "unsupported channel-expression event was ignored",
    "unsupported channel-expression events were ignored",
  );
  appendCountWarning(
    warnings,
    options.orphanNoteOffCount,
    "orphan Note Off was ignored",
    "orphan Note Off events were ignored",
  );
  appendCountWarning(
    warnings,
    options.danglingNoteOnCount,
    "dangling Note On was closed at the track end",
    "dangling Note On events were closed at the track end",
  );
  appendCountWarning(
    warnings,
    options.skippedSystemExclusiveEventCount,
    "SysEx event was skipped",
    "SysEx events were skipped",
  );
  appendCountWarning(
    warnings,
    options.skippedUnknownMetaEventCount,
    "unknown metadata event was skipped",
    "unknown metadata events were skipped",
  );
  appendCountWarning(
    warnings,
    options.missingEndOfTrackEventCount,
    "track had no End of Track event",
    "tracks had no End of Track event",
  );

  return warnings;
}

function appendCountWarning(
  warnings: string[],
  count: number,
  singular: string,
  plural: string,
): void {
  if (count > 0) {
    warnings.push(
      `${String(count)} ${count === 1 ? singular : plural}.`,
    );
  }
}

function assertImportedProjectState(state: ProjectState): void {
  const activeClip = getActiveClip(state);
  const globalNoteIds = new Set<string>();
  const orderedInstrumentIds = new Set<InstrumentId>();
  let noteCount = 0;
  const projectDurationTicks =
    activeClip.measureCount
    * getTicksPerMeasure(activeClip.transportSettings);

  assertValidTransportState(activeClip.transportSettings);
  assertValidProjectDuration(
    activeClip.measureCount,
    activeClip.transportSettings,
  );

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
    const track = activeClip.tracksByInstrumentId[instrumentId];
    const instrumentState = activeClip.instrumentStatesById[instrumentId];

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
    const preset = state.instrumentPresetsById[instrument.presetId];

    if (preset === undefined) {
      throw new MidiImportError(
        `The imported instrument references unavailable preset "${instrument.presetId}".`,
      );
    }

    assertValidInstrumentPreset(preset);
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
    !Number.isFinite(activeClip.transportSettings.bpm)
    || activeClip.transportSettings.bpm
      < EDITOR_CONSTANTS.tempoMinimumBpm
    || activeClip.transportSettings.bpm
      > EDITOR_CONSTANTS.tempoMaximumBpm
    || !Number.isSafeInteger(
      activeClip.transportSettings.timeSignature.numerator,
    )
    || activeClip.transportSettings.timeSignature.numerator <= 0
    || !isSupportedTimeSignatureDenominator(
      activeClip.transportSettings.timeSignature.denominator,
    )
  ) {
    throw new MidiImportError(
      "The imported transport settings are invalid.",
    );
  }
}

export function formatMidiImportError(error: unknown): string {
  if (error instanceof MidiImportError) {
    return error.message;
  }

  if (error instanceof MidiCodecError) {
    const location =
      error.trackIndex !== null
        ? ` Track ${String(error.trackIndex + 1)}.`
        : "";
    return `${error.message}${location}`;
  }

  return error instanceof Error
    ? error.message
    : "The MIDI file could not be imported.";
}
