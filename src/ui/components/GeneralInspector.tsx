import React from "react";
import type {
  UpdateProjectInstrumentChanges,
} from "../../domain/commands";
import {
  getActiveClip,
  type AdsrEnvelope,
  type ClipId,
  type ClipInstrumentState,
  type OscillatorWaveform,
  type ProjectState,
  type SubtractiveSynthContinuousParameter,
  type ProjectInstrument,
  type InstrumentId,
} from "../../domain/model";
import {
  ClipInspector,
} from "./ClipInspector";
import {
  InstrumentInspector,
} from "./InstrumentInspector";
import {
  InstrumentGainSlider,
  InstrumentNameEditor,
} from "./ProjectInstrumentControls";

export interface GeneralInspectorProps {
  readonly open: boolean;
  readonly portraitSection: "instruments" | "clips";
  readonly projectState: ProjectState;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectedInstrumentIndex: number;
  readonly selectedInstrument: ProjectInstrument | undefined;
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
  readonly onUpdateProjectInstrument: (
    instrumentId: InstrumentId,
    changes: UpdateProjectInstrumentChanges,
    label: string,
  ) => void;
  readonly onInstrumentGainPreview: (
    instrumentId: InstrumentId,
    gain: number,
  ) => void;
  readonly onUpdateClipInstrumentState: (
    instrumentId: InstrumentId,
    changes: Partial<ClipInstrumentState>,
    label: string,
  ) => void;
  readonly onSelectInstrumentNotes: (instrumentId: InstrumentId) => void;
  readonly onToggleInstrumentLock: (instrument: ProjectInstrument) => void;
  readonly onDeleteProjectInstrument: (instrumentId: InstrumentId) => void;
  readonly onWaveformCommit: (
    instrumentId: InstrumentId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly onPolyphonyCommit: (
    instrumentId: InstrumentId,
    polyphony: number,
  ) => void;
  readonly onEnvelopeCommit: (
    instrumentId: InstrumentId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onEnvelopePreview: (
    instrumentId: InstrumentId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onInstrumentParameterCommit: (
    instrumentId: InstrumentId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
  readonly onInstrumentParameterPreview: (
    instrumentId: InstrumentId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
}

export function GeneralInspector({
  open,
  portraitSection,
  projectState,
  selectedInstrumentId,
  selectedInstrumentIndex,
  selectedInstrument,
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
  onUpdateProjectInstrument,
  onInstrumentGainPreview,
  onUpdateClipInstrumentState,
  onSelectInstrumentNotes,
  onToggleInstrumentLock,
  onDeleteProjectInstrument,
  onWaveformCommit,
  onPolyphonyCommit,
  onEnvelopeCommit,
  onEnvelopePreview,
  onInstrumentParameterCommit,
  onInstrumentParameterPreview,
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
        <h1>Instruments</h1>
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
            <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
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
            <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
          </svg>
        </button>
        <button
          className="add-button"
          type="button"
          aria-label="Add instrument"
          onClick={onAddProjectInstrument}
        >
          +
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
              }${instrumentState.muted ? " is-muted" : ""}${
                instrumentState.locked ? " is-locked" : ""
              }`
            }
            key={instrument.id}
            style={{
              "--instrument-color": instrument.color,
            } as React.CSSProperties}
            onClick={() => onInstrumentSelect(instrument.id)}
          >
            <label
              className="instrument-color-control"
              aria-label={`Color for ${instrument.name}`}
              title="Change instrument color"
            >
              <span className="instrument-color" />
              <input
                type="color"
                value={instrument.color}
                onChange={(event) => {
                  onUpdateProjectInstrument(
                    instrument.id,
                    {
                      color: event.currentTarget.value,
                    },
                    "Update instrument color",
                  );
                }}
              />
            </label>
            <div className="instrument-copy">
              <InstrumentNameEditor
                instrument={instrument}
                onSelect={onInstrumentSelect}
                onRename={(name) => {
                  onUpdateProjectInstrument(
                    instrument.id,
                    {
                      name,
                    },
                    "Rename instrument",
                  );
                }}
              />
            </div>
            <InstrumentGainSlider
              gain={instrumentState.gain}
              instrumentName={instrument.name}
              onPreview={(gain) => {
                onInstrumentGainPreview(instrument.id, gain);
              }}
              onCommit={(gain) => {
                onUpdateClipInstrumentState(
                  instrument.id,
                  {
                    gain,
                  },
                  "Update instrument volume",
                );
              }}
            />
            <div className="instrument-actions">
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
                  <rect
                    x="4"
                    y="8"
                    width="12"
                    height="9"
                    rx="2"
                  />
                </svg>
              </button>
              <button
                className={
                  instrumentState.muted
                    ? "instrument-mute-button is-active"
                    : "instrument-mute-button"
                }
                type="button"
                aria-label={`${instrumentState.muted ? "Unmute" : "Mute"} ${instrument.name}`}
                aria-pressed={instrumentState.muted}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateClipInstrumentState(
                    instrument.id,
                    {
                      muted: !instrumentState.muted,
                    },
                    instrumentState.muted ? "Unmute instrument" : "Mute instrument",
                  );
                }}
              >
                M
              </button>
              <button
                className={
                  instrumentState.solo
                    ? "instrument-solo-button is-active"
                    : "instrument-solo-button"
                }
                type="button"
                aria-label={`${instrumentState.solo ? "Disable solo for" : "Solo"} ${instrument.name}`}
                aria-pressed={instrumentState.solo}
                title={
                  instrumentState.solo
                    ? "Disable solo"
                    : "Solo instrument"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateClipInstrumentState(
                    instrument.id,
                    {
                      solo: !instrumentState.solo,
                    },
                    instrumentState.solo
                      ? "Disable instrument solo"
                      : "Solo instrument",
                  );
                }}
              >
                S
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
                ×
              </button>
            </div>
          </article>
        );
      })}
      {projectState.instrumentOrder.length === 0 ? (
        <p className="instrument-empty-state">
          Add a instrument to start drawing notes.
        </p>
      ) : null}
    </div>
    </div>

    <InstrumentInspector
      instrument={selectedInstrument}
      instrumentState={
        selectedInstrument === undefined
          ? undefined
          : activeClip.instrumentStatesById[selectedInstrument.id]
      }
      onWaveformCommit={onWaveformCommit}
      onPolyphonyCommit={onPolyphonyCommit}
      onEnvelopePreview={onEnvelopePreview}
      onEnvelopeCommit={onEnvelopeCommit}
      onInstrumentParameterPreview={onInstrumentParameterPreview}
      onInstrumentParameterCommit={onInstrumentParameterCommit}
    />
    </section>
    </div>
  </aside>
  );
}
