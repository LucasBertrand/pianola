import React from "react";
import type {
  InstrumentPreset,
  PresetId,
} from "../../domain/model";

export interface InstrumentPresetDialogProps {
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
  readonly selectedPresetId: PresetId;
  readonly onSelectionChange: (presetId: PresetId) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Collects the shared sound choice before a project instrument is created. */
export function InstrumentPresetDialog(
  props: InstrumentPresetDialogProps,
): React.JSX.Element {
  const {
    presetsById,
    presetOrder,
    selectedPresetId,
    onSelectionChange,
    onConfirm,
    onCancel,
  } = props;
  const selectedPreset = presetsById[selectedPresetId];

  return (
    <div className="application-dialog-backdrop">
      <section
        className="application-dialog instrument-preset-dialog"
        data-tone="default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instrument-preset-dialog-title"
        aria-describedby="instrument-preset-dialog-message"
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">
            +
          </span>
          <h2 id="instrument-preset-dialog-title">
            Add instrument
          </h2>
        </div>
        <p id="instrument-preset-dialog-message">
          Choose the sound shared by this instrument in every clip.
        </p>
        <label className="instrument-preset-dialog-control">
          <span>Preset</span>
          <select
            value={selectedPresetId}
            autoFocus
            onChange={(event) => {
              onSelectionChange(event.currentTarget.value);
            }}
          >
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
        {selectedPreset === undefined ? null : (
          <PresetSummary preset={selectedPreset} />
        )}
        <div className="application-dialog-actions">
          <button
            className="application-dialog-button is-secondary"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="application-dialog-button is-primary"
            type="button"
            disabled={selectedPreset === undefined}
            onClick={onConfirm}
          >
            Add instrument
          </button>
        </div>
      </section>
    </div>
  );
}

interface PresetSummaryProps {
  readonly preset: InstrumentPreset;
}

function PresetSummary({ preset }: PresetSummaryProps): React.JSX.Element {
  switch (preset.kind) {
    case "subtractive":
      return (
        <dl className="instrument-preset-dialog-summary">
          <div>
            <dt>Engine</dt>
            <dd>Subtractive</dd>
          </div>
          <div>
            <dt>Wave</dt>
            <dd>{preset.config.oscillatorWaveform}</dd>
          </div>
          <div>
            <dt>Polyphony</dt>
            <dd>{preset.config.polyphony}</dd>
          </div>
        </dl>
      );
  }
}
