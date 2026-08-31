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
import {
  Slider,
} from "../../slider/Slider";

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
  const lastCommittedGainRef = useRef(gain);

  useEffect(() => {
    lastCommittedGainRef.current = gain;
  }, [gain]);

  const commitGain = (nextGain: number): void => {
    if (nextGain === lastCommittedGainRef.current) {
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
      <Slider
        min={INSTRUMENT_CONSTANTS.minimumGain}
        max={INSTRUMENT_CONSTANTS.maximumGain}
        step={EDITOR_CONSTANTS.gainStep}
        value={gain}
        aria-label={`Volume for ${instrumentName}`}
        onPreview={onPreview}
        onCommit={commitGain}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      />
    </label>
  );
}
