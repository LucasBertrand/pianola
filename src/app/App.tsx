import React, {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import type {
  PianoRollCommand,
  Transaction,
} from "../domain/commands";
import type {
  TimeSignature,
  TransportState,
} from "../domain/model";
import type {
  ViewportState,
} from "../geometry/converter";
import {
  PianoRollLayers,
} from "../ui/components/PianoRollLayers";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "../ui/hooks/useCanvasRenderer";
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
const VIEW_INPUT_HORIZONTAL_SCROLL = 1;
const VIEW_INPUT_HORIZONTAL_ZOOM = 2;
const VIEW_INPUT_VERTICAL_SCROLL = 4;
const VIEW_INPUT_VERTICAL_ZOOM = 8;

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

        const viewport = currentScene.viewport.get();
        const maximumHorizontalScroll =
          getMaximumHorizontalScroll(viewport, width);
        const scrollX = Math.min(
          maximumHorizontalScroll,
          viewport.scrollX,
        );

        if (scrollInputRef.current !== null) {
          scrollInputRef.current.max = String(
            maximumHorizontalScroll,
          );
          scrollInputRef.current.value = String(scrollX);
          scrollInputRef.current.step = String(
            getHorizontalScrollStep(
              viewport,
              currentScene.gridResolutionTicks.get(),
            ),
          );
        }

        updateBarOutput(barLabelRef.current, {
          ...viewport,
          scrollX,
        }, getTicksPerBar(
          currentScene.projectStore.getState().transportSettings,
        ));

        if (scrollX !== viewport.scrollX) {
          publishViewport({
            ...viewport,
            scrollX,
          });
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
  }, [publishViewport]);

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

      updateBarOutput(
        barLabelRef.current,
        currentScene.viewport.get(),
        getTicksPerBar(state.transportSettings),
      );
    };
    const unsubscribe = scene.projectStore.subscribe(
      updateProjectStatus,
    );

    updateProjectStatus();
    return unsubscribe;
  }, [scene]);

  useEffect(() => {
    const syncViewportControls = (): void => {
      const viewport = scene.viewport.get();
      const maximumHorizontalScroll =
        getMaximumHorizontalScroll(
          viewport,
          dimensionsRef.current.width,
        );

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(
          maximumHorizontalScroll,
        );
        scrollInputRef.current.value = String(
          Math.min(maximumHorizontalScroll, viewport.scrollX),
        );
        scrollInputRef.current.step = String(
          getHorizontalScrollStep(
            viewport,
            scene.gridResolutionTicks.get(),
          ),
        );
      }

      if (zoomInputRef.current !== null) {
        zoomInputRef.current.value = String(viewport.zoomX);
      }

      if (pitchScrollInputRef.current !== null) {
        pitchScrollInputRef.current.max = String(
          getMaximumVerticalScroll(
            viewport,
            dimensionsRef.current.height,
          ),
        );
        pitchScrollInputRef.current.value = String(
          viewport.scrollY,
        );
      }

      if (pitchZoomInputRef.current !== null) {
        pitchZoomInputRef.current.value = String(
          viewport.zoomY,
        );
      }

      if (zoomLabelRef.current !== null) {
        zoomLabelRef.current.value =
          `${Math.round(viewport.zoomX * 100)}%`;
      }

      if (pitchZoomLabelRef.current !== null) {
        pitchZoomLabelRef.current.value =
          `${Math.round(viewport.zoomY * 100)}%`;
      }

      updateBarOutput(
        barLabelRef.current,
        viewport,
        getTicksPerBar(
          scene.projectStore.getState().transportSettings,
        ),
      );
    };
    const unsubscribe = scene.viewport.subscribe(
      syncViewportControls,
    );
    const unsubscribeGrid = scene.gridResolutionTicks.subscribe(
      syncViewportControls,
    );

    syncViewportControls();
    return (): void => {
      unsubscribe();
      unsubscribeGrid();
    };
  }, [scene]);

  const applyHorizontalZoom = useCallback(
    (zoomX: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const viewportWidth = dimensionsRef.current.width;
      const currentPixelsPerTick =
        viewport.zoomX / viewport.ticksPerPixel;
      const nextPixelsPerTick =
        zoomX / viewport.ticksPerPixel;
      const centerTick =
        (viewport.scrollX + viewportWidth / 2)
        / currentPixelsPerTick;
      const nextViewport: ViewportState = {
        ...viewport,
        zoomX,
        scrollX: 0,
      };
      const maximumScroll = getMaximumHorizontalScroll(
        nextViewport,
        viewportWidth,
      );
      const scrollX = Math.min(
        maximumScroll,
        Math.max(
          0,
          centerTick * nextPixelsPerTick - viewportWidth / 2,
        ),
      );

      publishViewport({
        ...nextViewport,
        scrollX,
      });

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(maximumScroll);
        scrollInputRef.current.value = String(scrollX);
        scrollInputRef.current.step = String(
          getHorizontalScrollStep(
            nextViewport,
            currentScene.gridResolutionTicks.get(),
          ),
        );
      }

      if (zoomLabelRef.current !== null) {
        zoomLabelRef.current.value = `${Math.round(zoomX * 100)}%`;
      }

      updateBarOutput(barLabelRef.current, {
        ...nextViewport,
        scrollX,
      }, getTicksPerBar(
        currentScene.projectStore.getState().transportSettings,
      ));
    },
    [publishViewport],
  );

  const applyHorizontalScroll = useCallback(
    (requestedScrollX: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const maximumScroll = getMaximumHorizontalScroll(
        viewport,
        dimensionsRef.current.width,
      );
      const scrollX = Math.min(
        maximumScroll,
        Math.max(0, requestedScrollX),
      );

      publishViewport({
        ...viewport,
        scrollX,
      });

      updateBarOutput(barLabelRef.current, {
        ...viewport,
        scrollX,
      }, getTicksPerBar(
        currentScene.projectStore.getState().transportSettings,
      ));
    },
    [publishViewport],
  );

  const applyVerticalScroll = useCallback(
    (requestedScrollY: number): void => {
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
          Math.max(0, requestedScrollY),
        ),
      });
    },
    [publishViewport],
  );

  const applyVerticalZoom = useCallback(
    (zoomY: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

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
      scrollInputRef.current.max = String(
        getMaximumHorizontalScroll(
          viewport,
          dimensionsRef.current.width,
        ),
      );
      scrollInputRef.current.step = String(
        getHorizontalScrollStep(
          viewport,
          currentScene.gridResolutionTicks.get(),
        ),
      );
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

  useEffect(() => {
    const horizontalScrollInput = scrollInputRef.current;
    const horizontalZoomInput = zoomInputRef.current;
    const verticalScrollInput = pitchScrollInputRef.current;
    const verticalZoomInput = pitchZoomInputRef.current;

    if (
      horizontalScrollInput === null
      || horizontalZoomInput === null
      || verticalScrollInput === null
      || verticalZoomInput === null
    ) {
      return undefined;
    }

    let animationFrameId: number | null = null;
    let pendingInputs = 0;
    let horizontalScroll = 0;
    let horizontalZoom = 1;
    let verticalScroll = 0;
    let verticalZoom = 1;

    const flushInputs = (): void => {
      animationFrameId = null;
      const inputs = pendingInputs;

      pendingInputs = 0;

      if ((inputs & VIEW_INPUT_HORIZONTAL_ZOOM) !== 0) {
        applyHorizontalZoom(horizontalZoom);
      }

      if ((inputs & VIEW_INPUT_HORIZONTAL_SCROLL) !== 0) {
        applyHorizontalScroll(horizontalScroll);
      }

      if ((inputs & VIEW_INPUT_VERTICAL_ZOOM) !== 0) {
        applyVerticalZoom(verticalZoom);
      }

      if ((inputs & VIEW_INPUT_VERTICAL_SCROLL) !== 0) {
        applyVerticalScroll(verticalScroll);
      }
    };
    const scheduleFlush = (): void => {
      if (animationFrameId === null) {
        animationFrameId =
          window.requestAnimationFrame(flushInputs);
      }
    };
    const handleHorizontalScrollInput = (): void => {
      horizontalScroll = horizontalScrollInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_HORIZONTAL_SCROLL;
      scheduleFlush();
    };
    const handleHorizontalZoomInput = (): void => {
      horizontalZoom = horizontalZoomInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_HORIZONTAL_ZOOM;
      scheduleFlush();
    };
    const handleVerticalScrollInput = (): void => {
      verticalScroll = verticalScrollInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_VERTICAL_SCROLL;
      scheduleFlush();
    };
    const handleVerticalZoomInput = (): void => {
      verticalZoom = verticalZoomInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_VERTICAL_ZOOM;
      scheduleFlush();
    };

    horizontalScrollInput.addEventListener(
      "input",
      handleHorizontalScrollInput,
      {
        passive: true,
      },
    );
    horizontalZoomInput.addEventListener(
      "input",
      handleHorizontalZoomInput,
      {
        passive: true,
      },
    );
    verticalScrollInput.addEventListener(
      "input",
      handleVerticalScrollInput,
      {
        passive: true,
      },
    );
    verticalZoomInput.addEventListener(
      "input",
      handleVerticalZoomInput,
      {
        passive: true,
      },
    );

    return (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      horizontalScrollInput.removeEventListener(
        "input",
        handleHorizontalScrollInput,
      );
      horizontalZoomInput.removeEventListener(
        "input",
        handleHorizontalZoomInput,
      );
      verticalScrollInput.removeEventListener(
        "input",
        handleVerticalScrollInput,
      );
      verticalZoomInput.removeEventListener(
        "input",
        handleVerticalZoomInput,
      );
    };
  }, [
    applyHorizontalScroll,
    applyHorizontalZoom,
    applyVerticalScroll,
    applyVerticalZoom,
  ]);

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

        <TransportMetrics
          projectStore={scene.projectStore}
          gridResolutionTicks={scene.gridResolutionTicks}
        />

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
              <BarRuler
                viewport={scene.viewport}
                projectStore={scene.projectStore}
                gridResolutionTicks={scene.gridResolutionTicks}
              />
              <div className="canvas-host">
                <PianoRollLayers
                  viewport={scene.viewport}
                  visibleRegion={scene.visibleRegion}
                  spatialIndex={scene.spatialIndex}
                  voiceStyles={scene.voiceStyles}
                  playheadTick={scene.playheadTick}
                  projectStore={scene.projectStore}
                  toolState={scene.interactionToolState}
                  activeVoiceId={ACTIVE_VOICE_ID}
                  totalTicks={DEMO_TOTAL_TICKS}
                  setViewport={publishViewport}
                  gridResolutionTicks={scene.gridResolutionTicks}
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
              <p>Touch-first tools and pinch navigation are active.</p>
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

interface TransportMetricsProps {
  readonly projectStore: DemoScene["projectStore"];
  readonly gridResolutionTicks: DemoScene["gridResolutionTicks"];
}

type GridSubdivision = "straight" | "triplet" | "dotted";

function TransportMetrics(
  props: TransportMetricsProps,
): React.JSX.Element {
  const {
    projectStore,
    gridResolutionTicks,
  } = props;
  const tempoInputRef = useRef<HTMLInputElement | null>(null);
  const meterSelectRef = useRef<HTMLSelectElement | null>(null);
  const gridSelectRef = useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef =
    useRef<HTMLSelectElement | null>(null);
  const gridBaseResolutionRef = useRef(240);
  const gridSubdivisionRef =
    useRef<GridSubdivision>("straight");
  const transactionSequenceRef = useRef(0);

  useEffect(() => {
    const updateTransportControls = (): void => {
      const transport = projectStore.getState().transportSettings;

      if (tempoInputRef.current !== null) {
        tempoInputRef.current.value =
          transport.bpm.toFixed(1);
      }

      if (meterSelectRef.current !== null) {
        meterSelectRef.current.value =
          `${transport.timeSignature.numerator}/${transport.timeSignature.denominator}`;
      }
    };
    const updateGridControl = (): void => {
      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(
          gridBaseResolutionRef.current,
        );
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value =
          gridSubdivisionRef.current;
      }
    };
    const unsubscribeProject = projectStore.subscribe(
      updateTransportControls,
    );
    const unsubscribeGrid = gridResolutionTicks.subscribe(
      updateGridControl,
    );

    updateTransportControls();
    updateGridControl();

    return (): void => {
      unsubscribeProject();
      unsubscribeGrid();
    };
  }, [
    gridResolutionTicks,
    projectStore,
  ]);

  const dispatchCommand = useCallback(
    (
      command: PianoRollCommand,
      label: string,
    ): void => {
      transactionSequenceRef.current += 1;
      const transaction: Transaction = {
        transactionId:
          `transport-${Date.now()}-${transactionSequenceRef.current}`,
        label,
        createdAt: Date.now(),
        commands: [command],
      };

      projectStore.dispatch(transaction);
    },
    [projectStore],
  );

  const handleTempoChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const bpm = Math.min(
        240,
        Math.max(
          30,
          Math.round(event.currentTarget.valueAsNumber * 10) / 10,
        ),
      );

      if (!Number.isFinite(bpm)) {
        return;
      }

      event.currentTarget.value = bpm.toFixed(1);
      dispatchCommand(
        {
          type: "UpdateTempo",
          bpm,
        },
        "Update tempo",
      );
    },
    [dispatchCommand],
  );

  const handleMeterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const timeSignature = parseTimeSignature(
        event.currentTarget.value,
      );

      if (timeSignature === null) {
        return;
      }

      dispatchCommand(
        {
          type: "UpdateTimeSignature",
          timeSignature,
        },
        "Update meter",
      );
    },
    [dispatchCommand],
  );

  const handleGridChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const baseResolutionTicks = Number(
        event.currentTarget.value,
      );

      if (
        Number.isSafeInteger(baseResolutionTicks)
        && baseResolutionTicks > 0
      ) {
        gridBaseResolutionRef.current = baseResolutionTicks;
        gridResolutionTicks.set(
          calculateSubdivisionTicks(
            baseResolutionTicks,
            gridSubdivisionRef.current,
          ),
        );
      }
    },
    [gridResolutionTicks],
  );
  const handleSubdivisionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(
        event.currentTarget.value,
      );

      if (subdivision === null) {
        return;
      }

      gridSubdivisionRef.current = subdivision;
      gridResolutionTicks.set(
        calculateSubdivisionTicks(
          gridBaseResolutionRef.current,
          subdivision,
        ),
      );
    },
    [gridResolutionTicks],
  );

  return (
    <div className="transport-metrics" aria-label="Transport settings">
      <label className="metric">
        <small>Tempo</small>
        <input
          ref={tempoInputRef}
          className="metric-control tempo-control"
          type="number"
          min="30"
          max="240"
          step="0.1"
          defaultValue="112.0"
          inputMode="numeric"
          onChange={handleTempoChange}
          aria-label="Tempo in beats per minute"
        />
        <span>BPM</span>
      </label>
      <label className="metric">
        <small>Meter</small>
        <select
          ref={meterSelectRef}
          className="metric-control metric-select"
          defaultValue="4/4"
          onChange={handleMeterChange}
          aria-label="Time signature"
        >
          <option value="3/4">3 / 4</option>
          <option value="4/4">4 / 4</option>
          <option value="5/4">5 / 4</option>
          <option value="6/8">6 / 8</option>
        </select>
      </label>
      <label className="metric">
        <small>Grid</small>
        <select
          ref={gridSelectRef}
          className="metric-control metric-select"
          defaultValue="240"
          onChange={handleGridChange}
          aria-label="Grid resolution"
        >
          <option value="960">1 / 4</option>
          <option value="480">1 / 8</option>
          <option value="240">1 / 16</option>
          <option value="120">1 / 32</option>
          <option value="60">1 / 64</option>
        </select>
      </label>
      <label className="metric">
        <small>Subdivision</small>
        <select
          ref={subdivisionSelectRef}
          className="metric-control metric-select"
          defaultValue="straight"
          onChange={handleSubdivisionChange}
          aria-label="Grid subdivision"
        >
          <option value="straight">Straight</option>
          <option value="triplet">Triplet</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
    </div>
  );
}

