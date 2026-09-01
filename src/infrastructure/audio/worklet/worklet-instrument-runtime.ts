import type {
  InstrumentId,
} from "../../../domain/identifiers";
import type {
  SynthRuntimeConfig,
} from "../synth/synth-runtime-config";
import type {
  AudioWorkletTimelineInstrument,
} from "./audio-worklet-protocol";
import {
  WorkletHeldNoteStarter,
} from "./worklet-held-note-starter";
import type {
  WorkletRuntimeInstrument,
} from "./worklet-runtime-instrument";
import {
  lowerBound,
} from "./worklet-timeline-query";
import {
  WorkletVoiceBank,
} from "./worklet-voice-bank";

type InstrumentEvents = Pick<AudioWorkletTimelineInstrument,
  "noteIds" | "pitches" | "startTicks" | "durationTicks"
  | "maximumEndTickTree" | "endTickTreeLeafCount">;

export interface WorkletNoteStartDiagnostic {
  readonly frame: number;
  readonly tick: number;
  readonly instrumentId: InstrumentId;
  readonly pitch: number;
}

/** Owns instrument runtime state, audibility and the global voice bank. */
export class WorkletInstrumentRuntime {
  private runtimes: WorkletRuntimeInstrument[] = [];
  private readonly runtimesById = new Map<InstrumentId, WorkletRuntimeInstrument>();
  private readonly voiceBank: WorkletVoiceBank;
  private readonly heldNoteStarter = new WorkletHeldNoteStarter();
  private readonly onNoteStart:
    ((event: WorkletNoteStartDiagnostic) => void) | undefined;

  public constructor(
    sampleRate: number,
    onNoteStart?: (event: WorkletNoteStartDiagnostic) => void,
  ) {
    this.voiceBank = new WorkletVoiceBank(sampleRate);
    this.onNoteStart = onNoteStart;
  }

  public activate(
    instruments: readonly AudioWorkletTimelineInstrument[],
    tick: number,
    tuningFrequencyHz: number,
  ): void {
    const previousRuntimeById = new Map(this.runtimesById);
    const hasSoloInstrument = instruments.some((instrument) => instrument.solo);

    this.voiceBank.setTuningFrequency(tuningFrequencyHz);
    this.runtimes = [];
    this.runtimesById.clear();
    for (const instrument of instruments) {
      const previousRuntime = previousRuntimeById.get(instrument.instrumentId);
      const runtime: WorkletRuntimeInstrument = {
        timeline: instrument,
        publishedConfig: instrument.instrument,
        config: previousRuntime?.previewConfig ?? instrument.instrument,
        previewConfig: previousRuntime?.previewConfig ?? null,
        gain: instrument.gain,
        pan: instrument.pan,
        muted: instrument.muted,
        solo: instrument.solo,
        audible: !instrument.muted && (!hasSoloInstrument || instrument.solo),
        cursor: lowerBound(instrument.startTicks, tick),
      };
      this.runtimes.push(runtime);
      this.runtimesById.set(instrument.instrumentId, runtime);
    }
    this.voiceBank.synchronizeMix(this.runtimesById);
  }

