import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  EDITOR_CONSTANTS,
  INTERACTION_CONSTANTS,
  VOICE_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_VOICE_NAME_LENGTH,
  type Voice,
  type VoiceId,
} from "../../domain/model";

export interface VoiceNameEditorProps {
  readonly voice: Voice;
  readonly onSelect: (voiceId: VoiceId) => void;
  readonly onRename: (name: string) => void;
}

const VOICE_NAME_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.voiceNameLongPressDelayMs;
const VOICE_NAME_LONG_PRESS_MOVEMENT_TOLERANCE =
  INTERACTION_CONSTANTS.voiceNameLongPressMovementToleranceCssPixels;

export function VoiceNameEditor(
  props: VoiceNameEditorProps,
): React.JSX.Element {
  const {
    voice,
    onSelect,
    onRename,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointerIdRef = useRef(-1);
  const longPressOriginXRef = useRef(0);
  const longPressOriginYRef = useRef(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    if (editing) {
      input.focus();
      input.select();
    } else {
      input.value = voice.name;
    }
  }, [
    editing,
    voice.name,
  ]);

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
  }, []);

  const cancelLongPress = (): void => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressPointerIdRef.current = -1;
  };

  const beginEditing = (): void => {
    cancelLongPress();
    setEditing(true);
  };

  return (
    <input
      ref={inputRef}
      className="voice-name-input"
      type="text"
      defaultValue={voice.name}
      maxLength={MAXIMUM_VOICE_NAME_LENGTH}
      readOnly={!editing}
      tabIndex={editing ? 0 : -1}
      aria-label={`Name for ${voice.name}`}
      title="Press and hold to rename"
      onPointerDown={(event) => {
        event.stopPropagation();

        if (!editing) {
          event.preventDefault();
          onSelect(voice.id);
          cancelLongPress();
          longPressPointerIdRef.current = event.pointerId;
          longPressOriginXRef.current = event.clientX;
          longPressOriginYRef.current = event.clientY;

          if (
            !event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }

          longPressTimerRef.current = window.setTimeout(
            beginEditing,
            VOICE_NAME_LONG_PRESS_DELAY_MS,
          );
        }
      }}
      onPointerMove={(event) => {
        event.stopPropagation();

        if (
          event.pointerId === longPressPointerIdRef.current
          && (
            Math.abs(
              event.clientX - longPressOriginXRef.current,
            ) > VOICE_NAME_LONG_PRESS_MOVEMENT_TOLERANCE
            || Math.abs(
              event.clientY - longPressOriginYRef.current,
            ) > VOICE_NAME_LONG_PRESS_MOVEMENT_TOLERANCE
          )
        ) {
          cancelLongPress();
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        cancelLongPress();

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        cancelLongPress();
      }}
      onLostPointerCapture={cancelLongPress}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onBlur={(event) => {
        if (!editing) {
          return;
        }

        const name = event.currentTarget.value.trim();

        if (name.length === 0) {
          event.currentTarget.value = voice.name;
        } else if (name !== voice.name) {
          onRename(name);
        }

        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
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


