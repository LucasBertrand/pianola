import React, {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import type {
  ViewportState,
} from "../geometry/converter";
import {
  PianoRollLayers,
} from "../ui/components/PianoRollLayers";
import type {
  ReadonlyRenderSignal,
} from "../ui/rendering/render-signal";
import {
  calculateVisibleRegion,
  createDemoScene,
  DEMO_NOTE_COUNT,
  DEMO_TOTAL_TICKS,
  DEMO_VOICES,
  INITIAL_MAX_VISIBLE_PITCH,
  INITIAL_PITCH_HEIGHT,
  type DemoScene,
} from "./demo-scene";

interface ViewportDimensions {
  width: number;
  height: number;
}

const PIANO_KEYS = createPianoKeys();
const ACTIVE_VOICE_ID = "voice-atlas";

export function App(): React.JSX.Element {
  const sceneRef = useRef<DemoScene | null>(null);
  const appShellRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchScrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchZoomInputRef = useRef<HTMLInputElement | null>(null);
  const zoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const pitchZoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const barLabelRef = useRef<HTMLOutputElement | null>(null);
  const noteCountLabelRef = useRef<HTMLSpanElement | null>(null);
  const dimensionsRef = useRef<ViewportDimensions>({
    width: 1_600,
    height: 900,
  });

  if (sceneRef.current === null) {
    sceneRef.current = createDemoScene();
  }

  const scene = sceneRef.current;

  const publishViewport = useCallback(
    (viewport: ViewportState): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      currentScene.viewport.set(viewport);
      currentScene.visibleRegion.set(
        calculateVisibleRegion(
          viewport,
          dimensionsRef.current.width,
          dimensionsRef.current.height,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const stage = stageRef.current;

    if (stage === null) {
      return undefined;
    }

    const updateDimensions = (
      width: number,
      height: number,
    ): void => {
      dimensionsRef.current.width = width;
      dimensionsRef.current.height = height;

      const currentScene = sceneRef.current;

      if (currentScene !== null) {
        currentScene.visibleRegion.set(
          calculateVisibleRegion(
            currentScene.viewport.get(),
            width,
            height,
          ),
        );

        if (pitchScrollInputRef.current !== null) {
          pitchScrollInputRef.current.max = String(
            getMaximumVerticalScroll(
              currentScene.viewport.get(),
              height,
            ),
          );
        }
      }
    };
    const bounds = stage.getBoundingClientRect();
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry !== undefined) {
        updateDimensions(
          entry.contentRect.width,
          entry.contentRect.height,
        );
      }
    });

    updateDimensions(bounds.width, bounds.height);
    resizeObserver.observe(stage);

    return (): void => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const updateProjectStatus = (): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const state = currentScene.projectStore.getState();
      const noteCount = countProjectNotes(state);

      if (noteCountLabelRef.current !== null) {
        noteCountLabelRef.current.textContent =
          `${noteCount.toLocaleString()} indexed notes`;
      }

      if (appShellRef.current !== null) {
        appShellRef.current.dataset["projectRevision"] =
          String(state.revision);
      }
    };
    const unsubscribe = scene.projectStore.subscribe(
      updateProjectStatus,
    );

    updateProjectStatus();
    return unsubscribe;
  }, [scene]);

  const handleZoomChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const zoomX = event.currentTarget.valueAsNumber;
      const viewport = currentScene.viewport.get();

      publishViewport({
        ...viewport,
        zoomX,
      });

      if (zoomLabelRef.current !== null) {
        zoomLabelRef.current.value = `${Math.round(zoomX * 100)}%`;
      }
    },
    [publishViewport],
  );

  const handleScrollChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const scrollX = event.currentTarget.valueAsNumber;
      const viewport = currentScene.viewport.get();

      publishViewport({
        ...viewport,
        scrollX,
      });

      if (barLabelRef.current !== null) {
        const tick =
          scrollX * viewport.ticksPerPixel / viewport.zoomX;
        barLabelRef.current.value =
          `Bar ${Math.floor(tick / (960 * 4)) + 1}`;
      }
    },
    [publishViewport],
  );

  const handlePitchScrollChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const maximumScroll = getMaximumVerticalScroll(
        viewport,
        dimensionsRef.current.height,
      );

      publishViewport({
        ...viewport,
        scrollY: Math.min(
          maximumScroll,
          Math.max(0, event.currentTarget.valueAsNumber),
        ),
      });
    },
    [publishViewport],
  );

  const handlePitchZoomChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const zoomY = event.currentTarget.valueAsNumber;
      const viewport = currentScene.viewport.get();
      const viewportHeight = dimensionsRef.current.height;
      const currentPitchHeight =
        viewport.pitchHeight * viewport.zoomY;
      const nextPitchHeight = viewport.pitchHeight * zoomY;
      const centerRow =
        (viewport.scrollY + viewportHeight / 2)
        / currentPitchHeight;
      const maximumScroll = Math.max(
        0,
        128 * nextPitchHeight - viewportHeight,
      );
      const scrollY = Math.min(
        maximumScroll,
        Math.max(
          0,
          centerRow * nextPitchHeight - viewportHeight / 2,
        ),
      );

      publishViewport({
        ...viewport,
        zoomY,
        scrollY,
      });

      if (pitchScrollInputRef.current !== null) {
        pitchScrollInputRef.current.max = String(maximumScroll);
        pitchScrollInputRef.current.value = String(scrollY);
      }

      if (pitchZoomLabelRef.current !== null) {
        pitchZoomLabelRef.current.value =
          `${Math.round(zoomY * 100)}%`;
      }
    },
    [publishViewport],
  );

  const handleResetView = useCallback((): void => {
    const currentScene = sceneRef.current;

    if (currentScene === null) {
      return;
    }

    const viewport: ViewportState = {
      ...currentScene.viewport.get(),
      zoomX: 1,
      zoomY: 1,
      scrollX: 0,
      scrollY:
        (127 - INITIAL_MAX_VISIBLE_PITCH)
        * INITIAL_PITCH_HEIGHT,
    };

    publishViewport(viewport);

    if (zoomInputRef.current !== null) {
      zoomInputRef.current.value = "1";
    }

    if (scrollInputRef.current !== null) {
      scrollInputRef.current.value = "0";
    }

    if (pitchScrollInputRef.current !== null) {
      pitchScrollInputRef.current.value = String(
        viewport.scrollY,
      );
      pitchScrollInputRef.current.max = String(
        getMaximumVerticalScroll(
          viewport,
          dimensionsRef.current.height,
        ),
      );
    }

    if (pitchZoomInputRef.current !== null) {
      pitchZoomInputRef.current.value = "1";
    }

    if (zoomLabelRef.current !== null) {
      zoomLabelRef.current.value = "100%";
    }

    if (barLabelRef.current !== null) {
      barLabelRef.current.value = "Bar 1";
    }

    if (pitchZoomLabelRef.current !== null) {
      pitchZoomLabelRef.current.value = "100%";
    }
  }, [publishViewport]);

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      data-project-revision="0"
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Piano Lab</strong>
            <small>Untitled exploration</small>
          </div>
        </div>

        <div className="transport-cluster" aria-label="Transport preview">
          <button
            className="icon-button"
            type="button"
            title="Return to start"
          >
            <span aria-hidden="true">↤</span>
          </button>
          <button
            className="play-button"
            type="button"
            title="Audio engine arrives in Phase 5"
          >
            <span aria-hidden="true">▶</span>
          </button>
          <button
            className="icon-button"
            type="button"
            title="Stop"
          >
            <span className="stop-icon" aria-hidden="true" />
          </button>
        </div>

        <div className="transport-metrics">
          <div className="metric">
            <small>Tempo</small>
            <strong>112.0</strong>
            <span>BPM</span>
          </div>
          <div className="metric">
            <small>Meter</small>
            <strong>4 / 4</strong>
          </div>
          <div className="metric">
            <small>Grid</small>
            <strong>1 / 16</strong>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="engine-status">
            <i />
            Canvas ready
          </span>
          <button className="secondary-button" type="button">
            Export
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="editor-panel">
          <div className="editor-toolbar">
            <div className="tool-group">
              <button className="tool-button is-active" type="button">
                Pointer
              </button>
              <button className="tool-button" type="button">
                Draw
              </button>
              <button className="tool-button" type="button">
                Select
              </button>
            </div>
            <div className="project-summary">
              <span>
                <i className="summary-dot" />
                <span ref={noteCountLabelRef}>
                  {DEMO_NOTE_COUNT.toLocaleString()} indexed notes
                </span>
              </span>
              <span>960 PPQN</span>
            </div>
          </div>

          <div className="roll-frame">
            <PianoKeyboard viewport={scene.viewport} />
            <div ref={stageRef} className="roll-stage">
              <div className="bar-ruler" aria-hidden="true">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
              <div className="canvas-host">
                <PianoRollLayers
                  viewport={scene.viewport}
                  visibleRegion={scene.visibleRegion}
                  spatialIndex={scene.spatialIndex}
                  voiceStyles={scene.voiceStyles}
                  playheadTick={scene.playheadTick}
                  projectStore={scene.projectStore}
                  activeVoiceId={ACTIVE_VOICE_ID}
                  gridResolutionTicks={240}
                />
              </div>
            </div>
          </div>

          <div className="view-controls">
            <output ref={barLabelRef}>Bar 1</output>
            <input
              ref={scrollInputRef}
              className="timeline-range"
              type="range"
              min="0"
              max={Math.floor(DEMO_TOTAL_TICKS / 5)}
              step="48"
              defaultValue="0"
              onChange={handleScrollChange}
              aria-label="Horizontal timeline position"
            />
            <div className="zoom-control">
              <span aria-hidden="true">−</span>
              <input
                ref={zoomInputRef}
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                defaultValue="1"
                onChange={handleZoomChange}
                aria-label="Horizontal zoom"
              />
              <span aria-hidden="true">+</span>
              <output ref={zoomLabelRef}>100%</output>
            </div>
            <div className="pitch-control">
              <span>Pitch</span>
              <input
                ref={pitchScrollInputRef}
                className="pitch-scroll-range"
                type="range"
                min="0"
                max="1404"
                step="4"
                defaultValue={String(
                  (127 - INITIAL_MAX_VISIBLE_PITCH)
                  * INITIAL_PITCH_HEIGHT,
                )}
                onChange={handlePitchScrollChange}
                aria-label="Vertical pitch position"
              />
              <span>Y</span>
              <input
                ref={pitchZoomInputRef}
                className="pitch-zoom-range"
                type="range"
                min="0.6"
                max="2.2"
                step="0.05"
                defaultValue="1"
                onChange={handlePitchZoomChange}
                aria-label="Vertical pitch zoom"
              />
              <output ref={pitchZoomLabelRef}>100%</output>
            </div>
            <button
              className="reset-button"
              type="button"
              onClick={handleResetView}
            >
              Reset view
            </button>
          </div>
        </div>

        <aside className="inspector">
          <div className="inspector-heading">
            <div>
              <small>Arrangement</small>
              <h1>Voices</h1>
            </div>
            <button className="add-button" type="button" aria-label="Add voice">
              +
            </button>
          </div>

          <div className="voice-list">
            {DEMO_VOICES.map((voice, index) => (
              <article
                className={`voice-card${index === 0 ? " is-selected" : ""}`}
                key={voice.id}
                style={{
                  "--voice-color": voice.color,
                } as React.CSSProperties}
              >
                <div className="voice-color" />
                <div className="voice-copy">
                  <strong>{voice.name}</strong>
                  <span>{voice.role}</span>
                </div>
                <div className="voice-wave">{voice.waveform}</div>
                <button type="button" aria-label={`Mute ${voice.name}`}>
                  M
                </button>
              </article>
            ))}
          </div>

          <section className="instrument-card">
            <div className="section-title">
              <div>
                <small>Instrument</small>
                <strong>Subtractive</strong>
              </div>
              <span className="live-pill">Live</span>
            </div>

            <div className="wave-display" aria-hidden="true">
              <svg viewBox="0 0 240 54" preserveAspectRatio="none">
                <path d="M0 27 L18 27 L28 8 L42 46 L56 14 L70 40 L84 20 L98 34 L112 24 L126 30 L140 25 L154 29 L168 26 L182 28 L196 27 L240 27" />
              </svg>
            </div>

            <div className="parameter-grid">
              <ParameterDial label="Attack" value="12 ms" level="22%" />
              <ParameterDial label="Decay" value="180 ms" level="42%" />
              <ParameterDial label="Sustain" value="72%" level="72%" />
              <ParameterDial label="Release" value="420 ms" level="58%" />
            </div>
          </section>

          <section className="routing-card">
            <div className="section-title">
              <div>
                <small>Output</small>
                <strong>Master bus</strong>
              </div>
              <span>−3.2 dB</span>
            </div>
            <div className="meter">
              <span style={{ width: "68%" }} />
            </div>
          </section>

          <div className="phase-notice">
            <span>04</span>
            <div>
              <strong>Interaction system</strong>
              <p>Draft gestures are active. Audio scheduling is next.</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

