import React from "react";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
} from "../../domain/clips/clip";
import {
  MAXIMUM_CLIP_GROUP_NAME_LENGTH,
} from "../../domain/clips/clip-hierarchy";
import type {
  ClipGroupId,
} from "../../domain/identifiers";

export interface ClipParentOption {
  readonly id: ClipGroupId | null;
  readonly label: string;
}

export interface ClipHierarchyCreateDialogProps {
  readonly kind: "clip" | "group";
  readonly name: string;
  readonly color: string;
  readonly parentGroupId: ClipGroupId | null;
  readonly parentOptions: readonly ClipParentOption[];
  readonly onNameChange: (name: string) => void;
  readonly onColorChange: (color: string) => void;
  readonly onParentChange: (parentGroupId: ClipGroupId | null) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ClipHierarchyCreateDialog({
  kind,
  name,
  color,
  parentGroupId,
  parentOptions,
  onNameChange,
  onColorChange,
  onParentChange,
  onConfirm,
  onCancel,
}: ClipHierarchyCreateDialogProps): React.JSX.Element {
  const itemName = kind === "clip" ? "clip" : "group";

  return (
    <div className="application-dialog-backdrop instrument-editor-backdrop">
      <form
        className="application-dialog clip-hierarchy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-hierarchy-create-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">+</span>
          <h2 id="clip-hierarchy-create-dialog-title">Create {itemName}</h2>
        </div>

        <div className={kind === "group" ? "clip-editor-identity" : undefined}>
          {kind !== "group"
            ? null
            : (
                <label className="instrument-editor-color-control" title="Group color">
                  <span>Color</span>
                  <input
                    type="color"
                    value={color}
                    aria-label="Group color"
                    onChange={(event) => onColorChange(event.currentTarget.value)}
                  />
                </label>
              )}
          <label className="instrument-preset-dialog-control">
            <span>Name</span>
            <input
              type="text"
              value={name}
              maxLength={kind === "clip"
                ? MAXIMUM_CLIP_NAME_LENGTH
                : MAXIMUM_CLIP_GROUP_NAME_LENGTH}
              autoFocus
              autoComplete="off"
              onChange={(event) => onNameChange(event.currentTarget.value)}
            />
          </label>
        </div>

        <label className="instrument-preset-dialog-control">
          <span>Parent</span>
          <select
            value={parentGroupId ?? ""}
            onChange={(event) => {
              onParentChange(event.currentTarget.value || null);
            }}
          >
            {parentOptions.map((option) => (
              <option key={option.id ?? "root"} value={option.id ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="application-dialog-actions">
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
            disabled={name.trim().length === 0}
          >
            Create {itemName}
          </button>
        </div>
      </form>
    </div>
  );
}

export interface ClipGroupEditorDialogProps {
  readonly name: string;
  readonly color: string;
  readonly onNameChange: (name: string) => void;
  readonly onColorChange: (color: string) => void;
  readonly onConfirm: () => void;
  readonly onConcatenate: () => void;
  readonly canConcatenate: boolean;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
}

export function ClipGroupEditorDialog({
  name,
  color,
  onNameChange,
  onColorChange,
  onConfirm,
  onConcatenate,
  canConcatenate,
  onDelete,
  onCancel,
}: ClipGroupEditorDialogProps): React.JSX.Element {
  return (
    <div className="application-dialog-backdrop instrument-editor-backdrop">
      <form
        className="application-dialog clip-hierarchy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-group-editor-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">~</span>
          <h2 id="clip-group-editor-dialog-title">Edit group</h2>
        </div>

        <div className="clip-editor-identity">
          <label className="instrument-editor-color-control" title="Group color">
            <span>Color</span>
            <input
              type="color"
              value={color}
              aria-label="Group color"
              onChange={(event) => onColorChange(event.currentTarget.value)}
            />
          </label>
          <label className="instrument-preset-dialog-control">
            <span>Name</span>
            <input
              type="text"
              value={name}
              maxLength={MAXIMUM_CLIP_GROUP_NAME_LENGTH}
              autoFocus
              autoComplete="off"
              onChange={(event) => onNameChange(event.currentTarget.value)}
            />
          </label>
        </div>

        <div className="application-dialog-actions has-two-alternates">
          <button
            className="application-dialog-button is-danger"
            type="button"
            onClick={onDelete}
          >
            Delete group
          </button>
          <button
            className="application-dialog-button is-neutral"
            type="button"
            title="Replace this group with its descendant clips concatenated in playback order"
            disabled={!canConcatenate}
            onClick={onConcatenate}
          >
            Concatenate clips
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
            disabled={name.trim().length === 0}
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

export interface ClipGroupDeleteDialogProps {
  readonly groupName: string;
  readonly descendantClipCount: number;
  readonly canDeleteClips: boolean;
  readonly onKeepClips: () => void;
  readonly onDeleteClips: () => void;
  readonly onCancel: () => void;
}

export function ClipGroupDeleteDialog({
  groupName,
  descendantClipCount,
  canDeleteClips,
  onKeepClips,
  onDeleteClips,
  onCancel,
}: ClipGroupDeleteDialogProps): React.JSX.Element {
  const clipLabel = descendantClipCount === 1 ? "clip" : "clips";

  return (
    <div className="application-dialog-backdrop instrument-editor-backdrop">
      <section
        className="application-dialog clip-hierarchy-dialog"
        data-tone="danger"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clip-group-delete-dialog-title"
        aria-describedby="clip-group-delete-dialog-message"
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">!</span>
          <h2 id="clip-group-delete-dialog-title">Delete group?</h2>
        </div>

        <p id="clip-group-delete-dialog-message">
          Delete “{groupName}” and its {descendantClipCount} {clipLabel}, or keep
          its contents in the parent level?
        </p>
        {canDeleteClips ? null : (
          <p className="clip-group-delete-warning">
            The clips cannot be deleted because a project must keep at least one clip.
          </p>
        )}

        <div className="application-dialog-actions has-alternate">
          <button
            className="application-dialog-button is-neutral"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="application-dialog-button is-neutral"
            type="button"
            onClick={onKeepClips}
          >
            Keep clips
          </button>
          <button
            className="application-dialog-button is-danger"
            type="button"
            disabled={!canDeleteClips}
            onClick={onDeleteClips}
          >
            Delete group and clips
          </button>
        </div>
      </section>
    </div>
  );
}
