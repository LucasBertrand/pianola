import React, {
  useState,
} from "react";
import {
  EDITOR_CONSTANTS,
} from "../../editor-core/model/editor-constants";
import {
  SYNTH_CONSTANTS,
} from "../../domain/instruments/synth/synth-constants";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
} from "../../domain/instruments/project-instrument";
import {
  MAXIMUM_SYNTH_POLYPHONY,
  MINIMUM_SYNTH_POLYPHONY,
} from "../../domain/instruments/synth/synth-constants";
import type {
  InstrumentPreset,
} from "../../domain/instruments/presets/instrument-preset";
import type {
  OscillatorWaveform,
  SynthConfig,
} from "../../domain/instruments/synth/synth-config";
import {
  type PresetId,
} from "../../domain/identifiers";
import {
  Slider,
} from "../slider/Slider";
import {
  FilterResponseVisual,
} from "./FilterResponseVisual";
import {
  SYNTH_WAVEFORM_OPTIONS,
} from "./synth-waveform-options";

export interface InstrumentPresetDialogProps {
  readonly mode: "create" | "edit";
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
  readonly personalPresetIds: ReadonlySet<PresetId>;
  readonly selectedPresetId: PresetId | "";
  readonly instrumentName: string;
  readonly instrumentColor: string;
  readonly instrument: SynthConfig;
  readonly onPresetSelectionChange: (presetId: PresetId) => void;
  readonly onInstrumentNameChange: (name: string) => void;
  readonly onInstrumentColorChange: (color: string) => void;
  readonly onInstrumentChange: (instrument: SynthConfig) => void;
  readonly selectedPresetIsPersonal: boolean;
  readonly onCreatePreset: (name: string) => Promise<void>;
  readonly onSavePreset: () => Promise<void>;
  readonly onRenamePreset: (name: string) => Promise<void>;
  readonly onDeletePreset: () => Promise<void>;
  readonly onConfirm: () => void;
  readonly onDelete?: (() => void) | undefined;
  readonly onCancel: () => void;
}

