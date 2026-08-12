import React from "react";
import type {
  UpdateProjectInstrumentChanges,
} from "../../domain/commands";
import {
  getActiveClip,
  type ClipId,
  type ProjectState,
  type ProjectInstrument,
  type InstrumentId,
} from "../../domain/model";
import {
  ClipInspector,
} from "./ClipInspector";
import {
  InstrumentGainSlider,
} from "./ProjectInstrumentControls";

export interface GeneralInspectorProps {
  readonly open: boolean;
  readonly portraitSection: "instruments" | "clips";
  readonly projectState: ProjectState;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectedInstrumentIndex: number;
  readonly selectionAvailable: boolean;
  readonly setToolbarHost: (element: HTMLDivElement | null) => void;
  readonly onClose: () => void;
  readonly onClipSelect: (clipId: ClipId) => void;
  readonly onAddClip: () => void;
  readonly onDuplicateClip: (clipId: ClipId) => void;
  readonly onMoveActiveClip: (direction: -1 | 1) => void;
  readonly onDeleteClip: (clipId: ClipId) => void;
  readonly onRenameClip: (clipId: ClipId, name: string) => void;
  readonly onMoveSelectedInstrument: (direction: -1 | 1) => void;
  readonly onAddProjectInstrument: () => void;
  readonly onInstrumentSelect: (instrumentId: InstrumentId) => void;
  readonly onEditProjectInstrument: (instrumentId: InstrumentId) => void;
  readonly onUpdateProjectInstrument: (
    instrumentId: InstrumentId,
    changes: UpdateProjectInstrumentChanges,
    label: string,
  ) => void;
  readonly onInstrumentGainPreview: (
    instrumentId: InstrumentId,
    gain: number,
  ) => void;
  readonly onSelectInstrumentNotes: (instrumentId: InstrumentId) => void;
  readonly onTransferSelectionToInstrument: (
    instrumentId: InstrumentId,
  ) => void;
  readonly onToggleInstrumentLock: (instrument: ProjectInstrument) => void;
  readonly onDeleteProjectInstrument: (instrumentId: InstrumentId) => void;
}

