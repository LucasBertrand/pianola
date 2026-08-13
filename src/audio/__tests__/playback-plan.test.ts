import { describe, expect, test } from "vitest";
import {
  compilePlaybackPlan,
} from "../playback-snapshot";
import { createClipPlaybackSource } from "../playback-source";
import {
  createTestProject,
  createTestNote,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../tests/support/test-builders";
import {
  clearInstrumentSettingsPreview,
  EMPTY_INSTRUMENT_SETTINGS_PREVIEW,
  setInstrumentSettingsPreview,
} from "../instrument-settings-preview";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  LookaheadScheduler,
} from "../lookahead-scheduler";
import {
  FakeAudioEngine,
  FakeSchedulerTimer,
} from "../../../tests/support/fake-audio-engine";
import {
  ProjectStore,
} from "../../domain/project-store";

describe("playback plans", () => {
  test("preserves the explicit source and every meter-map segment", () => {
    const baseState = createTestProject();
    const baseClip = baseState.clipsById[TEST_CLIP_ID];

    expect(baseClip).toBeDefined();

    if (baseClip === undefined) {
      return;
    }

    const clip = {
      ...baseClip,
      timeline: {
        ...baseClip.timeline,
        meterMap: {
          segments: [
            {
              startTick: 0,
              timeSignature: { numerator: 4, denominator: 4 as const },
            },
            {
              startTick: 3_840,
              timeSignature: { numerator: 3, denominator: 4 as const },
            },
          ],
        },
      },
    };
    const state = {
      ...baseState,
      clipsById: { ...baseState.clipsById, [clip.id]: clip },
    };
    const plan = compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
    );

    expect(plan.sourceId).toBe(TEST_CLIP_ID);
    expect(Array.from(plan.tempoMap.startTicks)).toEqual([0, 3_840]);
    expect(Array.from(plan.tempoMap.startSeconds)).toEqual([0, 2]);
    expect(plan.tempoMap.timeSignatures).toEqual([
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ]);
  });

  test("applies and clears instrument settings without changing the document", () => {
    const state = createTestProject();
    const store = new ProjectStore(state);
    const clip = getActiveClip(state);
    const publishedConfig =
      state.projectInstrumentsById[TEST_INSTRUMENT_ID]?.instrument;

    expect(publishedConfig).toBeDefined();

    if (publishedConfig === undefined) {
      return;
    }

    const previewConfig = {
      ...publishedConfig,
      filterCutoffHz: 1_234,
    };
    const previewLayer = setInstrumentSettingsPreview(
      EMPTY_INSTRUMENT_SETTINGS_PREVIEW,
      TEST_INSTRUMENT_ID,
      previewConfig,
    );
    const previewPlan = compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
      previewLayer,
    );

    expect(previewPlan.instruments[0]?.instrument.filterCutoffHz).toBe(1_234);
    expect(publishedConfig.filterCutoffHz).not.toBe(1_234);
    expect(state.revision).toBe(0);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);

    const restoredPlan = compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
      clearInstrumentSettingsPreview(
        previewLayer,
        TEST_INSTRUMENT_ID,
      ),
    );

    expect(restoredPlan.instruments[0]?.instrument.filterCutoffHz).toBe(
      publishedConfig.filterCutoffHz,
    );
  });

  test("updates a playing instrument without restarting the transport", async () => {
    const state = createTestProject({
      instrumentIds: [TEST_INSTRUMENT_ID, "instrument-b"],
      clips: [{
        id: TEST_CLIP_ID,
        notes: [
          createTestNote({
            id: "held-a",
            startTick: 0,
            durationTicks: 240,
          }),
          createTestNote({
            id: "held-b",
            instrumentId: "instrument-b",
            startTick: 0,
            durationTicks: 240,
          }),
        ],
      }],
    });
    const clip = getActiveClip(state);
    const basePlan = compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
    );
    const engine = new FakeAudioEngine();
    const scheduler = new LookaheadScheduler(
      engine,
      basePlan,
      clip.transportSettings,
      {},
      new FakeSchedulerTimer(),
    );

    await scheduler.play(60);
    const eventCountBeforePreview = engine.events.length;
    const publishedConfig =
      state.projectInstrumentsById[TEST_INSTRUMENT_ID]?.instrument;

    expect(publishedConfig).toBeDefined();

    if (publishedConfig === undefined) {
      await scheduler.dispose();
      return;
    }

    const previewLayer = setInstrumentSettingsPreview(
      EMPTY_INSTRUMENT_SETTINGS_PREVIEW,
      TEST_INSTRUMENT_ID,
      { ...publishedConfig, oscillatorWaveform: "square" },
    );
    const previewPlan = compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
      previewLayer,
    );

    scheduler.replaceInstrumentPreview(
      previewPlan,
      clip.transportSettings,
      TEST_INSTRUMENT_ID,
    );

    expect(engine.cancelledFutureAt).toEqual([]);
    expect(engine.cancelledAt).toEqual([]);
    expect(engine.events.slice(eventCountBeforePreview)).toHaveLength(0);
    expect(
      engine.instrumentSettingsPreviews.at(-1)
        ?.instrument.oscillatorWaveform,
    ).toBe("square");
    expect(engine.instrumentSettingsPreviews.at(-1)?.instrumentId).toBe(
      TEST_INSTRUMENT_ID,
    );

    await scheduler.dispose();
  });
});
