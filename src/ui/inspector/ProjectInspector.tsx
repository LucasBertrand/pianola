import React from "react";
import type {
  UpdateProjectInstrumentChanges,
} from "../../domain/commands/command-types";
import {
  getActiveClip,
  type ProjectState,
} from "../../domain/project/project-document";
import {
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
  type ProjectInstrument,
} from "../../domain/instruments/instrument";
import {
  type ClipGroupId,
  type ClipId,
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ClipHierarchyNodeIdentity,
} from "../../domain/clips/clip-hierarchy";
import {
  ClipInspector,
} from "./clips/ClipInspector";
import {
  InstrumentGainSlider,
} from "./instruments/ProjectInstrumentControls";
import {
  useCardReorder,
} from "../shared/useCardReorder";
import type {
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import type {
  PlayheadPosition,
} from "../../editor/model/playhead-position";

export interface ProjectInspectorProps {
  readonly open: boolean;
  readonly portraitSection: "instruments" | "clips";
  readonly projectState: ProjectState;
  readonly playingClipId: ClipId | null;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly suppressClipSelectionHighlight: boolean;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectionAvailable: boolean;
  readonly setToolbarHost: (element: HTMLDivElement | null) => void;
  readonly onClipSelect: (clipId: ClipId) => void;
  readonly onToggleClipBypass: (clipId: ClipId) => void;
  readonly onToggleClipPlayback: (clipId: ClipId) => void;
  readonly onAddClip: (
    parentGroupId?: ClipGroupId | null,
    name?: string,
  ) => void;
  readonly onDuplicateClip: (clipId: ClipId) => void;
  readonly onDuplicateClipGroup: (groupId: ClipGroupId) => ClipGroupId | null;
  readonly onToggleClipGroupBypass: (groupId: ClipGroupId) => void;
  readonly onCreateClipGroup: (
    parentGroupId: ClipGroupId | null,
    name?: string,
    color?: string,
  ) => ClipGroupId | null;
  readonly onUpdateClipGroup: (
    groupId: ClipGroupId,
    changes: { readonly name: string; readonly color: string },
  ) => void;
  readonly onConcatenateClipGroup: (
    groupId: ClipGroupId,
    name: string,
  ) => ClipId | null;
  readonly onUngroupClips: (groupId: ClipGroupId) => void;
  readonly onDeleteClipGroup: (groupId: ClipGroupId) => void;
  readonly onMoveClipNode: (
    node: ClipHierarchyNodeIdentity,
    targetParentGroupId: ClipGroupId | null,
    targetIndex: number,
  ) => void;
  readonly onSelectClipNotes: (clipId: ClipId) => void;
  readonly onEditClip: (clipId: ClipId) => void;
  readonly onReorderInstrument: (
    instrumentId: InstrumentId,
    targetIndex: number,
  ) => void;
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

export function ProjectInspector({
  open,
  portraitSection,
  projectState,
  playingClipId,
  playheadPosition,
  suppressClipSelectionHighlight,
  selectedInstrumentId,
  selectionAvailable,
  setToolbarHost,
  onClipSelect,
  onToggleClipBypass,
  onToggleClipPlayback,
  onAddClip,
  onDuplicateClip,
  onDuplicateClipGroup,
  onToggleClipGroupBypass,
  onCreateClipGroup,
  onUpdateClipGroup,
  onConcatenateClipGroup,
  onUngroupClips,
  onDeleteClipGroup,
  onMoveClipNode,
  onSelectClipNotes,
  onEditClip,
  onReorderInstrument,
  onAddProjectInstrument,
  onInstrumentSelect,
  onEditProjectInstrument,
  onUpdateProjectInstrument,
  onInstrumentGainPreview,
  onSelectInstrumentNotes,
  onTransferSelectionToInstrument,
  onToggleInstrumentLock,
}: ProjectInspectorProps): React.JSX.Element {
  const activeClip = getActiveClip(projectState);
  const instrumentReorder = useCardReorder(
    projectState.instrumentOrder,
    onReorderInstrument,
  );

  return (
    <aside
      id="project-inspector"
      className={
        `project-inspector is-${portraitSection}-panel${open ? " is-open" : ""
        }`
      }
    >
      <div
        ref={setToolbarHost}
        className="project-inspector-toolbar-host"
      />
      <div className="project-inspector-scroll-content">
        <section className="instrument-inspector-section">
          <div className="instrument-management-panel">
            <div className="instrument-list">
              {projectState.instrumentOrder.map((instrumentId, instrumentIndex) => {
                const instrument = projectState.projectInstrumentsById[instrumentId];
                const instrumentState = activeClip.instrumentStatesById[instrumentId];

                if (instrument === undefined || instrumentState === undefined) {
                  return null;
                }

                return (
                  <article
                    className={
                      `project-instrument-card${instrument.id === selectedInstrumentId
                        ? " is-selected"
                        : ""
                      }${instrument.muted ? " is-muted" : ""}${instrumentState.locked ? " is-locked" : ""
                      }`
                    }
                    key={instrument.id}
                    data-reorder-index={instrumentIndex}
                    style={{
                      "--instrument-color": instrument.color,
                    } as React.CSSProperties}
                    onClickCapture={() => onInstrumentSelect(instrument.id)}
                  >
                    <button
                      className="instrument-reorder-handle reorder-handle"
                      type="button"
                      aria-label={`Move ${instrument.name}`}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        const direction =
                          event.key === "ArrowUp"
                            ? -1
                            : event.key === "ArrowDown"
                              ? 1
                              : 0;

                        if (direction !== 0) {
                          event.preventDefault();
                          onReorderInstrument(
                            instrument.id,
                            instrumentIndex + direction,
                          );
                        }
                      }}
                      onPointerDown={(event) => {
                        instrumentReorder.begin(instrument.id, event);
                      }}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <circle cx="7" cy="6" r="1" />
                        <circle cx="13" cy="6" r="1" />
                        <circle cx="7" cy="10" r="1" />
                        <circle cx="13" cy="10" r="1" />
                        <circle cx="7" cy="14" r="1" />
                        <circle cx="13" cy="14" r="1" />
                      </svg>
                    </button>
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
                          <circle cx="10" cy="10" r="3" />
                          <path d="M8.3 2.5h3.4l.5 2a6 6 0 0 1 1.3.8l2-.6 1.7 3-1.5 1.4a6 6 0 0 1 0 1.8l1.5 1.4-1.7 3-2-.6a6 6 0 0 1-1.3.8l-.5 2H8.3l-.5-2a6 6 0 0 1-1.3-.8l-2 .6-1.7-3 1.5-1.4a6 6 0 0 1 0-1.8L2.8 7.7l1.7-3 2 .6a6 6 0 0 1 1.3-.8Z" />
                        </svg>
                      </button>
                    </div>
                  </article>
                );
              })}
              <button
                className="add-card"
                type="button"
                aria-label="Add instrument"
                disabled={
                  projectState.instrumentOrder.length >= MAXIMUM_PROJECT_INSTRUMENT_COUNT
                }
                onClick={onAddProjectInstrument}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 4v12M4 10h12" />
                </svg>
                <span>Add instrument</span>
              </button>
            </div>
          </div>

        </section>
        <ClipInspector
          projectState={projectState}
          playingClipId={playingClipId}
          playheadPosition={playheadPosition}
          suppressSelectionHighlight={suppressClipSelectionHighlight}
          onSelect={onClipSelect}
          onToggleBypass={onToggleClipBypass}
          onTogglePlayback={onToggleClipPlayback}
          onAdd={onAddClip}
          onDuplicate={onDuplicateClip}
          onDuplicateGroup={onDuplicateClipGroup}
          onToggleGroupBypass={onToggleClipGroupBypass}
          onCreateGroup={onCreateClipGroup}
          onUpdateGroup={onUpdateClipGroup}
          onConcatenateGroup={onConcatenateClipGroup}
          onUngroup={onUngroupClips}
          onDeleteGroup={onDeleteClipGroup}
          onMoveNode={onMoveClipNode}
          onSelectNotes={onSelectClipNotes}
          onEdit={onEditClip}
        />
      </div>
    </aside>
  );
}
