import React, {
  useEffect,
  useRef,
} from "react";
import {
  EDITOR_CONSTANTS,
  VOICE_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_VOICE_NAME_LENGTH,
  type Voice,
  type VoiceId,
} from "../../domain/model";
import {
  LongPressNameEditor,
} from "./LongPressNameEditor";

export interface VoiceNameEditorProps {
  readonly voice: Voice;
  readonly onSelect: (voiceId: VoiceId) => void;
  readonly onRename: (name: string) => void;
}

export function VoiceNameEditor(
  props: VoiceNameEditorProps,
): React.JSX.Element {
  const {
    voice,
    onSelect,
    onRename,
  } = props;
  return (
    <LongPressNameEditor
      entityId={voice.id}
      name={voice.name}
      maximumLength={MAXIMUM_VOICE_NAME_LENGTH}
      className="voice-name-input"
      onSelect={(voiceId) => onSelect(voiceId)}
      onRename={(name) => {
        onRename(name);
      }}
    />
  );
}

export interface VoiceGainSliderProps {
  readonly gain: number;
  readonly voiceName: string;
  readonly onPreview: (gain: number) => void;
  readonly onCommit: (gain: number) => void;
}

export function VoiceGainSlider(
  props: VoiceGainSliderProps,
): React.JSX.Element {
  const {
    gain,
    voiceName,
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
      className="voice-gain-control"
      title={`Volume for ${voiceName}`}
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
        min={VOICE_CONSTANTS.minimumGain}
        max={VOICE_CONSTANTS.maximumGain}
        step={EDITOR_CONSTANTS.gainStep}
        defaultValue={gain}
        aria-label={`Volume for ${voiceName}`}
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
