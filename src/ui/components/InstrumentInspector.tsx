import React from "react";
import {
  EDITOR_CONSTANTS,
  VOICE_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_INSTRUMENT_POLYPHONY,
  MINIMUM_INSTRUMENT_POLYPHONY,
  type AdsrEnvelope,
  type OscillatorWaveform,
  type Voice,
  type VoiceId,
} from "../../domain/model";
import {
  ParameterSlider,
} from "./ParameterSlider";

const INSTRUMENT_POLYPHONY_OPTIONS = Array.from(
  {
    length:
      MAXIMUM_INSTRUMENT_POLYPHONY
      - MINIMUM_INSTRUMENT_POLYPHONY
      + 1,
  },
  (_, index) => MINIMUM_INSTRUMENT_POLYPHONY + index,
);

export interface InstrumentInspectorProps {
  readonly voice: Voice | undefined;
  readonly onWaveformCommit: (
    voiceId: VoiceId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly onPolyphonyCommit: (
    voiceId: VoiceId,
    polyphony: number,
  ) => void;
  readonly onEnvelopeCommit: (
    voiceId: VoiceId,
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
}

export function InstrumentInspector({
  voice,
  onWaveformCommit,
  onPolyphonyCommit,
  onEnvelopeCommit,
}: InstrumentInspectorProps): React.JSX.Element {
  if (voice === undefined) {
    return (
      <section className="instrument-card is-empty">
        <div className="section-title">
          <div>
            <small>Instrument</small>
            <strong>No voice selected</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="instrument-card"
      style={{
        "--voice-color": voice.color,
      } as React.CSSProperties}
    >
      <div className="section-title">
        <div>
          <strong>
            <small>{voice.name}</small>
          </strong>
        </div>
        <div className="instrument-selectors">
          <select
            className="waveform-select"
            value={voice.instrument.oscillatorWaveform}
            aria-label="Oscillator waveform"
            onChange={(event) => {
              onWaveformCommit(
                voice.id,
                event.currentTarget.value as OscillatorWaveform,
              );
            }}
          >
            {VOICE_CONSTANTS.oscillatorWaveformOptions.map(
              (option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ),
            )}
          </select>
          <select
            className="polyphony-select"
            value={voice.instrument.polyphony}
            aria-label="Instrument polyphony"
            title="Instrument polyphony"
            onChange={(event) => {
              onPolyphonyCommit(
                voice.id,
                Number(event.currentTarget.value),
              );
            }}
          >
            {INSTRUMENT_POLYPHONY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="wave-display" aria-hidden="true">
        <svg viewBox="0 0 240 54" preserveAspectRatio="none">
          <path d={getWaveformPath(voice.instrument.oscillatorWaveform)} />
        </svg>
      </div>

      <div className="parameter-grid">
        <ParameterSlider
          key={`${voice.id}-attack`}
          label="Attack"
          value={voice.instrument.envelope.attackSeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onCommit={(value) => {
            onEnvelopeCommit(voice.id, "attackSeconds", value);
          }}
        />
        <ParameterSlider
          key={`${voice.id}-decay`}
          label="Decay"
          value={voice.instrument.envelope.decaySeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onCommit={(value) => {
            onEnvelopeCommit(voice.id, "decaySeconds", value);
          }}
        />
        <ParameterSlider
          key={`${voice.id}-sustain`}
          label="Sustain"
          value={voice.instrument.envelope.sustainLevel}
          minimum={0}
          maximum={1}
          step={EDITOR_CONSTANTS.sustainStep}
          formatValue={formatPercentage}
          onCommit={(value) => {
            onEnvelopeCommit(voice.id, "sustainLevel", value);
          }}
        />
        <ParameterSlider
          key={`${voice.id}-release`}
          label="Release"
          value={voice.instrument.envelope.releaseSeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onCommit={(value) => {
            onEnvelopeCommit(voice.id, "releaseSeconds", value);
          }}
        />
      </div>
    </section>
  );
}

function getWaveformPath(waveform: OscillatorWaveform): string {
  switch (waveform) {
    case "sine":
      return "M0 27 C20 4 40 4 60 27 S100 50 120 27 S160 4 180 27 S220 50 240 27";
    case "square":
      return "M0 42 L0 12 L60 12 L60 42 L120 42 L120 12 L180 12 L180 42 L240 42";
    case "triangle":
      return "M0 42 L60 12 L120 42 L180 12 L240 42";
    case "sawtooth":
      return "M0 42 L60 12 L60 42 L120 12 L120 42 L180 12 L180 42 L240 12";
  }
}

function formatEnvelopeTime(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1_000)} ms`;
  }

  return `${seconds.toFixed(2)} s`;
}

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}
