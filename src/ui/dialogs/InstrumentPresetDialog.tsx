import React from "react";
import {
  EDITOR_CONSTANTS,
} from "../../config/editor-config";
import {
  INSTRUMENT_CONSTANTS,
} from "../../config/domain-limits";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  type InstrumentPreset,
  type OscillatorWaveform,
  type SubtractiveSynthConfig,
} from "../../domain/instruments/instrument";
import {
  type PresetId,
} from "../../domain/identifiers";

export interface InstrumentPresetDialogProps {
  readonly mode: "create" | "edit";
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
  readonly selectedPresetId: PresetId | "";
  readonly instrumentName: string;
  readonly instrumentColor: string;
  readonly instrument: SubtractiveSynthConfig;
  readonly onPresetSelectionChange: (presetId: PresetId) => void;
  readonly onInstrumentNameChange: (name: string) => void;
  readonly onInstrumentColorChange: (color: string) => void;
  readonly onInstrumentChange: (instrument: SubtractiveSynthConfig) => void;
  readonly onConfirm: () => void;
  readonly onDelete?: (() => void) | undefined;
  readonly onCancel: () => void;
}

/** Edits a complete instrument draft without mutating the project. */
export function InstrumentPresetDialog({
  mode,
  presetsById,
  presetOrder,
  selectedPresetId,
  instrumentName,
  instrumentColor,
  instrument,
  onPresetSelectionChange,
  onInstrumentNameChange,
  onInstrumentColorChange,
  onInstrumentChange,
  onConfirm,
  onDelete,
  onCancel,
}: InstrumentPresetDialogProps): React.JSX.Element {
  const update = (
    changes: Partial<SubtractiveSynthConfig>,
  ): void => {
    onInstrumentChange({ ...instrument, ...changes });
  };

  return (
    <div className="application-dialog-backdrop instrument-editor-backdrop">
      <form
        className="application-dialog instrument-preset-dialog instrument-editor-dialog"
        data-tone="default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instrument-preset-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">
            {mode === "create" ? "+" : "~"}
          </span>
          <h2 id="instrument-preset-dialog-title">
            {mode === "create" ? "Add instrument" : "Edit instrument"}
          </h2>
        </div>

        <div className="instrument-editor-identity">
          <label
            className="instrument-editor-color-control"
            title="Instrument color"
          >
            <span>Color</span>
            <input
              type="color"
              value={instrumentColor}
              aria-label="Instrument color"
              onChange={(event) => {
                onInstrumentColorChange(event.currentTarget.value);
              }}
            />
          </label>
          <label className="instrument-preset-dialog-control">
            <span>Name</span>
            <input
              type="text"
              value={instrumentName}
              maxLength={MAXIMUM_INSTRUMENT_NAME_LENGTH}
              autoFocus
              autoComplete="off"
              onChange={(event) => {
                onInstrumentNameChange(event.currentTarget.value);
              }}
            />
          </label>
          <label className="instrument-preset-dialog-control">
            <span>Engine</span>
            <select value="subtractive" disabled>
              <option value="subtractive">Subtractive</option>
            </select>
          </label>
          <label className="instrument-preset-dialog-control">
            <span>Start from preset</span>
            <select
              value={selectedPresetId}
              onChange={(event) => {
                onPresetSelectionChange(event.currentTarget.value);
              }}
            >
              {selectedPresetId === "" ? (
                <option value="" disabled>Custom settings</option>
              ) : null}
              {presetOrder.map((presetId) => {
                const preset = presetsById[presetId];

                return preset === undefined ? null : (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <div className="instrument-editor-modules">
          <fieldset className="instrument-editor-module">
            <legend>Oscillator</legend>
            <label className="instrument-editor-select-control">
              <span>Waveform</span>
              <select
                value={instrument.oscillatorWaveform}
                onChange={(event) => {
                  update({
                    oscillatorWaveform:
                      event.currentTarget.value as OscillatorWaveform,
                  });
                }}
              >
                {INSTRUMENT_CONSTANTS.oscillatorWaveformOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="instrument-editor-select-control">
              <span>Polyphony</span>
              <select
                value={instrument.polyphony}
                onChange={(event) => {
                  update({ polyphony: Number(event.currentTarget.value) });
                }}
              >
                {Array.from(
                  {
                    length:
                      MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
                      - MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
                      + 1,
                  },
                  (_, index) => MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY + index,
                ).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <ParameterControl
              label="Detune"
              value={instrument.oscillatorDetuneCents}
              minimum={-1_200}
              maximum={1_200}
              step={1}
              suffix=" ct"
              onChange={(value) => update({ oscillatorDetuneCents: value })}
            />
            {instrument.oscillatorWaveform === "square" ? (
              <ParameterControl
                label="Pulse width"
                value={instrument.pulseWidth}
                minimum={INSTRUMENT_CONSTANTS.minimumPulseWidth}
                maximum={INSTRUMENT_CONSTANTS.maximumPulseWidth}
                step={EDITOR_CONSTANTS.pulseWidthStep}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => update({ pulseWidth: value })}
              />
            ) : null}
          </fieldset>

          <fieldset className="instrument-editor-module">
            <legend>Filter</legend>
            <ParameterControl
              label="Cutoff"
              value={instrument.filterCutoffHz}
              minimum={INSTRUMENT_CONSTANTS.minimumFilterCutoffHz}
              maximum={INSTRUMENT_CONSTANTS.maximumFilterCutoffHz}
              step={EDITOR_CONSTANTS.filterCutoffStepHz}
              scale="logarithmic"
              suffix=" Hz"
              onChange={(value) => update({ filterCutoffHz: value })}
            />
            <ParameterControl
              label="Resonance"
              value={instrument.filterResonance}
              minimum={INSTRUMENT_CONSTANTS.minimumFilterResonance}
              maximum={INSTRUMENT_CONSTANTS.maximumFilterResonance}
              step={EDITOR_CONSTANTS.filterResonanceStep}
              onChange={(value) => update({ filterResonance: value })}
            />
            <ParameterControl
              label="Envelope amount"
              value={instrument.filterEnvelopeAmountOctaves}
              minimum={INSTRUMENT_CONSTANTS.minimumFilterEnvelopeAmountOctaves}
              maximum={INSTRUMENT_CONSTANTS.maximumFilterEnvelopeAmountOctaves}
              step={EDITOR_CONSTANTS.filterEnvelopeAmountStepOctaves}
              suffix=" oct"
              onChange={(value) => update({ filterEnvelopeAmountOctaves: value })}
            />
          </fieldset>

          <EnvelopeControls
            title="Filter envelope"
            envelope={instrument.filterEnvelope}
            onChange={(filterEnvelope) => update({ filterEnvelope })}
          />
          <EnvelopeControls
            title="Amplitude envelope"
            envelope={instrument.envelope}
            onChange={(envelope) => update({ envelope })}
          />
        </div>

        <div
          className={`application-dialog-actions${
            mode === "edit" && onDelete ? " has-alternate" : ""
          }`}
        >
          {mode === "edit" && onDelete && (
            <button
              className="application-dialog-button is-danger"
              type="button"
              onClick={onDelete}
            >
              Delete instrument
            </button>
          )}
          <button
            className="application-dialog-button is-neutral"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="application-dialog-button is-primary"
            type="submit"
            disabled={instrumentName.trim().length === 0}
          >
            {mode === "create" ? "Add instrument" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface EnvelopeControlsProps {
  readonly title: string;
  readonly envelope: SubtractiveSynthConfig["envelope"];
  readonly onChange: (envelope: SubtractiveSynthConfig["envelope"]) => void;
}

function EnvelopeControls({
  title,
  envelope,
  onChange,
}: EnvelopeControlsProps): React.JSX.Element {
  return (
    <fieldset className="instrument-editor-module instrument-editor-envelope">
      <legend>{title}</legend>
      <div className="instrument-editor-envelope-controls">
        <ParameterControl label="Attack" value={envelope.attackSeconds} minimum={0} maximum={INSTRUMENT_CONSTANTS.maximumEnvelopeTimeSeconds} step={EDITOR_CONSTANTS.envelopeTimeStepSeconds} scale="power" suffix=" s" onChange={(attackSeconds) => onChange({ ...envelope, attackSeconds })} />
        <ParameterControl label="Decay" value={envelope.decaySeconds} minimum={0} maximum={INSTRUMENT_CONSTANTS.maximumEnvelopeDecaySeconds} step={EDITOR_CONSTANTS.envelopeTimeStepSeconds} scale="power" suffix=" s" onChange={(decaySeconds) => onChange({ ...envelope, decaySeconds })} />
        <ParameterControl label="Sustain" value={envelope.sustainLevel} minimum={0} maximum={1} step={EDITOR_CONSTANTS.sustainStep} format={(value) => `${Math.round(value * 100)}%`} onChange={(sustainLevel) => onChange({ ...envelope, sustainLevel })} />
        <ParameterControl label="Release" value={envelope.releaseSeconds} minimum={0} maximum={INSTRUMENT_CONSTANTS.maximumEnvelopeTimeSeconds} step={EDITOR_CONSTANTS.envelopeTimeStepSeconds} scale="power" suffix=" s" onChange={(releaseSeconds) => onChange({ ...envelope, releaseSeconds })} />
      </div>
    </fieldset>
  );
}

interface ParameterControlProps {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly suffix?: string;
  readonly format?: (value: number) => string;
  readonly scale?: "linear" | "logarithmic" | "power";
  readonly onChange: (value: number) => void;
}

function ParameterControl({
  label,
  value,
  minimum,
  maximum,
  step,
  suffix = "",
  format,
  scale = "linear",
  onChange,
}: ParameterControlProps): React.JSX.Element {
  const scaled = scale !== "linear";
  const position = scaled
    ? valueToPosition(value, minimum, maximum, scale)
    : value;

  return (
    <label className="instrument-editor-parameter">
      <span>{label}</span>
      <input
        type="range"
        min={scaled ? 0 : minimum}
        max={scaled ? 1 : maximum}
        step={scaled ? EDITOR_CONSTANTS.parameterSliderPositionStep : step}
        value={position}
        onChange={(event) => {
          const inputValue = Number(event.currentTarget.value);
          const nextValue = scaled
            ? positionToValue(inputValue, minimum, maximum, step, scale)
            : inputValue;

          onChange(nextValue);
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      <output>{format?.(value) ?? `${Number(value.toFixed(2))}${suffix}`}</output>
    </label>
  );
}

function valueToPosition(
  value: number,
  minimum: number,
  maximum: number,
  scale: "logarithmic" | "power",
): number {
  if (scale === "logarithmic") {
    return Math.log(value / minimum) / Math.log(maximum / minimum);
  }

  return ((value - minimum) / (maximum - minimum))
    ** (1 / EDITOR_CONSTANTS.envelopeSliderCurveExponent);
}

function positionToValue(
  position: number,
  minimum: number,
  maximum: number,
  step: number,
  scale: "logarithmic" | "power",
): number {
  const rawValue = scale === "logarithmic"
    ? minimum * (maximum / minimum) ** position
    : minimum
      + (maximum - minimum)
        * position ** EDITOR_CONSTANTS.envelopeSliderCurveExponent;

  return Number((Math.round(rawValue / step) * step).toFixed(6));
}
