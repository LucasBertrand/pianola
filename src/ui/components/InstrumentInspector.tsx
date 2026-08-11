import React from "react";
import {
  EDITOR_CONSTANTS,
  VOICE_CONSTANTS,
} from "../../config/program-constants";
import type {
  AdsrEnvelope,
  OscillatorWaveform,
  SubtractiveSynthContinuousParameter,
  Voice,
  VoiceId,
} from "../../domain/model";
import {
  ParameterSlider,
} from "./ParameterSlider";

export interface InstrumentInspectorProps {
  readonly voice: Voice | undefined;
  readonly onWaveformCommit: (
    voiceId: VoiceId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly onEnvelopeCommit: (
    voiceId: VoiceId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onInstrumentParameterCommit: (
    voiceId: VoiceId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
}

export function InstrumentInspector({
  voice,
  onWaveformCommit,
  onEnvelopeCommit,
  onInstrumentParameterCommit,
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

  const instrument = voice.instrument;

  return (
    <section
      className="instrument-card"
      style={{
        "--voice-color": voice.color,
      } as React.CSSProperties}
    >
      <div className="section-title instrument-card-title">
        <div>
          <small>Instrument · {voice.name}</small>
          <strong>Subtractive Synth</strong>
        </div>
      </div>

      <section className="instrument-module oscillator-module">
        <div className="instrument-module-heading">
          <strong>Oscillator</strong>
          <select
            className="waveform-select"
            value={instrument.oscillatorWaveform}
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
        </div>

        <div className="wave-display" aria-hidden="true">
          <svg viewBox="0 0 240 54" preserveAspectRatio="none">
            <path
              d={getWaveformPath(
                instrument.oscillatorWaveform,
                instrument.pulseWidth,
              )}
            />
          </svg>
        </div>

        {instrument.oscillatorWaveform === "square" ? (
          <div className="parameter-grid is-single-parameter">
            <ParameterSlider
              key={`${voice.id}-pulse-width`}
              label="Pulse"
              value={instrument.pulseWidth}
              minimum={VOICE_CONSTANTS.minimumPulseWidth}
              maximum={VOICE_CONSTANTS.maximumPulseWidth}
              step={EDITOR_CONSTANTS.pulseWidthStep}
              scale="linear"
              orientation="horizontal"
              formatValue={formatPercentage}
              onCommit={(value) => {
                onInstrumentParameterCommit(
                  voice.id,
                  "pulseWidth",
                  value,
                );
              }}
            />
          </div>
        ) : null}
      </section>

      <section className="instrument-module">
        <div className="instrument-module-heading">
          <strong>Filter</strong>
          <span>Low-pass</span>
        </div>
        <div className="parameter-grid is-filter-grid">
          <ParameterSlider
            key={`${voice.id}-filter-cutoff`}
            label="Cutoff"
            value={instrument.filterCutoffHz}
            minimum={VOICE_CONSTANTS.minimumFilterCutoffHz}
            maximum={VOICE_CONSTANTS.maximumFilterCutoffHz}
            step={EDITOR_CONSTANTS.filterCutoffStepHz}
            scale="logarithmic"
            formatValue={formatFrequency}
            onCommit={(value) => {
              onInstrumentParameterCommit(
                voice.id,
                "filterCutoffHz",
                value,
              );
            }}
          />
          <ParameterSlider
            key={`${voice.id}-filter-resonance`}
            label="Reso"
            value={instrument.filterResonance}
            minimum={VOICE_CONSTANTS.minimumFilterResonance}
            maximum={VOICE_CONSTANTS.maximumFilterResonance}
            step={EDITOR_CONSTANTS.filterResonanceStep}
            scale="linear"
            formatValue={formatDecimal}
            onCommit={(value) => {
              onInstrumentParameterCommit(
                voice.id,
                "filterResonance",
                value,
              );
            }}
          />
          <ParameterSlider
            key={`${voice.id}-filter-envelope-amount`}
            label="Env"
            value={instrument.filterEnvelopeAmountOctaves}
            minimum={VOICE_CONSTANTS.minimumFilterEnvelopeAmountOctaves}
            maximum={VOICE_CONSTANTS.maximumFilterEnvelopeAmountOctaves}
            step={EDITOR_CONSTANTS.filterEnvelopeAmountStepOctaves}
            scale="linear"
            formatValue={formatOctaves}
            onCommit={(value) => {
              onInstrumentParameterCommit(
                voice.id,
                "filterEnvelopeAmountOctaves",
                value,
              );
            }}
          />
        </div>
      </section>

      <div className="instrument-envelope-grid">
        <EnvelopeModule
          voiceId={voice.id}
          title="Amplitude Envelope"
          envelopeKind="amplitude"
          envelope={instrument.envelope}
          onCommit={onEnvelopeCommit}
        />
        <EnvelopeModule
          voiceId={voice.id}
          title="Filter Envelope"
          envelopeKind="filter"
          envelope={instrument.filterEnvelope}
          onCommit={onEnvelopeCommit}
        />
      </div>
    </section>
  );
}

interface EnvelopeModuleProps {
  readonly voiceId: VoiceId;
  readonly title: string;
  readonly envelopeKind: "amplitude" | "filter";
  readonly envelope: AdsrEnvelope;
  readonly onCommit: InstrumentInspectorProps["onEnvelopeCommit"];
}

function EnvelopeModule({
  voiceId,
  title,
  envelopeKind,
  envelope,
  onCommit,
}: EnvelopeModuleProps): React.JSX.Element {
  return (
    <section className="instrument-module envelope-module">
      <div className="instrument-module-heading">
        <strong>{title}</strong>
        <span>ADSR</span>
      </div>
      <div className="parameter-grid">
        <ParameterSlider
          key={`${voiceId}-${envelopeKind}-attack`}
          label="Attack"
          value={envelope.attackSeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onCommit={(value) => {
            onCommit(voiceId, envelopeKind, "attackSeconds", value);
          }}
        />
        <ParameterSlider
          key={`${voiceId}-${envelopeKind}-decay`}
          label="Decay"
          value={envelope.decaySeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeDecayMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onCommit={(value) => {
            onCommit(voiceId, envelopeKind, "decaySeconds", value);
          }}
        />
        <ParameterSlider
          key={`${voiceId}-${envelopeKind}-sustain`}
          label="Sustain"
          value={envelope.sustainLevel}
          minimum={0}
          maximum={1}
          step={EDITOR_CONSTANTS.sustainStep}
          formatValue={formatPercentage}
          onCommit={(value) => {
            onCommit(voiceId, envelopeKind, "sustainLevel", value);
          }}
        />
        <ParameterSlider
          key={`${voiceId}-${envelopeKind}-release`}
          label="Release"
          value={envelope.releaseSeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onCommit={(value) => {
            onCommit(voiceId, envelopeKind, "releaseSeconds", value);
          }}
        />
      </div>
    </section>
  );
}

function getWaveformPath(
  waveform: OscillatorWaveform,
  pulseWidth: number,
): string {
  switch (waveform) {
    case "sine":
      return "M0 27 C20 4 40 4 60 27 S100 50 120 27 S160 4 180 27 S220 50 240 27";
    case "square":
      return createPulseWaveformPath(pulseWidth);
    case "triangle":
      return "M0 42 L60 12 L120 42 L180 12 L240 42";
    case "sawtooth":
      return "M0 42 L60 12 L60 42 L120 12 L120 42 L180 12 L180 42 L240 12";
  }
}

function createPulseWaveformPath(pulseWidth: number): string {
  const cycleWidth = 60;
  const highWidth = cycleWidth * pulseWidth;
  let path = "M0 42 L0 12";

  for (let cycle = 0; cycle < 4; cycle += 1) {
    const cycleStart = cycle * cycleWidth;
    const fallingEdge = cycleStart + highWidth;
    const cycleEnd = cycleStart + cycleWidth;

    path += ` L${fallingEdge} 12 L${fallingEdge} 42`;

    if (cycle < 3) {
      path += ` L${cycleEnd} 42 L${cycleEnd} 12`;
    } else {
      path += ` L${cycleEnd} 42`;
    }
  }

  return path;
}

function formatEnvelopeTime(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1_000)} ms`;
  }

  return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatFrequency(value: number): string {
  return value >= 1_000
    ? `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} kHz`
    : `${Math.round(value)} Hz`;
}

function formatDecimal(value: number): string {
  return value.toFixed(1);
}

function formatOctaves(value: number): string {
  return `${value.toFixed(1)} oct`;
}