/** Edits a complete instrument draft without mutating the project. */
export function InstrumentPresetDialog({
  mode,
  presetsById,
  presetOrder,
  personalPresetIds,
  selectedPresetId,
  instrumentName,
  instrumentColor,
  instrument,
  onPresetSelectionChange,
  onInstrumentNameChange,
  onInstrumentColorChange,
  onInstrumentChange,
  selectedPresetIsPersonal,
  onCreatePreset,
  onSavePreset,
  onRenamePreset,
  onDeletePreset,
  onConfirm,
  onDelete,
  onCancel,
}: InstrumentPresetDialogProps): React.JSX.Element {
  const [presetAction, setPresetAction] = useState<
    "create" | "overwrite" | "rename" | "delete" | null
  >(null);
  const [presetName, setPresetName] = useState("");
  const [presetActionPending, setPresetActionPending] = useState(false);
  const [presetActionError, setPresetActionError] = useState<string | null>(null);
  const update = (
    changes: Partial<SynthConfig>,
  ): void => {
    onInstrumentChange({ ...instrument, ...changes });
  };
  const beginPresetAction = (
    action: "create" | "overwrite" | "rename" | "delete",
  ): void => {
    const selectedPreset = selectedPresetId === ""
      ? undefined
      : presetsById[selectedPresetId];

    setPresetAction(action);
    setPresetName(
      action === "create"
        ? instrumentName.trim()
        : selectedPreset?.name ?? "",
    );
    setPresetActionError(null);
  };
  const commitPresetAction = async (): Promise<void> => {
    if (presetAction === null || presetActionPending) {
      return;
    }

    const normalizedName = presetName.trim();

    if (
      (presetAction === "create" || presetAction === "rename")
      && normalizedName.length === 0
    ) {
      setPresetActionError("Preset name is required.");
      return;
    }

    setPresetActionPending(true);
    setPresetActionError(null);

    try {
      if (presetAction === "create") {
        await onCreatePreset(normalizedName);
      } else if (presetAction === "overwrite") {
        await onSavePreset();
      } else if (presetAction === "rename") {
        await onRenamePreset(normalizedName);
      } else {
        await onDeletePreset();
      }

      setPresetAction(null);
    } catch (error: unknown) {
      setPresetActionError(
        error instanceof Error ? error.message : "Unable to update the preset.",
      );
    } finally {
      setPresetActionPending(false);
    }
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
          <label className="instrument-preset-dialog-control instrument-editor-name-control">
            <span>Name</span>
            <input
              type="text"
              value={instrumentName}
              maxLength={MAXIMUM_INSTRUMENT_NAME_LENGTH}
              autoComplete="off"
              onChange={(event) => {
                onInstrumentNameChange(event.currentTarget.value);
              }}
            />
          </label>
          <label className="instrument-preset-dialog-control instrument-editor-kind-control">
            <span>Kind</span>
            <select value="synth" disabled>
              <option value="synth">Synth</option>
            </select>
          </label>
          <div className="instrument-preset-manager">
            <label className="instrument-preset-dialog-control">
              <span>Start from preset</span>
              <select
                value={selectedPresetId}
                onChange={(event) => {
                  setPresetAction(null);
                  onPresetSelectionChange(event.currentTarget.value);
                }}
              >
                {selectedPresetId === "" ? (
                  <option value="" disabled>Custom settings</option>
                ) : null}
                <PresetOptions
                  label="Project presets"
                  presetIds={presetOrder.filter(
                    (presetId) => !personalPresetIds.has(presetId),
                  )}
                  presetsById={presetsById}
                />
                <PresetOptions
                  label="Personal presets"
                  presetIds={presetOrder.filter(
                    (presetId) => personalPresetIds.has(presetId),
                  )}
                  presetsById={presetsById}
                />
              </select>
            </label>
            <div className="instrument-preset-manager-actions">
              <button
                type="button"
                onClick={() => beginPresetAction("create")}
              >
                Create preset
              </button>
              {selectedPresetIsPersonal ? (
                <>
                  <button
                    type="button"
                    onClick={() => beginPresetAction("overwrite")}
                  >
                    Save preset
                  </button>
                  <button
                    type="button"
                    onClick={() => beginPresetAction("rename")}
                  >
                    Rename
                  </button>
                  <button
                    className="is-danger"
                    type="button"
                    onClick={() => beginPresetAction("delete")}
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {presetAction === null ? null : (
          <div className="instrument-preset-action-panel">
            {presetAction === "delete" ? (
              <span>Delete this preset from your personal library?</span>
            ) : presetAction === "overwrite" ? (
              <span>
                Replace this preset with the current instrument settings?
              </span>
            ) : (
              <label className="instrument-preset-dialog-control">
                <span>
                  {presetAction === "create" ? "New preset name" : "Preset name"}
                </span>
                <input
                  type="text"
                  value={presetName}
                  maxLength={MAXIMUM_INSTRUMENT_NAME_LENGTH}
                  autoComplete="off"
                  autoFocus
                  onChange={(event) => setPresetName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitPresetAction();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setPresetAction(null);
                    }
                  }}
                />
              </label>
            )}
            {presetActionError === null ? null : (
              <span className="instrument-preset-action-error">
                {presetActionError}
              </span>
            )}
            <div className="instrument-preset-action-buttons">
              <button
                type="button"
                disabled={presetActionPending}
                onClick={() => setPresetAction(null)}
              >
                Cancel
              </button>
              <button
                className={presetAction === "delete" ? "is-danger" : "is-primary"}
                type="button"
                disabled={
                  presetActionPending
                  || ((presetAction === "create" || presetAction === "rename")
                    && presetName.trim().length === 0)
                }
                onClick={() => void commitPresetAction()}
              >
                {presetActionPending
                  ? "Saving…"
                  : presetAction === "delete"
                    ? "Delete preset"
                    : presetAction === "overwrite"
                      ? "Save preset"
                      : presetAction === "rename"
                        ? "Rename preset"
                        : "Create preset"}
              </button>
            </div>
          </div>
        )}

        <div className="instrument-editor-modules">
          <fieldset className="instrument-editor-module">
            <legend>Oscillator</legend>
            <div className="instrument-editor-module-layout has-visual">
              <div className="instrument-editor-control-list">
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
                    {SYNTH_WAVEFORM_OPTIONS.map(
                      (option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ),
                    )}
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
                          MAXIMUM_SYNTH_POLYPHONY
                          - MINIMUM_SYNTH_POLYPHONY
                          + 1,
                      },
                      (_, index) => MINIMUM_SYNTH_POLYPHONY + index,
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
                    minimum={SYNTH_CONSTANTS.minimumPulseWidth}
                    maximum={SYNTH_CONSTANTS.maximumPulseWidth}
                    step={EDITOR_CONSTANTS.pulseWidthStep}
                    format={(value) => `${Math.round(value * 100)}%`}
                    onChange={(value) => update({ pulseWidth: value })}
                  />
                ) : null}
                <label className="instrument-editor-toggle-control">
                  <span>Free phase</span>
                  <input
                    type="checkbox"
                    checked={instrument.oscillatorFreePhase}
                    onChange={(event) => {
                      update({
                        oscillatorFreePhase: event.currentTarget.checked,
                      });
                    }}
                  />
                  <output>
                    {instrument.oscillatorFreePhase ? "On" : "Off"}
                  </output>
                </label> 
              </div>
              <WaveformVisual
                waveform={instrument.oscillatorWaveform}
                pulseWidth={instrument.pulseWidth}
              />
            </div>
          </fieldset>

          <fieldset className="instrument-editor-module">
            <legend>Filter</legend>
            <div className="instrument-editor-module-layout has-visual">
              <div className="instrument-editor-control-list">
                <ParameterControl
                  label="Cutoff"
                  value={instrument.filterCutoffHz}
                  minimum={SYNTH_CONSTANTS.minimumFilterCutoffHz}
                  maximum={SYNTH_CONSTANTS.maximumFilterCutoffHz}
                  step={EDITOR_CONSTANTS.filterCutoffStepHz}
                  scale="logarithmic"
                  suffix=" Hz"
                  onChange={(value) => update({ filterCutoffHz: value })}
                />
                <ParameterControl
                  label="Resonance"
                  value={instrument.filterResonance}
                  minimum={SYNTH_CONSTANTS.minimumFilterResonance}
                  maximum={SYNTH_CONSTANTS.maximumFilterResonance}
                  step={EDITOR_CONSTANTS.filterResonanceStep}
                  onChange={(value) => update({ filterResonance: value })}
                />
                <ParameterControl
                  label="Key tracking"
                  value={instrument.filterKeyTracking}
                  minimum={SYNTH_CONSTANTS.minimumFilterKeyTracking}
                  maximum={SYNTH_CONSTANTS.maximumFilterKeyTracking}
                  step={EDITOR_CONSTANTS.filterKeyTrackingStep}
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => update({ filterKeyTracking: value })}
                />
                <ParameterControl
                  label="Envelope amount"
                  value={instrument.filterEnvelopeAmountOctaves}
                  minimum={SYNTH_CONSTANTS.minimumFilterEnvelopeAmountOctaves}
                  maximum={SYNTH_CONSTANTS.maximumFilterEnvelopeAmountOctaves}
                  step={EDITOR_CONSTANTS.filterEnvelopeAmountStepOctaves}
                  suffix=" oct"
                  onChange={(value) => update({
                    filterEnvelopeAmountOctaves: value,
                  })}
                />
              </div>
              <FilterResponseVisual
                cutoffHz={instrument.filterCutoffHz}
                resonance={instrument.filterResonance}
              />
            </div>
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

