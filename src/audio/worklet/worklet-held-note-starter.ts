import type {
  InstrumentId,
} from "../../domain/identifiers";
import {
  collectHeldNoteIndexes,
} from "./worklet-timeline-query";
import type {
  WorkletRuntimeInstrument,
} from "./worklet-runtime-instrument";
import {
  GLOBAL_VOICE_LIMIT,
} from "./worklet-voice-allocation";
import type {
  WorkletVoiceBank,
} from "./worklet-voice-bank";

interface HeldNoteStartDiagnostic {
  readonly type: "note-start";
  readonly frame: number;
  readonly tick: number;
  readonly instrumentId: InstrumentId;
  readonly pitch: number;
}

/** Reconstructs sustained notes on play, seek and non-zero loop boundaries. */
export class WorkletHeldNoteStarter {
  private readonly noteIndexes = new Uint32Array(GLOBAL_VOICE_LIMIT);

  public start(
    runtimes: readonly WorkletRuntimeInstrument[],
    tick: number,
    diagnosticFrame: number,
    playbackBoundaryTick: number,
    voiceBank: WorkletVoiceBank,
    onDiagnostic:
      ((event: HeldNoteStartDiagnostic) => void) | undefined,
  ): void {
    for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
      const runtime = runtimes[runtimeIndex];
      if (runtime === undefined) continue;

      this.startInstrument(runtime, tick, diagnosticFrame,
        playbackBoundaryTick, voiceBank, onDiagnostic);
    }
  }

  public startInstrument(
    runtime: WorkletRuntimeInstrument,
    tick: number,
    diagnosticFrame: number,
    playbackBoundaryTick: number,
    voiceBank: WorkletVoiceBank,
    onDiagnostic:
      ((event: HeldNoteStartDiagnostic) => void) | undefined,
  ): void {
    if (!runtime.audible || runtime.timeline.endTickTreeLeafCount === 0) {
      return;
    }

    const heldNoteCount = collectHeldNoteIndexes(
      runtime.timeline,
      tick,
      Math.min(runtime.config.polyphony, this.noteIndexes.length),
      this.noteIndexes,
    );

    for (
      let heldNoteOffset = 0;
      heldNoteOffset < heldNoteCount;
      heldNoteOffset += 1
    ) {
      const noteIndex = this.noteIndexes[heldNoteOffset];

      if (noteIndex === undefined) {
        continue;
      }

      const noteId = runtime.timeline.noteIds[noteIndex];
      const startTick = runtime.timeline.startTicks[noteIndex];
      const durationTicks = runtime.timeline.durationTicks[noteIndex];
      const pitch = runtime.timeline.pitches[noteIndex];

      if (
        noteId === undefined
        || startTick === undefined
        || durationTicks === undefined
        || pitch === undefined
        || voiceBank.hasActiveTimelineVoice(
          runtime.timeline.instrumentId,
          noteId,
        )
      ) {
        continue;
      }

      voiceBank.startTimelineVoice(
        runtime,
        noteId,
        pitch,
        Math.min(playbackBoundaryTick, startTick + durationTicks),
      );
      onDiagnostic?.({
        type: "note-start",
        frame: diagnosticFrame,
        tick,
        instrumentId: runtime.timeline.instrumentId,
        pitch,
      });
    }
  }
}