  public previewInstrument(
    instrumentId: InstrumentId,
    config: SynthRuntimeConfig | null,
  ): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.previewConfig = config;
    runtime.config = config ?? runtime.publishedConfig;
    this.voiceBank.previewInstrument(instrumentId, runtime.config);
  }

  public previewGain(instrumentId: InstrumentId, gain: number): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.gain = gain;
    this.voiceBank.previewInstrumentGain(runtime);
  }

  public replaceEvents(
    instrumentId: InstrumentId,
    events: InstrumentEvents,
    currentTick: number,
    playbackBoundaryTick: number,
    playing: boolean,
    diagnosticFrame: number,
  ): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.timeline = { ...runtime.timeline, ...events };
    runtime.cursor = lowerBound(runtime.timeline.startTicks, currentTick);
    if (!playing) return;
    this.voiceBank.reconcileTimelineInstrument(
      runtime,
      currentTick,
      playbackBoundaryTick,
    );
    this.heldNoteStarter.startInstrument(
      runtime,
      currentTick,
      diagnosticFrame,
      playbackBoundaryTick,
      this.voiceBank,
      this.handleNoteStart,
    );
  }

  public updateConfig(instrumentId: InstrumentId, config: SynthRuntimeConfig): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.publishedConfig = config;
    if (runtime.previewConfig === null) {
      runtime.config = config;
      this.voiceBank.previewInstrument(instrumentId, config);
    }
  }

  public updatePan(instrumentId: InstrumentId, pan: number): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.pan = pan;
    this.voiceBank.previewInstrumentGain(runtime);
  }

  public updateMute(instrumentId: InstrumentId, muted: boolean): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.muted = muted;
    this.refreshAudibility();
  }

  public updateSolo(instrumentId: InstrumentId, solo: boolean): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime === undefined) return;
    runtime.solo = solo;
    this.refreshAudibility();
  }

  public hasInstrument(instrumentId: InstrumentId): boolean {
    return this.runtimesById.has(instrumentId);
  }

  public setTuningFrequency(tuningFrequencyHz: number): void {
    this.voiceBank.setTuningFrequency(tuningFrequencyHz);
  }

  public audition(
    auditionId: number,
    instrumentId: InstrumentId,
    pitch: number,
  ): void {
    const runtime = this.runtimesById.get(instrumentId);
    if (runtime !== undefined) {
      this.voiceBank.startAuditionVoice(runtime, auditionId, pitch);
    }
  }

  public releaseAudition(auditionId: number): void {
    this.voiceBank.releaseAuditionVoice(auditionId);
  }

  public reconcileAll(currentTick: number, playbackBoundaryTick: number): void {
    for (const runtime of this.runtimes) {
      this.voiceBank.reconcileTimelineInstrument(
        runtime,
        currentTick,
        playbackBoundaryTick,
      );
    }
  }

  public startDueNotes(
    currentTick: number,
    playbackBoundaryTick: number,
    frame: number,
  ): void {
    for (const runtime of this.runtimes) {
      const { timeline } = runtime;
      while (runtime.cursor < timeline.startTicks.length) {
        const startTick = timeline.startTicks[runtime.cursor];
        if (startTick === undefined || startTick > currentTick) break;
        const durationTicks = timeline.durationTicks[runtime.cursor];
        const pitch = timeline.pitches[runtime.cursor];
        if (durationTicks !== undefined && pitch !== undefined && runtime.audible) {
          const endTick = Math.min(playbackBoundaryTick, startTick + durationTicks);
          if (endTick > currentTick) {
            const noteId = timeline.noteIds[runtime.cursor];
            if (noteId !== undefined) {
              this.voiceBank.startTimelineVoice(runtime, noteId, pitch, endTick);
              this.onNoteStart?.({
                frame,
                tick: startTick,
                instrumentId: timeline.instrumentId,
                pitch,
              });
            }
          }
        }
        runtime.cursor += 1;
      }
    }
  }

  public startHeldNotes(
    tick: number,
    frame: number,
    playbackBoundaryTick: number,
  ): void {
    this.heldNoteStarter.start(
      this.runtimes,
      tick,
      frame,
      playbackBoundaryTick,
      this.voiceBank,
      this.handleNoteStart,
    );
  }

  public releaseDueNotes(currentTick: number): void {
    this.voiceBank.releaseDueTimelineVoices(currentTick);
  }

  public releaseTimelineVoices(): void {
    this.voiceBank.releaseTimelineVoices();
  }

  public renderFrame(
    left: Float32Array,
    right: Float32Array,
    frameIndex: number,
  ): void {
    this.voiceBank.renderFrame(left, right, frameIndex);
  }

  public pruneEndedVoices(): void {
    this.voiceBank.pruneEndedVoices();
  }

  public refreshCursors(tick: number): void {
    for (const runtime of this.runtimes) {
      runtime.cursor = lowerBound(runtime.timeline.startTicks, tick);
    }
  }

  private readonly handleNoteStart = (event: {
    readonly frame: number;
    readonly tick: number;
    readonly instrumentId: InstrumentId;
    readonly pitch: number;
  }): void => {
    this.onNoteStart?.(event);
  };

  private refreshAudibility(): void {
    const hasSolo = this.runtimes.some((runtime) => runtime.solo);
    for (const runtime of this.runtimes) {
      runtime.audible = !runtime.muted && (!hasSolo || runtime.solo);
    }
    this.voiceBank.synchronizeMix(this.runtimesById);
  }
}
