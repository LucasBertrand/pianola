import React from "react";
import type {
  UpdateVoiceChanges,
} from "../../domain/commands";
import {
  MAXIMUM_PROJECT_VOICE_COUNT,
  type AdsrEnvelope,
  type ClipId,
  type OscillatorWaveform,
  type ProjectState,
  type SubtractiveSynthContinuousParameter,
  type Voice,
  type VoiceId,
} from "../../domain/model";
import {
  ClipInspector,
} from "./ClipInspector";
import {
  InstrumentInspector,
} from "./InstrumentInspector";
import {
  VoiceGainSlider,
  VoiceNameEditor,
  SubtractivePolyphonySelect,
} from "./VoiceControls";

export interface GeneralInspectorProps {
  readonly open: boolean;
  readonly portraitSection: "voices" | "clips";
  readonly projectState: ProjectState;
  readonly selectedVoiceId: VoiceId | null;
  readonly selectedVoiceIndex: number;
  readonly selectedVoice: Voice | undefined;
  readonly setToolbarHost: (element: HTMLDivElement | null) => void;
  readonly onClose: () => void;
  readonly onClipSelect: (clipId: ClipId) => void;
  readonly onAddClip: () => void;
  readonly onDuplicateClip: (clipId: ClipId) => void;
  readonly onMoveActiveClip: (direction: -1 | 1) => void;
  readonly onDeleteClip: (clipId: ClipId) => void;
  readonly onRenameClip: (clipId: ClipId, name: string) => void;
  readonly onMoveSelectedVoice: (direction: -1 | 1) => void;
  readonly onAddVoice: () => void;
  readonly onDuplicateVoice: (voiceId: VoiceId) => void;
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
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onEnvelopePreview: (
    voiceId: VoiceId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly onInstrumentParameterCommit: (
    voiceId: VoiceId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
  readonly onInstrumentParameterPreview: (
    voiceId: VoiceId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
}

export function GeneralInspector({
  open,
  portraitSection,
  projectState,
  selectedVoiceId,
  selectedVoiceIndex,
  selectedVoice,
  setToolbarHost,
  onClose,
  onClipSelect,
  onAddClip,
  onDuplicateClip,
  onMoveActiveClip,
  onDeleteClip,
  onRenameClip,
  onMoveSelectedVoice,
  onAddVoice,
  onDuplicateVoice,
  onVoiceSelect,
  onUpdateVoice,
  onVoiceGainPreview,
  onSelectVoiceNotes,
  onToggleVoiceLock,
  onDeleteVoice,
  onWaveformCommit,
  onPolyphonyCommit,
  onEnvelopeCommit,
  onEnvelopePreview,
  onInstrumentParameterCommit,
  onInstrumentParameterPreview,
}: GeneralInspectorProps): React.JSX.Element {
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
    <section className="voice-inspector-section">
    <div className="general-inspector-heading">
      <div>
        <h1>Voices</h1>
      </div>
      <div className="general-inspector-heading-actions">
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
            <SubtractivePolyphonySelect
              value={voice.instrument.polyphony}
              voiceName={voice.name}
              onCommit={(polyphony) => {
                onPolyphonyCommit(
                  voice.id,
                  polyphony,
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
                className="voice-duplicate-button"
                type="button"
                aria-label={`Duplicate ${voice.name}`}
                title="Duplicate voice"
                disabled={
                  projectState.voiceOrder.length
                    >= MAXIMUM_PROJECT_VOICE_COUNT
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicateVoice(voice.id);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
                  <path d="M4 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V4" />
                </svg>
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
