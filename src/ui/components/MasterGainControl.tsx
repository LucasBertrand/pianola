import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  EDITOR_CONSTANTS,
  PROJECT_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MINIMUM_MASTER_GAIN,
  MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
} from "../../domain/model";

export interface MasterGainControlProps {
  readonly gain: number;
  readonly muted: boolean;
  readonly tuningFrequencyHz: number;
  readonly onPreview: (gain: number) => void;
  readonly onCommit: (gain: number) => void;
  readonly onMuteToggle: () => void;
  readonly onTuningCommit: (tuningFrequencyHz: number) => void;
}

export function MasterGainControl(
  props: MasterGainControlProps,
): React.JSX.Element {
  const {
    gain,
    muted,
    tuningFrequencyHz,
    onPreview,
    onCommit,
    onMuteToggle,
    onTuningCommit,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLOutputElement | null>(null);
  const tuningInputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedGainRef = useRef(gain);

  const updateVisual = useCallback((nextGain: number): void => {
    if (outputRef.current !== null) {
      outputRef.current.value =
        formatMasterGainDecibels(nextGain);
    }

  }, []);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.value = String(gain);
    }

    lastCommittedGainRef.current = gain;
    updateVisual(gain);
  }, [
    gain,
    updateVisual,
  ]);

  useEffect(() => {
    if (tuningInputRef.current !== null) {
      tuningInputRef.current.value = formatMasterTuning(
        tuningFrequencyHz,
      );
    }
  }, [tuningFrequencyHz]);

  const commitGain = (): void => {
    const nextGain = Number(inputRef.current?.value);

    if (
      !Number.isFinite(nextGain)
      || nextGain === lastCommittedGainRef.current
    ) {
      return;
    }

    lastCommittedGainRef.current = nextGain;
    onCommit(nextGain);
  };
  const commitTuning = (): void => {
    const input = tuningInputRef.current;
    const parsedFrequencyHz = Number(input?.value);

    if (
      input === null
      || !Number.isFinite(parsedFrequencyHz)
      || parsedFrequencyHz < MINIMUM_MASTER_TUNING_FREQUENCY_HZ
      || parsedFrequencyHz > MAXIMUM_MASTER_TUNING_FREQUENCY_HZ
    ) {
      if (input !== null) {
        input.value = formatMasterTuning(tuningFrequencyHz);
      }
      return;
    }

    const nextFrequencyHz = Number(
      parsedFrequencyHz.toFixed(1),
    );

    input.value = formatMasterTuning(nextFrequencyHz);

    if (nextFrequencyHz !== tuningFrequencyHz) {
      onTuningCommit(nextFrequencyHz);
    }
  };

  return (
    <section
      className={
        muted
          ? "master-bus-control is-muted"
          : "master-bus-control"
      }
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div className="master-bus-heading">
        <small>Master</small>
        <output ref={outputRef}>
          {formatMasterGainDecibels(gain)}
        </output>
      </div>
      <div className="master-bus-controls">
        <label
          className="master-tuning-control"
          title="Master tuning frequency"
        >
          <input
            ref={tuningInputRef}
            type="number"
            min={MINIMUM_MASTER_TUNING_FREQUENCY_HZ}
            max={MAXIMUM_MASTER_TUNING_FREQUENCY_HZ}
            step={PROJECT_CONSTANTS.masterTuningStepHz}
            defaultValue={formatMasterTuning(
              tuningFrequencyHz,
            )}
            inputMode="decimal"
            aria-label="Master tuning frequency"
            onBlur={commitTuning}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          <span>Hz</span>
        </label>
        <input
          ref={inputRef}
          className="master-gain-input"
          type="range"
          min={MINIMUM_MASTER_GAIN}
          max={MAXIMUM_MASTER_GAIN}
          step={EDITOR_CONSTANTS.gainStep}
          defaultValue={gain}
          aria-label="Master gain"
          onInput={(event) => {
            const nextGain = Number(event.currentTarget.value);

            updateVisual(nextGain);
            onPreview(nextGain);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onPointerUp={commitGain}
          onPointerCancel={commitGain}
          onBlur={commitGain}
          onKeyUp={commitGain}
        />
        <button
          className="master-mute-button"
          type="button"
          aria-label={muted ? "Unmute master bus" : "Mute master bus"}
          aria-pressed={muted}
          title={muted ? "Unmute master bus" : "Mute master bus"}
          onClick={onMuteToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
            {muted ? (
              <path d="m16.5 9.5 4 5m0-5-4 5" />
            ) : (
              <path d="M16.5 9.5a4 4 0 0 1 0 5" />
            )}
          </svg>
        </button>
      </div>
    </section>
  );
}

function formatMasterGainDecibels(gain: number): string {
  if (gain <= 0) {
    return "−∞ dB";
  }

  return `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}

function formatMasterTuning(frequencyHz: number): string {
  return Number.isInteger(frequencyHz)
    ? frequencyHz.toFixed(0)
    : frequencyHz.toFixed(1);
}


