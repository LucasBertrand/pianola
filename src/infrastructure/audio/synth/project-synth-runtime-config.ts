import type {
  SynthConfig,
} from "../../../domain/instruments/synth/synth-config";
import type {
  SynthEnvelopeRuntimeConfig,
  SynthRuntimeConfig,
} from "./synth-runtime-config";

/** Canonical anti-corruption projection from durable domain data to DSP data. */
export function projectSynthRuntimeConfig(
  config: SynthConfig,
): SynthRuntimeConfig {
  return Object.freeze({
    kind: "synth-runtime",
    polyphony: config.polyphony,
    oscillator: Object.freeze({
      waveform: config.oscillatorWaveform,
      detuneCents: config.oscillatorDetuneCents,
      freePhase: config.oscillatorFreePhase,
      pulseWidth: config.pulseWidth,
    }),
    amplitudeEnvelope: projectEnvelope(config.envelope),
    filter: Object.freeze({
      cutoffHz: config.filterCutoffHz,
      resonance: config.filterResonance,
      keyTracking: config.filterKeyTracking,
      envelopeAmountOctaves: config.filterEnvelopeAmountOctaves,
    }),
    filterEnvelope: projectEnvelope(config.filterEnvelope),
  });
}

function projectEnvelope(
  envelope: SynthConfig["envelope"],
): SynthEnvelopeRuntimeConfig {
  return Object.freeze({
    attackSeconds: envelope.attackSeconds,
    decaySeconds: envelope.decaySeconds,
    sustainLevel: envelope.sustainLevel,
    releaseSeconds: envelope.releaseSeconds,
    curve: envelope.curve,
  });
}