interface PresetOptionsProps {
  readonly label: string;
  readonly presetIds: readonly PresetId[];
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
}

function PresetOptions({
  label,
  presetIds,
  presetsById,
}: PresetOptionsProps): React.JSX.Element | null {
  if (presetIds.length === 0) {
    return null;
  }

  return (
    <optgroup label={label}>
      {presetIds.map((presetId) => {
        const preset = presetsById[presetId];

        return preset === undefined ? null : (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        );
      })}
    </optgroup>
  );
}

interface EnvelopeControlsProps {
  readonly title: string;
  readonly envelope: SynthConfig["envelope"];
  readonly onChange: (envelope: SynthConfig["envelope"]) => void;
}

function EnvelopeControls({
  title,
  envelope,
  onChange,
}: EnvelopeControlsProps): React.JSX.Element {
  return (
    <fieldset className="instrument-editor-module instrument-editor-envelope">
      <legend>{title}</legend>
      <div className="instrument-editor-module-layout has-visual">
        <div className="instrument-editor-envelope-controls">
          <ParameterControl
            label="Attack"
            value={envelope.attackSeconds}
            minimum={0}
            maximum={SYNTH_CONSTANTS.maximumEnvelopeTimeSeconds}
            step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
            scale="power"
            format={formatMilliseconds}
            onChange={(attackSeconds) => onChange({
              ...envelope,
              attackSeconds,
            })}
          />
          <ParameterControl
            label="Decay"
            value={envelope.decaySeconds}
            minimum={0}
            maximum={SYNTH_CONSTANTS.maximumEnvelopeDecaySeconds}
            step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
            scale="power"
            format={formatMilliseconds}
            onChange={(decaySeconds) => onChange({
              ...envelope,
              decaySeconds,
            })}
          />
          <ParameterControl
            label="Sustain"
            value={envelope.sustainLevel}
            minimum={0}
            maximum={1}
            step={EDITOR_CONSTANTS.sustainStep}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(sustainLevel) => onChange({
              ...envelope,
              sustainLevel,
            })}
          />
          <ParameterControl
            label="Release"
            value={envelope.releaseSeconds}
            minimum={0}
            maximum={SYNTH_CONSTANTS.maximumEnvelopeTimeSeconds}
            step={EDITOR_CONSTANTS.envelopeTimeStepSeconds}
            scale="power"
            format={formatMilliseconds}
            onChange={(releaseSeconds) => onChange({
              ...envelope,
              releaseSeconds,
            })}
          />
          <ParameterControl
            label="Curve"
            value={envelope.curve}
            minimum={SYNTH_CONSTANTS.minimumEnvelopeCurve}
            maximum={SYNTH_CONSTANTS.maximumEnvelopeCurve}
            step={EDITOR_CONSTANTS.envelopeCurveStep}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(curve) => onChange({ ...envelope, curve })}
          />
        </div>
        <EnvelopeVisual envelope={envelope} />
      </div>
    </fieldset>
  );
}