interface PianoKeyboardProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
}

function PianoKeyboard(
  props: PianoKeyboardProps,
): React.JSX.Element {
  const {
    viewport,
  } = props;
  const keysElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateKeyboard = (): void => {
      const element = keysElementRef.current;

      if (element === null) {
        return;
      }

      const currentViewport = viewport.get();
      const rowHeight =
        currentViewport.pitchHeight * currentViewport.zoomY;

      element.style.setProperty(
        "--pitch-row-height",
        `${rowHeight}px`,
      );
      element.style.transform =
        `translate3d(0, ${-currentViewport.scrollY}px, 0)`;
    };
    const unsubscribe = viewport.subscribe(updateKeyboard);

    updateKeyboard();
    return unsubscribe;
  }, [viewport]);

  return (
    <div className="piano-strip" aria-hidden="true">
      <div ref={keysElementRef} className="piano-keys-inner">
        {PIANO_KEYS}
      </div>
    </div>
  );
}

interface ParameterDialProps {
  readonly label: string;
  readonly value: string;
  readonly level: string;
}

function ParameterDial(props: ParameterDialProps): React.JSX.Element {
  const {
    label,
    value,
    level,
  } = props;

  return (
    <div className="parameter">
      <div
        className="parameter-track"
        style={{
          "--parameter-level": level,
        } as React.CSSProperties}
      >
        <i />
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function createPianoKeys(): readonly React.JSX.Element[] {
  const keys: React.JSX.Element[] = [];

  for (
    let pitch = 127;
    pitch >= 0;
    pitch -= 1
  ) {
    const pitchClass = pitch % 12;
    const black =
      pitchClass === 1
      || pitchClass === 3
      || pitchClass === 6
      || pitchClass === 8
      || pitchClass === 10;
    const octave = Math.floor(pitch / 12) - 1;
    const label = pitchClass === 0 ? `C${octave}` : "";

    keys.push(
      <div
        className={`piano-key${black ? " is-black" : ""}`}
        key={pitch}
      >
        {label}
      </div>,
    );
  }

  return keys;
}

function getMaximumVerticalScroll(
  viewport: ViewportState,
  viewportHeight: number,
): number {
  return Math.max(
    0,
    128 * viewport.pitchHeight * viewport.zoomY - viewportHeight,
  );
}

function countProjectNotes(
  state: ReturnType<DemoScene["projectStore"]["getState"]>,
): number {
  let count = 0;

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId !== undefined) {
      const track = state.tracksByVoiceId[voiceId];

      if (track !== undefined) {
        count += Object.keys(track.notesById).length;
      }
    }
  }

  return count;
}
