import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../config/program-constants";

export interface LongPressNameEditorProps {
  readonly entityId: string;
  readonly name: string;
  readonly maximumLength: number;
  readonly className: string;
  readonly onSelect: (entityId: string) => void;
  readonly onRename: (name: string) => void;
}

/** Touch-first name editor shared by ordered inspector entities. */
export function LongPressNameEditor({
  entityId,
  name,
  maximumLength,
  className,
  onSelect,
  onRename,
}: LongPressNameEditorProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const pointerIdRef = useRef(-1);
  const originXRef = useRef(0);
  const originYRef = useRef(0);
  const movedRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const [editing, setEditing] = useState(false);

  const cancelLongPress = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    pointerIdRef.current = -1;
  };

  useEffect(() => {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    if (editing) {
      input.focus();
      input.select();
    } else {
      input.value = name;
    }
  }, [editing, name]);

  useEffect(() => cancelLongPress, []);

  return (
    <input
      ref={inputRef}
      className={className}
      type="text"
      defaultValue={name}
      maxLength={maximumLength}
      readOnly={!editing}
      tabIndex={editing ? 0 : -1}
      aria-label={`Name for ${name}`}
      title="Press and hold to rename"
      onPointerDown={(event) => {
        event.stopPropagation();

        if (editing) {
          return;
        }

        cancelLongPress();
        movedRef.current = false;
        longPressTriggeredRef.current = false;
        pointerIdRef.current = event.pointerId;
        originXRef.current = event.clientX;
        originYRef.current = event.clientY;

        timerRef.current = window.setTimeout(
          () => {
            cancelLongPress();
            longPressTriggeredRef.current = true;
            setEditing(true);
          },
          INTERACTION_CONSTANTS.voiceNameLongPressDelayMs,
        );
      }}
      onPointerMove={(event) => {
        event.stopPropagation();

        if (
          event.pointerId === pointerIdRef.current
          && (
            Math.abs(event.clientX - originXRef.current)
              > INTERACTION_CONSTANTS.voiceNameLongPressMovementToleranceCssPixels
            || Math.abs(event.clientY - originYRef.current)
              > INTERACTION_CONSTANTS.voiceNameLongPressMovementToleranceCssPixels
          )
        ) {
          movedRef.current = true;
          cancelLongPress();
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        cancelLongPress();
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        movedRef.current = true;
        cancelLongPress();
      }}
      onClick={(event) => {
        event.stopPropagation();

        if (editing) {
          return;
        }

        event.preventDefault();

        if (longPressTriggeredRef.current || movedRef.current) {
          longPressTriggeredRef.current = false;
          movedRef.current = false;
          return;
        }

        onSelect(entityId);
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

        const nextName = event.currentTarget.value.trim();

        if (nextName.length === 0) {
          event.currentTarget.value = name;
        } else if (nextName !== name) {
          onRename(nextName);
        }

        longPressTriggeredRef.current = false;
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