interface WaveformVisualProps {
  readonly waveform: OscillatorWaveform;
  readonly pulseWidth: number;
}

function WaveformVisual({
  waveform,
  pulseWidth,
}: WaveformVisualProps): React.JSX.Element {
  const title = waveform === "square"
    ? `Square waveform at ${Math.round(pulseWidth * 100)}% pulse width`
    : `${waveform} waveform`;

  return (
    <div className="instrument-editor-visual">
      <span>Wave</span>
      <svg viewBox="0 0 128 72" role="img" aria-label={title}>
        <title>{title}</title>
        <path className="instrument-editor-visual-grid" d="M6 36H122" />
        <polyline
          className="instrument-editor-visual-line"
          points={createWaveformPoints(waveform, pulseWidth)}
        />
      </svg>
    </div>
  );
}

interface EnvelopeVisualProps {
  readonly envelope: SynthConfig["envelope"];
}

function EnvelopeVisual({
  envelope,
}: EnvelopeVisualProps): React.JSX.Element {
  const preview = createEnvelopePreview(envelope);

  return (
    <div className="instrument-editor-visual">
      <span>ADSR</span>
      <svg viewBox="0 0 132 80" role="img" aria-label="Envelope preview">
        <title>Envelope preview</title>
        <path className="instrument-editor-visual-grid" d="M8 66H124" />
        {preview.boundaries.map((x) => (
          <path
            key={x}
            className="instrument-editor-visual-guide"
            d={`M${x} 10V66`}
          />
        ))}
        <polyline
          className="instrument-editor-visual-line"
          points={preview.points}
        />
        {preview.nodes.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            className="instrument-editor-visual-node"
            cx={x}
            cy={y}
            r="2.5"
          />
        ))}
      </svg>
    </div>
  );
}

function formatMilliseconds(seconds: number): string {
  return `${Math.round(seconds * 1_000)} ms`;
}

