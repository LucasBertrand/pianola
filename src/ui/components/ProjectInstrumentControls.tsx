import React, {
  useEffect,
  useRef,
} from "react";
import {
  EDITOR_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  type ProjectInstrument,
  type InstrumentId,
} from "../../domain/model";
import {
  LongPressNameEditor,
} from "./LongPressNameEditor";

export interface InstrumentNameEditorProps {
  readonly instrument: ProjectInstrument;
  readonly onSelect: (instrumentId: InstrumentId) => void;
  readonly onRename: (name: string) => void;
}

export function InstrumentNameEditor(
  props: InstrumentNameEditorProps,
): React.JSX.Element {
  const {
    instrument,
    onSelect,
    onRename,
  } = props;
  return (
    <LongPressNameEditor
      entityId={instrument.id}
      name={instrument.name}
      maximumLength={MAXIMUM_INSTRUMENT_NAME_LENGTH}
      className="instrument-name-input"
      onSelect={(instrumentId) => onSelect(instrumentId)}
      onRename={(name) => {
        onRename(name);
      }}
    />
  );
}

export interface InstrumentGainSliderProps {
  readonly gain: number;
  readonly instrumentName: string;
  readonly onPreview: (gain: number) => void;
  readonly onCommit: (gain: number) => void;
}

export function InstrumentGainSlider(
  props: InstrumentGainSliderProps,
): React.JSX.Element {
  const {
    gain,
    instrumentName,
    onPreview,
    onCommit,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedGainRef = useRef(gain);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.value = String(gain);
    }

    lastCommittedGainRef.current = gain;
  }, [gain]);

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

  return (
    <label
      className="instrument-gain-control"
      title={`Volume for ${instrumentName}`}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <input
        ref={inputRef}
        type="range"
        min={INSTRUMENT_CONSTANTS.minimumGain}
        max={INSTRUMENT_CONSTANTS.maximumGain}
        step={EDITOR_CONSTANTS.gainStep}
        defaultValue={gain}
        aria-label={`Volume for ${instrumentName}`}
        onInput={(event) => {
          onPreview(Number(event.currentTarget.value));
        }}
        onPointerUp={commitGain}
        onPointerCancel={commitGain}
        onBlur={commitGain}
        onKeyUp={commitGain}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      />
    </label>
  );
}