export function GeneralInspector({
  open,
  portraitSection,
  projectState,
  selectedInstrumentId,
  selectedInstrumentIndex,
  selectionAvailable,
  setToolbarHost,
  onClose,
  onClipSelect,
  onAddClip,
  onDuplicateClip,
  onMoveActiveClip,
  onDeleteClip,
  onRenameClip,
  onMoveSelectedInstrument,
  onAddProjectInstrument,
  onInstrumentSelect,
  onEditProjectInstrument,
  onUpdateProjectInstrument,
  onInstrumentGainPreview,
  onSelectInstrumentNotes,
  onTransferSelectionToInstrument,
  onToggleInstrumentLock,
  onDeleteProjectInstrument,
}: GeneralInspectorProps): React.JSX.Element {
  const activeClip = getActiveClip(projectState);

  return (
  <aside
    id="general-inspector"
    className={
      `general-inspector is-${portraitSection}-panel${
        open ? " is-open" : ""
      }`
    }
  >
    <div
      ref={setToolbarHost}
      className="general-inspector-toolbar-host"
    />
    <div className="general-inspector-scroll-content">
    <ClipInspector
      projectState={projectState}
      onClose={onClose}
      onSelect={onClipSelect}
      onAdd={onAddClip}
      onDuplicate={onDuplicateClip}
      onMoveActive={onMoveActiveClip}
      onDelete={onDeleteClip}
      onRename={onRenameClip}
    />
    <section className="instrument-inspector-section">
    <div className="instrument-management-panel">
    <div className="general-inspector-heading">
      <div>
        <h1>INSTRUMENTS</h1>
      </div>
      <div className="general-inspector-heading-actions">
        <button
          className="instrument-order-button"
          type="button"
          aria-label="Move selected instrument up"
          title="Move selected instrument up"
          disabled={selectedInstrumentIndex <= 0}
          onClick={() => onMoveSelectedInstrument(-1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
            <path d="M10 13V7M7.5 9.5 10 7l2.5 2.5" />
          </svg>
        </button>
        <button
          className="instrument-order-button"
          type="button"
          aria-label="Move selected instrument down"
          title="Move selected instrument down"
          disabled={
            selectedInstrumentIndex < 0
            || selectedInstrumentIndex
              >= projectState.instrumentOrder.length - 1
          }
          onClick={() => onMoveSelectedInstrument(1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
            <path d="M10 7v6M7.5 10.5 10 13l2.5-2.5" />
          </svg>
        </button>
        <button
          className="add-button"
          type="button"
          aria-label="Add instrument"
          onClick={onAddProjectInstrument}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" />
            <path d="M10 6.5v7M6.5 10h7" />
          </svg>
        </button>
      </div>
    </div>

    <div className="instrument-list">
      {projectState.instrumentOrder.map((instrumentId) => {
        const instrument = projectState.projectInstrumentsById[instrumentId];
        const instrumentState = activeClip.instrumentStatesById[instrumentId];

        if (instrument === undefined || instrumentState === undefined) {
          return null;
        }

        return (
          <article
            className={
              `project-instrument-card${
                instrument.id === selectedInstrumentId
                  ? " is-selected"
                  : ""
              }${instrument.muted ? " is-muted" : ""}${
                instrumentState.locked ? " is-locked" : ""
              }`
            }
            key={instrument.id}
            style={{
              "--instrument-color": instrument.color,
            } as React.CSSProperties}
            onClickCapture={() => onInstrumentSelect(instrument.id)}
          >
            <span className="instrument-color-control" aria-hidden="true">
              <span className="instrument-color" />
            </span>
            <div className="instrument-copy instrument-identity">
              <strong className="instrument-name">{instrument.name}</strong>
              <div className="instrument-local-actions">
                <button
                  className="instrument-select-all-button"
                  type="button"
                  aria-label={`Select all notes from ${instrument.name}`}
                  title="Select all notes"
                  disabled={instrumentState.locked}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectInstrumentNotes(instrument.id);
                  }}
                >
                  <svg
                    className="instrument-select-all-icon"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="10" r="7" />
                    <circle cx="10" cy="10" r="3" />
                    <path d="M10 1v3M10 16v3M1 10h3M16 10h3" />
                  </svg>
                </button>
                <button
                  className="instrument-transfer-button"
                  type="button"
                  aria-label={`Move selected notes to ${instrument.name}`}
                  title="Move selected notes to this instrument"
                  disabled={!selectionAvailable || instrumentState.locked}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTransferSelectionToInstrument(instrument.id);
                  }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M3 6h7M3 10h7M3 14h7" />
                    <path d="M11.5 10H17M14.5 7.5 17 10l-2.5 2.5" />
                  </svg>
                </button>
                <button
                  className={
                    instrumentState.locked
                      ? "instrument-lock-button is-active"
                      : "instrument-lock-button"
                  }
                  type="button"
                  aria-label={`${instrumentState.locked ? "Unlock" : "Lock"} ${instrument.name}`}
                  aria-pressed={instrumentState.locked}
                  title={instrumentState.locked ? "Unlock instrument" : "Lock instrument"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleInstrumentLock(instrument);
                  }}
                >
                  <svg
                    className="instrument-lock-icon"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M6 8V6a4 4 0 0 1 8 0v2" />
                    <rect x="4" y="8" width="12" height="9" rx="2" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              className="instrument-sound-controls"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className={instrument.muted
                  ? "instrument-mute-button is-active"
                  : "instrument-mute-button"}
                type="button"
                aria-label={`${instrument.muted ? "Unmute" : "Mute"} ${instrument.name}`}
                aria-pressed={instrument.muted}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateProjectInstrument(
                    instrument.id,
                    { muted: !instrument.muted },
                    instrument.muted ? "Unmute instrument" : "Mute instrument",
                  );
                }}
              >
                M
              </button>
              <button
                className={instrument.solo
                  ? "instrument-solo-button is-active"
                  : "instrument-solo-button"}
                type="button"
                aria-label={`${instrument.solo ? "Disable solo for" : "Solo"} ${instrument.name}`}
                aria-pressed={instrument.solo}
                title={instrument.solo ? "Disable solo" : "Solo instrument"}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateProjectInstrument(
                    instrument.id,
                    { solo: !instrument.solo },
                    instrument.solo
                      ? "Disable instrument solo"
                      : "Solo instrument",
                  );
                }}
              >
                S
              </button>
              <InstrumentGainSlider
                gain={instrument.gain}
                instrumentName={instrument.name}
                onPreview={(gain) => {
                  onInstrumentGainPreview(instrument.id, gain);
                }}
                onCommit={(gain) => {
                  onUpdateProjectInstrument(
                    instrument.id,
                    {
                      gain,
                    },
                    "Update instrument volume",
                  );
                }}
              />
              <button
                className="instrument-settings-button"
                type="button"
                aria-label={`Edit ${instrument.name}`}
                title="Edit instrument"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditProjectInstrument(instrument.id);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 5h7M15 5h1M4 10h1M9 10h7M4 15h5M13 15h3" />
                  <circle cx="13" cy="5" r="2" />
                  <circle cx="7" cy="10" r="2" />
                  <circle cx="11" cy="15" r="2" />
                </svg>
              </button>
              <button
                className="instrument-delete-button"
                type="button"
                aria-label={`Delete ${instrument.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteProjectInstrument(instrument.id);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4.5 6h11M8 6l.5-2h3L12 6" />
                  <path d="m6 6 .7 10h6.6L14 6M8.5 9v4M11.5 9v4" />
                </svg>
              </button>
            </div>
          </article>
        );
      })}
      {projectState.instrumentOrder.length === 0 ? (
        <p className="instrument-empty-state">
          Add an instrument to start drawing notes.
        </p>
      ) : null}
    </div>
    </div>

    </section>
    </div>
  </aside>
  );
}
