import { MIDI_CONSTANTS } from "./midi-constants";
import {
  PROJECT_CONSTANTS,
} from "../../domain/project/project-constants";
import { createDefaultProjectInstrument } from "../../domain/project-instrument-factory";
import { createDefaultInstrumentConfig } from "../../domain/instrument-presets";
import { MidiImportError } from "./midi-import-error";
import {
  getMeasureCountCoveringTick,
} from "../../domain/transport/time-map";
import {
  countImportedNoteCollisions,
} from "./midi-import-collisions";
import type {
  MidiImportAnalysis,
  MidiImportInstrumentCandidate,
  MutableInstrumentGroup,
  TempoCandidate,
  TimeSignatureCandidate,
} from "./midi-import-types";
import {
  createImportedInstrumentId,
  createImportedInstrumentName,
  createImportedProjectTitle,
  sanitizeInstrumentName,
} from "./midi-import-naming";
import {
  convertSourceNotes,
  convertTick,
  selectMeterMarkers,
  selectTempoMarkers,
} from "./midi-import-timing";
import {
  countTracksWithoutEndOfTrack,
  createImportWarnings,
} from "./midi-import-warnings";
import type { MidiEvent, ParsedMidiFile } from "./standard-midi-file";

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
      MIDI_CONSTANTS.importedInstrumentColors[
        groupIndex % MIDI_CONSTANTS.importedInstrumentColors.length
      ] ?? MIDI_CONSTANTS.defaultImportedInstrumentColor;
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
        instrument: createDefaultInstrumentConfig(groupIndex),
      }),
      notes,
    });
  }

  if (noteCount > MIDI_CONSTANTS.maximumImportedNoteCount) {
    throw new MidiImportError(
      `The MIDI file contains ${String(noteCount)} notes, exceeding the ${String(MIDI_CONSTANTS.maximumImportedNoteCount)} note import limit.`,
    );
  }

  const tempoSelection = selectTempoMarkers(
    tempoCandidates,
    file.ticksPerQuarterNote,
  );
  const meterSelection = selectMeterMarkers(
    timeSignatureCandidates,
    file.ticksPerQuarterNote,
  );
  const timelineEndTick = convertTick(
    maximumSourceTick,
    file.ticksPerQuarterNote,
  );
  const requiredMeasureCount = Math.max(
    PROJECT_CONSTANTS.minimumMeasureCount,
    getMeasureCountCoveringTick(
      PROJECT_CONSTANTS.ppqn,
      meterSelection.markers,
      timelineEndTick,
    ),
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
    tempoChangeCount: tempoSelection.ignoredEventCount,
    timeSignatureChangeCount: meterSelection.ignoredEventCount,
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

  if (tempoSelection.adjustedEventCount > 0) {
    warnings.unshift(
      `${String(tempoSelection.adjustedEventCount)} tempo ${
        tempoSelection.adjustedEventCount === 1
          ? "event was"
          : "events were"
      } adjusted to match editor limits.`,
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
    tempoMarkers: tempoSelection.markers,
    meterMarkers: meterSelection.markers,
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
