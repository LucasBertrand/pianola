import type {
  OscillatorWaveform,
} from "../../domain/instruments/synth/synth-config";

export const SYNTH_WAVEFORM_OPTIONS = Object.freeze([
  Object.freeze({ value: "sine", label: "Sine" }),
  Object.freeze({ value: "triangle", label: "Triangle" }),
  Object.freeze({ value: "sawtooth", label: "Saw" }),
  Object.freeze({ value: "square", label: "Square" }),
] satisfies readonly {
  readonly value: OscillatorWaveform;
  readonly label: string;
}[]);
