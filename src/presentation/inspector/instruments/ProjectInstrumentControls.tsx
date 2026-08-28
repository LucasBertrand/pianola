import React, {
  useEffect,
  useRef,
} from "react";
import {
  EDITOR_CONSTANTS,
} from "../../../editor-core/model/editor-constants";
import {
  INSTRUMENT_CONSTANTS,
} from "../../../domain/instruments/instrument-constants";
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
