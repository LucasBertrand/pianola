import React from "react";
import {
  EDITOR_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../../config/program-constants";
import type {
  AdsrEnvelope,
  ClipInstrumentState,
  OscillatorWaveform,
  SubtractiveSynthContinuousParameter,
  ProjectInstrument,
  InstrumentId,
} from "../../domain/model";
import {
  ParameterSlider,
} from "./ParameterSlider";
import {
  SubtractivePolyphonySelect,
} from "./InstrumentControls";

export interface InstrumentInspectorProps {
  readonly instrument: ProjectInstrument | undefined;
  readonly instrumentState: ClipInstrumentState | undefined;
  readonly onWaveformCommit: (
    instrumentId: InstrumentId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly onPolyphonyCommit: (
    instrumentId: InstrumentId,
    polyphony: number,
  ) => void;
  readonly onEnvelopeCommit: (
    instrumentId: InstrumentId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onEnvelopePreview: (
    instrumentId: InstrumentId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onInstrumentParameterCommit: (
    instrumentId: InstrumentId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
  readonly onInstrumentParameterPreview: (
    instrumentId: InstrumentId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
}

export function InstrumentInspector({
  instrument: projectInstrument,
  instrumentState,
  onWaveformCommit,
  onPolyphonyCommit,
  onEnvelopeCommit,
  onEnvelopePreview,
  onInstrumentParameterCommit,
  onInstrumentParameterPreview,
}: InstrumentInspectorProps): React.JSX.Element {
  if (projectInstrument === undefined || instrumentState === undefined) {
    return (
      <section className="instrument-card is-empty">
        <div className="section-title">
          <div>
            <small>Instrument</small>
            <strong>No instrument selected</strong>
          </div>
        </div>
      </section>
    );
  }

  const instrument = instrumentState.instrument;

  return (
    <section
      className="instrument-card"
      style={{
        "--instrument-color": projectInstrument.color,
      } as React.CSSProperties}
    >
      <div className="section-title instrument-card-title">
        <div>
          <small>Instrument · {projectInstrument.name}</small>
          <strong>Subtractive Synth</strong>
        </div>
      </div>

      <section className="instrument-module oscillator-module">
        <div className="instrument-module-heading">
          <strong>Oscillator</strong>
          <div className="oscillator-controls">
            <select
              className="waveform-select"
              value={instrument.oscillatorWaveform}
              aria-label="Oscillator waveform"
              onChange={(event) => {
                onWaveformCommit(
                  projectInstrument.id,
                  event.currentTarget.value as OscillatorWaveform,
                );
              }}
            >
              {INSTRUMENT_CONSTANTS.oscillatorWaveformOptions.map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
            <SubtractivePolyphonySelect
              value={instrument.polyphony}
              instrumentName={projectInstrument.name}
              onCommit={(polyphony) => {
                onPolyphonyCommit(projectInstrument.id, polyphony);
              }}
            />
          </div>
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
              key={`${projectInstrument.id}-pulse-width`}
              label="Pulse"
              value={instrument.pulseWidth}
              minimum={INSTRUMENT_CONSTANTS.minimumPulseWidth}
              maximum={INSTRUMENT_CONSTANTS.maximumPulseWidth}
              step={EDITOR_CONSTANTS.pulseWidthStep}
              scale="linear"
              orientation="horizontal"
              formatValue={formatPercentage}
              onPreview={(value) => {
                onInstrumentParameterPreview(
                  projectInstrument.id,
                  "pulseWidth",
                  value,
                );
              }}
              onCommit={(value) => {
                onInstrumentParameterCommit(
                  projectInstrument.id,
                  "pulseWidth",
                  value,
                );
              }}
            />
          </div>
        ) : null}
      </section>

      <div className="instrument-parameter-modules">
        <section className="instrument-module filter-module">
          <div className="instrument-module-heading">
            <strong>Filter</strong>
            <span>Low-pass</span>
          </div>
          <div className="parameter-grid is-filter-grid">
            <ParameterSlider
              key={`${projectInstrument.id}-filter-cutoff`}
              label="Cutoff"
              value={instrument.filterCutoffHz}
              minimum={INSTRUMENT_CONSTANTS.minimumFilterCutoffHz}
              maximum={INSTRUMENT_CONSTANTS.maximumFilterCutoffHz}
              step={EDITOR_CONSTANTS.filterCutoffStepHz}
              scale="logarithmic"
              formatValue={formatFrequency}
              onPreview={(value) => {
                onInstrumentParameterPreview(
                  projectInstrument.id,
                  "filterCutoffHz",
                  value,
                );
              }}
              onCommit={(value) => {
                onInstrumentParameterCommit(
                  projectInstrument.id,
                  "filterCutoffHz",
                  value,
                );
              }}
            />
            <ParameterSlider
              key={`${projectInstrument.id}-filter-resonance`}
              label="Reso"
              value={instrument.filterResonance}
              minimum={INSTRUMENT_CONSTANTS.minimumFilterResonance}
              maximum={INSTRUMENT_CONSTANTS.maximumFilterResonance}
              step={EDITOR_CONSTANTS.filterResonanceStep}
              scale="linear"
              formatValue={formatDecimal}
              onPreview={(value) => {
                onInstrumentParameterPreview(
                  projectInstrument.id,
                  "filterResonance",
                  value,
                );
              }}
              onCommit={(value) => {
                onInstrumentParameterCommit(
                  projectInstrument.id,
                  "filterResonance",
                  value,
                );
              }}
            />
            <ParameterSlider
              key={`${projectInstrument.id}-filter-envelope-amount`}
              label="Env"
              value={instrument.filterEnvelopeAmountOctaves}
              minimum={INSTRUMENT_CONSTANTS.minimumFilterEnvelopeAmountOctaves}
              maximum={INSTRUMENT_CONSTANTS.maximumFilterEnvelopeAmountOctaves}
              step={EDITOR_CONSTANTS.filterEnvelopeAmountStepOctaves}
              scale="linear"
              formatValue={formatOctaves}
              onPreview={(value) => {
                onInstrumentParameterPreview(
                  projectInstrument.id,
                  "filterEnvelopeAmountOctaves",
                  value,
                );
              }}
              onCommit={(value) => {
                onInstrumentParameterCommit(
                  projectInstrument.id,
                  "filterEnvelopeAmountOctaves",
                  value,
                );
              }}
            />
          </div>
        </section>
        <EnvelopeModule
          instrumentId={projectInstrument.id}
          title="Filter Envelope"
          envelopeKind="filter"
          envelope={instrument.filterEnvelope}
          onPreview={onEnvelopePreview}
          onCommit={onEnvelopeCommit}
        />
        <EnvelopeModule
          instrumentId={projectInstrument.id}
          title="Amplitude Envelope"
          envelopeKind="amplitude"
          envelope={instrument.envelope}
          onPreview={onEnvelopePreview}
          onCommit={onEnvelopeCommit}
        />
      </div>
    </section>
  );
}

interface EnvelopeModuleProps {
  readonly instrumentId: InstrumentId;
  readonly title: string;
  readonly envelopeKind: "amplitude" | "filter";
  readonly envelope: AdsrEnvelope;
  readonly onPreview: InstrumentInspectorProps["onEnvelopePreview"];
  readonly onCommit: InstrumentInspectorProps["onEnvelopeCommit"];
}

function EnvelopeModule({
  instrumentId,
  title,
  envelopeKind,
  envelope,
  onPreview,
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
          key={`${instrumentId}-${envelopeKind}-attack`}
          label="A"
          value={envelope.attackSeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onPreview={(value) => {
            onPreview(instrumentId, envelopeKind, "attackSeconds", value);
          }}
          onCommit={(value) => {
            onCommit(instrumentId, envelopeKind, "attackSeconds", value);
          }}
        />
        <ParameterSlider
          key={`${instrumentId}-${envelopeKind}-decay`}
          label="D"
          value={envelope.decaySeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeDecayMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onPreview={(value) => {
            onPreview(instrumentId, envelopeKind, "decaySeconds", value);
          }}
          onCommit={(value) => {
            onCommit(instrumentId, envelopeKind, "decaySeconds", value);
          }}
        />
        <ParameterSlider
          key={`${instrumentId}-${envelopeKind}-sustain`}
          label="S"
          value={envelope.sustainLevel}
          minimum={0}
          maximum={1}
          step={EDITOR_CONSTANTS.sustainStep}
          formatValue={formatPercentage}
          onPreview={(value) => {
            onPreview(instrumentId, envelopeKind, "sustainLevel", value);
          }}
          onCommit={(value) => {
            onCommit(instrumentId, envelopeKind, "sustainLevel", value);
          }}
        />
        <ParameterSlider
          key={`${instrumentId}-${envelopeKind}-release`}
          label="R"
          value={envelope.releaseSeconds}
          minimum={0}
          maximum={EDITOR_CONSTANTS.envelopeTimeMaximumSeconds}
          step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
          formatValue={formatEnvelopeTime}
          onPreview={(value) => {
            onPreview(instrumentId, envelopeKind, "releaseSeconds", value);
          }}
          onCommit={(value) => {
            onCommit(instrumentId, envelopeKind, "releaseSeconds", value);
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