function parseGridSubdivision(
  value: string,
): GridSubdivision | null {
  switch (value) {
    case "straight":
    case "triplet":
    case "dotted":
      return value;
    default:
      return null;
  }
}

function calculateSubdivisionTicks(
  baseResolutionTicks: number,
  subdivision: GridSubdivision,
): number {
  switch (subdivision) {
    case "triplet":
      return Math.round(baseResolutionTicks * 2 / 3);
    case "dotted":
      return Math.round(baseResolutionTicks * 3 / 2);
    case "straight":
      return baseResolutionTicks;
  }
}

function parseTimeSignature(
  value: string,
): TimeSignature | null {
  switch (value) {
    case "3/4":
      return {
        numerator: 3,
        denominator: 4,
      };
    case "4/4":
      return {
        numerator: 4,
        denominator: 4,
      };
    case "5/4":
      return {
        numerator: 5,
        denominator: 4,
      };
    case "6/8":
      return {
        numerator: 6,
        denominator: 8,
      };
    default:
      return null;
  }
}

interface BarRulerProps extends PianoKeyboardProps {
  readonly projectStore: DemoScene["projectStore"];
  readonly gridResolutionTicks: DemoScene["gridResolutionTicks"];
}

function BarRuler(
  props: BarRulerProps,
): React.JSX.Element {
  const {
    viewport,
    projectStore,
    gridResolutionTicks,
  } = props;
  const paintRuler = useCallback(
    (frame: CanvasFrame): void => {
      const currentViewport = viewport.get();
      const transport =
        projectStore.getState().transportSettings;
      const pixelsPerTick =
        currentViewport.zoomX / currentViewport.ticksPerPixel;
      const firstVisibleTick =
        currentViewport.scrollX / pixelsPerTick;
      const lastVisibleTick =
        firstVisibleTick + frame.widthCssPixels / pixelsPerTick;
      const ticksPerBeat =
        transport.ppqn
        * 4
        / transport.timeSignature.denominator;
      const ticksPerBar =
        ticksPerBeat * transport.timeSignature.numerator;
      const effectiveGridTicks = getVisibleGridResolution(
        gridResolutionTicks.get(),
        pixelsPerTick,
      );
      const context = frame.context;

      context.fillStyle = "#191c22";
      context.fillRect(
        0,
        0,
        frame.widthCssPixels,
        frame.heightCssPixels,
      );
      drawRulerTicks(
        context,
        firstVisibleTick,
        lastVisibleTick,
        effectiveGridTicks,
        pixelsPerTick,
        currentViewport.scrollX,
        frame.heightCssPixels,
        5,
        frame.devicePixelRatio,
        "#343b47",
      );
      drawRulerTicks(
        context,
        firstVisibleTick,
        lastVisibleTick,
        ticksPerBeat,
        pixelsPerTick,
        currentViewport.scrollX,
        frame.heightCssPixels,
        10,
        frame.devicePixelRatio,
        "#4a5464",
      );
      drawRulerTicks(
        context,
        firstVisibleTick,
        lastVisibleTick,
        ticksPerBar,
        pixelsPerTick,
        currentViewport.scrollX,
        frame.heightCssPixels,
        frame.heightCssPixels,
        frame.devicePixelRatio,
        "#667388",
      );

      context.fillStyle = "#8b96a7";
      context.font =
        '9px "SFMono-Regular", Consolas, monospace';
      context.textBaseline = "top";

      const firstBarIndex = Math.max(
        0,
        Math.floor(firstVisibleTick / ticksPerBar),
      );
      const lastBarIndex = Math.ceil(
        lastVisibleTick / ticksPerBar,
      );

      for (
        let barIndex = firstBarIndex;
        barIndex <= lastBarIndex;
        barIndex += 1
      ) {
        const x =
          barIndex * ticksPerBar * pixelsPerTick
          - currentViewport.scrollX;

        context.fillText(String(barIndex + 1), x + 7, 7);
      }
    },
    [
      gridResolutionTicks,
      projectStore,
      viewport,
    ],
  );
  const renderer = useCanvasRenderer({
    render: paintRuler,
    mode: "on-demand",
    clearBeforeRender: true,
  });

  useEffect(() => {
    const unsubscribeViewport = viewport.subscribe(
      renderer.invalidate,
    );
    const unsubscribeGrid = gridResolutionTicks.subscribe(
      renderer.invalidate,
    );
    const unsubscribeProject = projectStore.subscribe(
      renderer.invalidate,
    );

    renderer.invalidate();

    return (): void => {
      unsubscribeViewport();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [
    gridResolutionTicks,
    projectStore,
    renderer.invalidate,
    viewport,
  ]);

  return (
    <canvas
      ref={renderer.canvasRef}
      className="bar-ruler"
      aria-hidden="true"
    />
  );
}

function getVisibleGridResolution(
  requestedTicks: number,
  pixelsPerTick: number,
): number {
  let resolutionTicks = requestedTicks;

  while (
    resolutionTicks * pixelsPerTick < 4
    && Number.isSafeInteger(resolutionTicks * 2)
  ) {
    resolutionTicks *= 2;
  }

  return resolutionTicks;
}

function drawRulerTicks(
  context: CanvasRenderingContext2D,
  firstVisibleTick: number,
  lastVisibleTick: number,
  intervalTicks: number,
  pixelsPerTick: number,
  scrollX: number,
  rulerHeight: number,
  markerHeight: number,
  devicePixelRatio: number,
  color: string,
): void {
  if (!Number.isFinite(intervalTicks) || intervalTicks <= 0) {
    return;
  }

  const firstTick =
    Math.floor(firstVisibleTick / intervalTicks) * intervalTicks;
  const lineWidth = 1 / devicePixelRatio;

  context.fillStyle = color;

  for (
    let tick = firstTick;
    tick <= lastVisibleTick;
    tick += intervalTicks
  ) {
    const rawX = tick * pixelsPerTick - scrollX;
    const x =
      Math.round(rawX * devicePixelRatio) / devicePixelRatio;

    context.fillRect(
      x,
      rulerHeight - markerHeight,
      lineWidth,
      markerHeight,
    );
  }
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

function getMaximumHorizontalScroll(
  viewport: ViewportState,
  viewportWidth: number,
): number {
  const contentWidth =
    DEMO_TOTAL_TICKS * viewport.zoomX / viewport.ticksPerPixel;

  return Math.max(0, contentWidth - viewportWidth);
}

function getHorizontalScrollStep(
  viewport: ViewportState,
  gridResolutionTicks: number,
): number {
  return (
    gridResolutionTicks
    * viewport.zoomX
    / viewport.ticksPerPixel
  );
}

function updateBarOutput(
  output: HTMLOutputElement | null,
  viewport: ViewportState,
  ticksPerBar: number,
): void {
  if (output === null) {
    return;
  }

  const tick =
    viewport.scrollX
    * viewport.ticksPerPixel
    / viewport.zoomX;

  output.value = `Bar ${Math.floor(tick / ticksPerBar) + 1}`;
}

function getTicksPerBar(
  transport: TransportState,
): number {
  return (
    transport.ppqn
    * 4
    * transport.timeSignature.numerator
    / transport.timeSignature.denominator
  );
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
