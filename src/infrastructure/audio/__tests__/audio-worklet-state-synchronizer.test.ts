import { describe, expect, test } from "vitest";
import { compileAudioPlaybackPlan } from "../../../application/audio/compile-audio-playback-plan";
import { createClipPlaybackSource } from "../../../application/audio/playback-source";
import { getActiveClip } from "../../../domain/project/project-document";
import { createTestProject } from "../../../../tests/support/test-builders";
import {
  AudioWorkletStateSynchronizer,
  hasAudioWorkletTransportChange,
  haveEqualAudioWorkletEvents,
  haveEqualSynthConfigs,
  requiresTimelineReplacement,
} from "../audio-worklet-state-synchronizer";

describe("audio worklet state synchronizer", () => {
  test("distinguishes structural timeline replacement from incremental diffs", () => {
    const { snapshot, transport } = createState();
    const instrument = snapshot.instruments[0];
    expect(instrument).toBeDefined();
    if (instrument === undefined) return;

    const mixUpdate = {
      ...snapshot,
      instruments: [{ ...instrument, gain: instrument.gain * 0.5 }],
    };
    const sourceUpdate = { ...snapshot, sourceId: "another-source" };

    expect(requiresTimelineReplacement(snapshot, mixUpdate)).toBe(false);
    expect(requiresTimelineReplacement(snapshot, sourceUpdate)).toBe(true);
    expect(haveEqualAudioWorkletEvents(instrument, mixUpdate.instruments[0]!))
      .toBe(true);
    expect(haveEqualSynthConfigs(instrument.instrument, {
      ...instrument.instrument,
      filterCutoffHz: instrument.instrument.filterCutoffHz + 1,
    })).toBe(false);
    expect(hasAudioWorkletTransportChange(snapshot, snapshot, transport, {
      ...transport,
      loopEnabled: !transport.loopEnabled,
    })).toBe(true);
  });

  test("promotes only the latest acknowledged queued timeline", () => {
    const { snapshot, transport } = createState();
    const synchronizer = new AudioWorkletStateSynchronizer();
    const first = { ...snapshot, sourceId: "queued-first" };
    const second = { ...snapshot, sourceId: "queued-second" };
    const firstRevision = synchronizer.queueTimeline(first, transport, true);
    const secondRevision = synchronizer.queueTimeline(second, transport, true);

    synchronizer.acknowledgeQueuedState(
      secondRevision.operation,
      secondRevision.sequence,
    );

    expect(synchronizer.acknowledgeTimeline(firstRevision.sequence))
      .toEqual({ kind: "reject" });
    expect(synchronizer.acknowledgeTimeline(secondRevision.sequence))
      .toEqual({
        kind: "activate",
        pending: { snapshot: second, transport },
      });
    expect(synchronizer.queuedTimeline).toBeNull();
  });

  test("allows an activation racing a queue clear, then rejects late state", () => {
    const { snapshot, transport } = createState();
    const synchronizer = new AudioWorkletStateSynchronizer();
    const queued = { ...snapshot, sourceId: "racing-queued" };
    const queuedRevision = synchronizer.queueTimeline(queued, transport, true);
    const clearOperation = synchronizer.clearQueuedTimeline(true);

    expect(synchronizer.acknowledgeTimeline(queuedRevision.sequence))
      .toEqual({
        kind: "activate",
        pending: { snapshot: queued, transport },
      });
    synchronizer.acknowledgeQueuedState(queuedRevision.operation, null);
    expect(synchronizer.queueOperation).toBe(clearOperation);
    expect(synchronizer.acknowledgeTimeline(1)).toEqual({ kind: "reject" });
  });

  test("invalidates pending queues when an uninitialized transport is replaced", () => {
    const { snapshot, transport } = createState();
    const synchronizer = new AudioWorkletStateSynchronizer();
    const queuedRevision = synchronizer.queueTimeline(
      { ...snapshot, sourceId: "never-published" },
      transport,
      false,
    );

    synchronizer.beginReplacement(snapshot, {
      ...snapshot,
      sourceId: "replacement",
    }, false);

    expect(synchronizer.acknowledgeTimeline(queuedRevision.sequence))
      .toEqual({ kind: "reject" });
  });
});

function createState() {
  const project = createTestProject();
  const clip = getActiveClip(project);
  return {
    snapshot: compileAudioPlaybackPlan(project, createClipPlaybackSource(clip)),
    transport: clip.transportSettings,
  };
}
