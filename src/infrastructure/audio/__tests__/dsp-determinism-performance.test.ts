import {
  describe,
  expect,
  test,
} from "vitest";
import type {
  OscillatorWaveform,
} from "../../../domain/instruments/instrument";
import type {
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";
import type {
  AudioWorkletTimeline,
} from "../worklet/audio-worklet-protocol";
import {
  SubtractiveWorkletVoice,
} from "../worklet/subtractive-worklet-voice";
import {
  WorkletTimelineEngine,
} from "../worklet/worklet-timeline-engine";
import {
  WorkletHeldNoteStarter,
} from "../worklet/worklet-held-note-starter";
import {
  reserveWorkletVoice,
} from "../worklet/worklet-voice-allocation";
import {
  WorkletVoiceBank,
} from "../worklet/worklet-voice-bank";
import {
  measureDspMetrics,
  type DspMetrics,
} from "./dsp-test-harness";

const SAMPLE_RATES = [44_100, 48_000, 96_000] as const;
const WAVEFORMS: readonly OscillatorWaveform[] = [
  "sine", "triangle", "sawtooth", "square",
];
const FFT_SIZE = 8_192;
const FUNDAMENTAL_HZ = 440;
const RENDER_QUANTUM = 128;

const METRIC_BUDGETS: Readonly<Record<OscillatorWaveform, {
  readonly maximumPeak: number;
  readonly minimumRms: number;
  readonly maximumRms: number;
  readonly maximumAbsoluteDc: number;
  readonly maximumDiscontinuity: number;
  readonly maximumOutOfBandEnergyDb: number;
}>> = {
  sine: {
    maximumPeak: 0.82,
    minimumRms: 0.50,
    maximumRms: 0.58,
    maximumAbsoluteDc: 0.001,
    maximumDiscontinuity: 0.06,
    maximumOutOfBandEnergyDb: -65,
  },
  triangle: {
    maximumPeak: 0.82,
    minimumRms: 0.36,
    maximumRms: 0.48,
    maximumAbsoluteDc: 0.002,
    maximumDiscontinuity: 0.08,
    maximumOutOfBandEnergyDb: -20,
  },
  sawtooth: {
    maximumPeak: 0.92,
    minimumRms: 0.34,
    maximumRms: 0.48,
    maximumAbsoluteDc: 0.002,
    maximumDiscontinuity: 1.05,
    maximumOutOfBandEnergyDb: -11,
  },
  square: {
    maximumPeak: 0.95,
    minimumRms: 0.55,
    maximumRms: 0.82,
    maximumAbsoluteDc: 0.002,
    maximumDiscontinuity: 1.05,
    maximumOutOfBandEnergyDb: -12,
  },
};

const PERFORMANCE_CASES = [
  { voiceCount: 1, maximumMillisecondsPerQuantum: 0.25 },
  { voiceCount: 8, maximumMillisecondsPerQuantum: 0.9 },
  { voiceCount: 24, maximumMillisecondsPerQuantum: 2.4 },
] as const;

describe("deterministic subtractive DSP bench", () => {
  test.each(SAMPLE_RATES)("voice and engine are deterministic at %i Hz", (sampleRate) => {
    for (const waveform of WAVEFORMS) {
      expect(renderVoice(waveform, sampleRate)).toEqual(
        renderVoice(waveform, sampleRate),
      );
      expect(renderEngine(waveform, sampleRate, 1)).toEqual(
        renderEngine(waveform, sampleRate, 1),
      );
    }
  });

  test.each(SAMPLE_RATES)("all oscillators meet DSP budgets at %i Hz", (sampleRate) => {
    for (const waveform of WAVEFORMS) {
      const voiceMetrics = measureDspMetrics(
        renderVoice(waveform, sampleRate),
        sampleRate,
        FUNDAMENTAL_HZ,
        waveform,
      );
      const engineMetrics = measureDspMetrics(
        renderEngine(waveform, sampleRate, 1),
        sampleRate,
        FUNDAMENTAL_HZ,
        waveform,
      );

      expectMetricsWithinBudget(voiceMetrics, METRIC_BUDGETS[waveform]);
      expectMetricsWithinBudget(scaleMetrics(engineMetrics, 2),
        METRIC_BUDGETS[waveform]);
    }
  });

  test.each(PERFORMANCE_CASES)(
    "$voiceCount voices stay below $maximumMillisecondsPerQuantum ms per quantum",
    ({ voiceCount, maximumMillisecondsPerQuantum }) => {
      const engine = createEngine("sawtooth", 48_000, voiceCount);
      const left = new Float32Array(RENDER_QUANTUM);
      const right = new Float32Array(RENDER_QUANTUM);
      for (let index = 0; index < 100; index += 1) {
        engine.process(left, right);
      }

      const batchDurations = new Float64Array(7);
      const quantaPerBatch = 200;
      for (let batch = 0; batch < batchDurations.length; batch += 1) {
        const start = performance.now();
        for (let quantum = 0; quantum < quantaPerBatch; quantum += 1) {
          engine.process(left, right);
        }
        batchDurations[batch] = performance.now() - start;
      }

      batchDurations.sort();
      const medianMillisecondsPerQuantum =
        (batchDurations[Math.floor(batchDurations.length / 2)] ?? Infinity)
        / quantaPerBatch;
      expect(medianMillisecondsPerQuantum,
        `${String(voiceCount)} voices took ${medianMillisecondsPerQuantum.toFixed(3)} ms/quantum`)
        .toBeLessThan(maximumMillisecondsPerQuantum);
    },
  );

  test("process reuses caller buffers and performs no constructor allocation", () => {
    const engine = createEngine("sawtooth", 48_000, 24);
    const left = new Float32Array(RENDER_QUANTUM);
    const right = new Float32Array(RENDER_QUANTUM);
    engine.process(left, right);

    const originalArray = globalThis.Array;
    const originalFloat32Array = globalThis.Float32Array;
    const originalFloat64Array = globalThis.Float64Array;
    const failAllocation = (): never => {
      throw new Error("A constructor allocation occurred in process().");
    };

    let processResult: void;
    try {
      Object.defineProperty(globalThis, "Array", {
        configurable: true,
        value: new Proxy(originalArray, { construct: failAllocation }),
      });
      Object.defineProperty(globalThis, "Float32Array", {
        configurable: true,
        value: new Proxy(originalFloat32Array, { construct: failAllocation }),
      });
      Object.defineProperty(globalThis, "Float64Array", {
        configurable: true,
        value: new Proxy(originalFloat64Array, { construct: failAllocation }),
      });
      processResult = engine.process(left, right);
    } finally {
      Object.defineProperty(globalThis, "Array", {
        configurable: true,
        value: originalArray,
      });
      Object.defineProperty(globalThis, "Float32Array", {
        configurable: true,
        value: originalFloat32Array,
      });
      Object.defineProperty(globalThis, "Float64Array", {
        configurable: true,
        value: originalFloat64Array,
      });
    }

    expect(processResult).toBeUndefined();
    expect(left).toHaveLength(RENDER_QUANTUM);
    expect(right).toHaveLength(RENDER_QUANTUM);
    for (const hotPath of [
      WorkletTimelineEngine.prototype.process,
      WorkletVoiceBank.prototype.renderFrame,
      WorkletVoiceBank.prototype.releaseDueTimelineVoices,
      WorkletVoiceBank.prototype.releaseTimelineVoices,
      WorkletVoiceBank.prototype.pruneEndedVoices,
      WorkletHeldNoteStarter.prototype.start,
      reserveWorkletVoice,
    ]) {
      expect(hotPath.toString()).not.toMatch(
        /\bnew\s|for\s*\([^)]*\sof\s|Array\.from|\.(?:map|filter|slice|concat)\(/,
      );
    }
  });
});

function renderVoice(
  waveform: OscillatorWaveform,
  sampleRate: number,
): Float32Array {
  const voice = new SubtractiveWorkletVoice(sampleRate);
  voice.start("dsp", 69, createConfig(waveform, 1), 440, 1, null, null);
  for (let index = 0; index < Math.round(sampleRate * 0.25); index += 1) {
    voice.render();
  }
  const samples = new Float32Array(FFT_SIZE);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = voice.render();
  }
  return samples;
}

function renderEngine(
  waveform: OscillatorWaveform,
  sampleRate: number,
  voiceCount: number,
): Float32Array {
  const engine = createEngine(waveform, sampleRate, voiceCount);
  const warmup = new Float32Array(Math.round(sampleRate * 0.25));
  engine.process(warmup, new Float32Array(warmup.length));
  const left = new Float32Array(FFT_SIZE);
  engine.process(left, new Float32Array(FFT_SIZE));
  return left;
}

function createEngine(
  waveform: OscillatorWaveform,
  sampleRate: number,
  voiceCount: number,
): WorkletTimelineEngine {
  const pitches = new Uint8Array(voiceCount);
  const noteIds = Array.from(
    { length: voiceCount },
    (_, noteIndex) => `dsp-${String(noteIndex)}`,
  );
  const startTicks = new Float64Array(voiceCount);
  const durationTicks = new Float64Array(voiceCount);
  pitches.fill(69);
  durationTicks.fill(1_000_000);
  const timeline: AudioWorkletTimeline = {
    sourceId: "dsp-bench",
    ppqn: 960,
    durationTicks: 1_000_000,
    masterGain: 1,
    masterMuted: false,
    masterTuningFrequencyHz: 440,
    tempoStartTicks: new Float64Array([0]),
    tempoBpms: new Float64Array([120]),
    instruments: [{
      instrumentId: "dsp",
      noteIds,
      pitches,
      startTicks,
      durationTicks,
      maximumEndTickTree: new Float64Array(0),
      endTickTreeLeafCount: 0,
      gain: voiceCount === 1 ? 1 : 1 / voiceCount,
      pan: -1,
      muted: false,
      solo: false,
      instrument: createConfig(waveform, voiceCount),
    }],
  };
  const engine = new WorkletTimelineEngine(sampleRate);
  engine.loadTimeline(timeline, {
    loopEnabled: false,
    loop: { startTick: 0, endTick: 3_840 },
  });
  engine.play(0);
  return engine;
}

function createConfig(
  waveform: OscillatorWaveform,
  polyphony: number,
): SubtractivePlaybackPresetSnapshot {
  return {
    kind: "subtractive",
    oscillatorWaveform: waveform,
    polyphony,
    oscillatorDetuneCents: 0,
    oscillatorFreePhase: false,
    pulseWidth: 0.5,
    envelope: {
      attackSeconds: 0,
      decaySeconds: 0,
      sustainLevel: 1,
      releaseSeconds: 0.01,
      curve: 0,
    },
    filterCutoffHz: 20_000,
    filterResonance: 0,
    filterKeyTracking: 0,
    filterEnvelopeAmountOctaves: 0,
    filterEnvelope: {
      attackSeconds: 0,
      decaySeconds: 0,
      sustainLevel: 0,
      releaseSeconds: 0.01,
      curve: 0,
    },
  };
}

function scaleMetrics(metrics: DspMetrics, scale: number): DspMetrics {
  return {
    peak: metrics.peak * scale,
    rms: metrics.rms * scale,
    dcOffset: metrics.dcOffset * scale,
    maximumDiscontinuity: metrics.maximumDiscontinuity * scale,
    outOfBandEnergyDb: metrics.outOfBandEnergyDb,
  };
}

function expectMetricsWithinBudget(
  metrics: DspMetrics,
  budget: typeof METRIC_BUDGETS[OscillatorWaveform],
): void {
  expect(metrics.peak).toBeLessThanOrEqual(budget.maximumPeak);
  expect(metrics.rms).toBeGreaterThanOrEqual(budget.minimumRms);
  expect(metrics.rms).toBeLessThanOrEqual(budget.maximumRms);
  expect(Math.abs(metrics.dcOffset)).toBeLessThanOrEqual(
    budget.maximumAbsoluteDc,
  );
  expect(metrics.maximumDiscontinuity).toBeLessThanOrEqual(
    budget.maximumDiscontinuity,
  );
  expect(metrics.outOfBandEnergyDb).toBeLessThanOrEqual(
    budget.maximumOutOfBandEnergyDb,
  );
}
