import React from "react";
import type {
  UpdateVoiceChanges,
} from "../../domain/commands";
import type {
  AdsrEnvelope,
  OscillatorWaveform,
  ProjectState,
  Voice,
  VoiceId,
} from "../../domain/model";
import type {
  NoteColorMode,
} from "../rendering/note-style";
import {
  InstrumentInspector,
} from "./InstrumentInspector";
import {
  VoiceGainSlider,
  VoiceNameEditor,
} from "./VoiceControls";

export interface GeneralInspectorProps {
  readonly open: boolean;
  readonly projectState: ProjectState;
  readonly selectedVoiceId: VoiceId | null;
  readonly selectedVoiceIndex: number;
  readonly selectedVoice: Voice | undefined;
  readonly noteColorMode: NoteColorMode;
  readonly setToolbarHost: (element: HTMLDivElement | null) => void;
  readonly onClose: () => void;
  readonly onNoteColorModeToggle: () => void;
  readonly onMoveSelectedVoice: (direction: -1 | 1) => void;
  readonly onAddVoice: () => void;
  readonly onVoiceSelect: (voiceId: VoiceId) => void;
  readonly onUpdateVoice: (
    voiceId: VoiceId,
    changes: UpdateVoiceChanges,
    label: string,
  ) => void;
  readonly onVoiceGainPreview: (
    voiceId: VoiceId,
    gain: number,
  ) => void;
  readonly onSelectVoiceNotes: (voiceId: VoiceId) => void;
  readonly onToggleVoiceLock: (voice: Voice) => void;
  readonly onDeleteVoice: (voiceId: VoiceId) => void;
  readonly onWaveformCommit: (
    voiceId: VoiceId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly onPolyphonyCommit: (
    voiceId: VoiceId,
    polyphony: number,
  ) => void;
  readonly onEnvelopeCommit: (
    voiceId: VoiceId,
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
}

export function GeneralInspector({
  open,
  projectState,
  selectedVoiceId,
  selectedVoiceIndex,
  selectedVoice,
  noteColorMode,
  setToolbarHost,
  onClose,
  onNoteColorModeToggle,
  onMoveSelectedVoice,
  onAddVoice,
  onVoiceSelect,
  onUpdateVoice,
  onVoiceGainPreview,
  onSelectVoiceNotes,
  onToggleVoiceLock,
  onDeleteVoice,
  onWaveformCommit,
  onPolyphonyCommit,
  onEnvelopeCommit,
}: GeneralInspectorProps): React.JSX.Element {
  return (
  <aside
    id="general-inspector"
    className={
      `general-inspector${
        open ? " is-open" : ""
      }`
    }
  >
    <div
      ref={setToolbarHost}
      className="general-inspector-toolbar-host"
    />
    <div className="general-inspector-scroll-content">
    <div className="general-inspector-heading">
      <div>
        <small>Arrangement</small>
        <h1>Voices</h1>
      </div>
      <div className="general-inspector-heading-actions">
        <button
          className={
            `voice-order-button note-color-toggle${
              noteColorMode === "voice"
                ? " is-voice-mode"
                : ""
            }`
          }
          type="button"
          title={
            noteColorMode === "voice"
              ? "Use pitch colors"
              : "Use voice colors"
          }
          aria-label="Color notes by voice"
          aria-pressed={noteColorMode === "voice"}
          onClick={onNoteColorModeToggle}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" />
            <circle cx="6" cy="7" r="1" />
            <circle cx="9.5" cy="5" r="1" />
            <circle cx="13" cy="6.5" r="1" />
          </svg>
        </button>
        <button
          className="voice-order-button"
          type="button"
          aria-label="Move selected voice up"
          title="Move selected voice up"
          disabled={selectedVoiceIndex <= 0}
          onClick={() => onMoveSelectedVoice(-1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
          </svg>
        </button>
        <button
          className="voice-order-button"
          type="button"
          aria-label="Move selected voice down"
          title="Move selected voice down"
          disabled={
            selectedVoiceIndex < 0
            || selectedVoiceIndex
              >= projectState.voiceOrder.length - 1
          }
          onClick={() => onMoveSelectedVoice(1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
          </svg>
        </button>
        <button
          className="general-inspector-close-button"
          type="button"
          aria-label="Close voices"
          onClick={() => onClose()}
        >
          ×
        </button>
        <button
          className="add-button"
          type="button"
          aria-label="Add voice"
          onClick={onAddVoice}
        >
          +
        </button>
      </div>
    </div>

    <div className="voice-list">
      {projectState.voiceOrder.map((voiceId) => {
        const voice = projectState.voicesById[voiceId];

        if (voice === undefined) {
          return null;
        }

        return (
          <article
            className={
              `voice-card${
                voice.id === selectedVoiceId
                  ? " is-selected"
                  : ""
              }${voice.muted ? " is-muted" : ""}${
                voice.locked ? " is-locked" : ""
              }`
            }
            key={voice.id}
            style={{
              "--voice-color": voice.color,
            } as React.CSSProperties}
            onClick={() => onVoiceSelect(voice.id)}
          >
            <label
              className="voice-color-control"
              aria-label={`Color for ${voice.name}`}
              title="Change voice color"
            >
              <span className="voice-color" />
              <input
                type="color"
                value={voice.color}
                onChange={(event) => {
                  onUpdateVoice(
                    voice.id,
                    {
                      color: event.currentTarget.value,
                    },
                    "Update voice color",
                  );
                }}
              />
            </label>
            <div className="voice-copy">
              <VoiceNameEditor
                voice={voice}
                onSelect={onVoiceSelect}
                onRename={(name) => {
                  onUpdateVoice(
                    voice.id,
                    {
                      name,
                    },
                    "Rename voice",
                  );
                }}
              />
            </div>
            <VoiceGainSlider
              gain={voice.gain}
              voiceName={voice.name}
              onPreview={(gain) => {
                onVoiceGainPreview(voice.id, gain);
              }}
              onCommit={(gain) => {
                onUpdateVoice(
                  voice.id,
                  {
                    gain,
                  },
                  "Update voice volume",
                );
              }}
            />
            <div className="voice-actions">
              <button
                className="voice-select-all-button"
                type="button"
                aria-label={`Select all notes from ${voice.name}`}
                title="Select all notes"
                disabled={voice.locked}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectVoiceNotes(voice.id);
                }}
              >
                <svg
                  className="voice-select-all-icon"
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
                  voice.locked
                    ? "voice-lock-button is-active"
                    : "voice-lock-button"
                }
                type="button"
                aria-label={`${voice.locked ? "Unlock" : "Lock"} ${voice.name}`}
                aria-pressed={voice.locked}
                title={voice.locked ? "Unlock voice" : "Lock voice"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleVoiceLock(voice);
                }}
              >
                <svg
                  className="voice-lock-icon"
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
                  voice.muted
                    ? "voice-mute-button is-active"
                    : "voice-mute-button"
                }
                type="button"
                aria-label={`${voice.muted ? "Unmute" : "Mute"} ${voice.name}`}
                aria-pressed={voice.muted}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateVoice(
                    voice.id,
                    {
                      muted: !voice.muted,
                    },
                    voice.muted ? "Unmute voice" : "Mute voice",
                  );
                }}
              >
                M
              </button>
              <button
                className={
                  voice.solo
                    ? "voice-solo-button is-active"
                    : "voice-solo-button"
                }
                type="button"
                aria-label={`${voice.solo ? "Disable solo for" : "Solo"} ${voice.name}`}
                aria-pressed={voice.solo}
                title={
                  voice.solo
                    ? "Disable solo"
                    : "Solo voice"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateVoice(
                    voice.id,
                    {
                      solo: !voice.solo,
                    },
                    voice.solo
                      ? "Disable voice solo"
                      : "Solo voice",
                  );
                }}
              >
                S
              </button>
              <button
                className="voice-delete-button"
                type="button"
                aria-label={`Delete ${voice.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteVoice(voice.id);
                }}
              >
                ×
              </button>
            </div>
          </article>
        );
      })}
      {projectState.voiceOrder.length === 0 ? (
        <p className="voice-empty-state">
          Add a voice to start drawing notes.
        </p>
      ) : null}
    </div>

    <InstrumentInspector
      voice={selectedVoice}
      onWaveformCommit={onWaveformCommit}
      onPolyphonyCommit={onPolyphonyCommit}
      onEnvelopeCommit={onEnvelopeCommit}
    />
    </div>
  </aside>
  );
}