function createWaveformPoints(
  waveform: OscillatorWaveform,
  pulseWidth: number,
): string {
  const sampleCount = 97;

  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1);
    const phase = progress * 2;
    const cycle = phase % 1;
    let value: number;

    switch (waveform) {
      case "sine":
        value = Math.sin(phase * Math.PI * 2);
        break;
      case "triangle":
        value = 1 - 4 * Math.abs(cycle - 0.5);
        break;
      case "sawtooth":
        value = 1 - 2 * cycle;
        break;
      case "square":
        value = cycle < pulseWidth ? 1 : -1;
        break;
    }

    const x = 6 + progress * 116;
    const y = 36 - value * 21;

    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function createEnvelopePreview(
  envelope: SynthConfig["envelope"],
): {
  readonly points: string;
  readonly boundaries: readonly number[];
  readonly nodes: ReadonlyArray<readonly [number, number]>;
} {
  const left = 8;
  const right = 124;
  const top = 10;
  const bottom = 66;
  const attackWeight = envelopeStageWeight(
    envelope.attackSeconds,
    SYNTH_CONSTANTS.maximumEnvelopeTimeSeconds,
  );
  const decayWeight = envelopeStageWeight(
    envelope.decaySeconds,
    SYNTH_CONSTANTS.maximumEnvelopeDecaySeconds,
  );
  const sustainWeight = 0.24;
  const releaseWeight = envelopeStageWeight(
    envelope.releaseSeconds,
    SYNTH_CONSTANTS.maximumEnvelopeTimeSeconds,
  );
  const weightTotal =
    attackWeight + decayWeight + sustainWeight + releaseWeight;
  const plotWidth = right - left;
  const attackX = left + plotWidth * attackWeight / weightTotal;
  const decayX = attackX + plotWidth * decayWeight / weightTotal;
  const sustainX = decayX + plotWidth * sustainWeight / weightTotal;
  const sustainY = bottom - envelope.sustainLevel * (bottom - top);
  const points = [
    ...sampleEnvelopeStage(
      left,
      attackX,
      bottom,
      top,
      envelope.curve,
    ),
    ...sampleEnvelopeStage(
      attackX,
      decayX,
      top,
      sustainY,
      envelope.curve,
    ).slice(1),
    [sustainX, sustainY] as const,
    ...sampleEnvelopeStage(
      sustainX,
      right,
      sustainY,
      bottom,
      envelope.curve,
    ).slice(1),
  ];

  return {
    points: points
      .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" "),
    boundaries: [attackX, decayX, sustainX],
    nodes: [
      [left, bottom],
      [attackX, top],
      [decayX, sustainY],
      [sustainX, sustainY],
      [right, bottom],
    ],
  };
}

function envelopeStageWeight(seconds: number, maximumSeconds: number): number {
  const normalized = Math.max(0, Math.min(1, seconds / maximumSeconds));

  return 0.14 + Math.sqrt(normalized) * 0.2;
}

function sampleEnvelopeStage(
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  curve: number,
): ReadonlyArray<readonly [number, number]> {
  return Array.from({ length: 17 }, (_, index) => {
    const progress = index / 16;
    const shapedProgress = shapeEnvelopePreviewProgress(progress, curve);

    return [
      startX + (endX - startX) * progress,
      startY + (endY - startY) * shapedProgress,
    ] as const;
  });
}

function shapeEnvelopePreviewProgress(progress: number, curve: number): number {
  if (Math.abs(curve) < 0.000_001) {
    return progress;
  }

  const exponent = Math.abs(curve) * 5;

  if (curve < 0) {
    return Math.expm1(exponent * progress) / Math.expm1(exponent);
  }

  return -Math.expm1(-exponent * progress) / -Math.expm1(-exponent);
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
  const resolveValue = (nextPosition: number): number => scaled
    ? positionToValue(nextPosition, minimum, maximum, step, scale)
    : nextPosition;

  return (
    <label className="instrument-editor-parameter">
      <span>{label}</span>
      <Slider
        min={scaled ? 0 : minimum}
        max={scaled ? 1 : maximum}
        step={scaled ? EDITOR_CONSTANTS.parameterSliderPositionStep : step}
        value={position}
        onPreview={(nextPosition) => {
          onChange(resolveValue(nextPosition));
        }}
        onCommit={(nextPosition) => {
          const nextValue = resolveValue(nextPosition);

          if (nextValue !== value) {
            onChange(nextValue);
          }
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
