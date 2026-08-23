import React from "react";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
} from "../../domain/clips/clip";

export interface ClipEditorDialogProps {
  readonly clipName: string;
  readonly clipColor: string;
  readonly canDelete: boolean;
  readonly onClipNameChange: (name: string) => void;
  readonly onClipColorChange: (color: string) => void;
  readonly onConfirm: () => void;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
}

/** Edits a clip identity draft without mutating the project. */
export function ClipEditorDialog({
  clipName,
  clipColor,
  canDelete,
  onClipNameChange,
  onClipColorChange,
  onConfirm,
  onDelete,
  onCancel,
}: ClipEditorDialogProps): React.JSX.Element {
  return (
    <div className="application-dialog-backdrop instrument-editor-backdrop">
      <form
        className="application-dialog clip-editor-dialog"
        data-tone="default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-editor-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">~</span>
          <h2 id="clip-editor-dialog-title">Edit clip</h2>
        </div>

        <div className="clip-editor-identity">
          <label
            className="instrument-editor-color-control"
            title="Clip color"
          >
            <span>Color</span>
            <input
              type="color"
              value={clipColor}
              aria-label="Clip color"
              onChange={(event) => {
                onClipColorChange(event.currentTarget.value);
              }}
            />
          </label>
          <label className="instrument-preset-dialog-control">
            <span>Name</span>
            <input
              type="text"
              value={clipName}
              maxLength={MAXIMUM_CLIP_NAME_LENGTH}
              autoFocus
              autoComplete="off"
              onChange={(event) => {
                onClipNameChange(event.currentTarget.value);
              }}
            />
          </label>
        </div>

        <div className="application-dialog-actions has-alternate">
          <button
            className="application-dialog-button is-danger"
            type="button"
            disabled={!canDelete}
            onClick={onDelete}
          >
            Delete clip
          </button>
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
            disabled={clipName.trim().length === 0}
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
