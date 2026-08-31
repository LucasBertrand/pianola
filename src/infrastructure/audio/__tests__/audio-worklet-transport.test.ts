import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  AudioWorkletTransport,
} from "../audio-worklet-transport";
import {
  createClipPlaybackSource,
} from "../playback-source";
import {
  compilePlaybackPlan,
} from "../playback-snapshot";
import type {
  AudioWorkletToMainMessage,
  MainToAudioWorkletMessage,
} from "../worklet/audio-worklet-protocol";
import {
  AUDIO_WORKLET_PROTOCOL_VERSION,
} from "../worklet/audio-worklet-protocol";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";

describe("AudioWorklet browser transport", () => {
  test("loads one timeline and sends no per-note scheduling messages", async () => {
    const project = createTestProject({
      clips: [{
        id: TEST_CLIP_ID,
        notes: Array.from({ length: 1_000 }, (_, noteIndex) => (
          createTestNote({
            id: `note-${noteIndex}`,
            startTick: noteIndex * 2,
          })
        )),
      }],
    });
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const fakePort = new FakeMessagePort();
    const fakeNode = new FakeAudioWorkletNode(fakePort);
    const fakeContext = new FakeAudioContext();
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {},
      0,
      () => fakeContext as unknown as AudioContext,
      () => fakeNode as unknown as AudioWorkletNode,
    );

    await transport.play(0);

    expect(fakeContext.loadedModuleUrl).toContain(
      "playback-processor",
    );
    expect(fakePort.messages.map((message) => message.type)).toEqual([
      "load-timeline",
      "play",
    ]);
    expect(fakePort.messages.some((message) => (
      "occurrenceId" in message
    ))).toBe(false);

    const publishedConfig =
      project.projectInstrumentsById[TEST_INSTRUMENT_ID]?.instrument;

    expect(publishedConfig).toBeDefined();

    if (publishedConfig !== undefined) {
      transport.replaceInstrumentPreview(TEST_INSTRUMENT_ID, {
        ...publishedConfig,
        filterCutoffHz: 1_234,
      });
    }

    expect(fakePort.messages.at(-1)?.type).toBe("instrument-preview");
    expect(fakePort.messages.filter((message) => (
      message.type === "load-timeline"
    ))).toHaveLength(1);

    await transport.dispose();
    expect(fakeNode.disconnected).toBe(true);
    expect(fakeContext.state).toBe("closed");
  });

  test("publishes independent versioned tempo and loop previews", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const fakePort = new FakeMessagePort();
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {},
      0,
      () => new FakeAudioContext() as unknown as AudioContext,
      () => new FakeAudioWorkletNode(fakePort) as unknown as AudioWorkletNode,
    );
    const tempoPreview = {
      ...snapshot.tempoMap,
      bpms: new Float64Array([90]),
    };

    transport.previewTempoMap(TEST_CLIP_ID, tempoPreview);
    transport.previewLoop(TEST_CLIP_ID, { startTick: 240, endTick: 960 });
    transport.previewLoop("another-clip", { startTick: 0, endTick: 480 });
    await transport.play(0);

    expect(fakePort.messages.map((message) => message.type)).toEqual([
      "load-timeline",
      "tempo-map-preview",
      "loop-preview",
      "play",
    ]);
    const tempoMessage = fakePort.messages[1];
    const loopMessage = fakePort.messages[2];

    expect(tempoMessage).toMatchObject({
      type: "tempo-map-preview",
      sourceId: TEST_CLIP_ID,
      sequence: 1,
      previewVersion: 1,
    });
    expect(loopMessage).toMatchObject({
      type: "loop-preview",
      sourceId: TEST_CLIP_ID,
      sequence: 1,
      previewVersion: 1,
      loop: { startTick: 240, endTick: 960 },
    });

    const messageCount = fakePort.messages.length;

    transport.previewTempoMap(TEST_CLIP_ID, tempoPreview);
    transport.previewLoop(TEST_CLIP_ID, { startTick: 240, endTick: 960 });
    expect(fakePort.messages).toHaveLength(messageCount);

    transport.previewTempoMap(TEST_CLIP_ID, null);
    transport.previewLoop(TEST_CLIP_ID, null);

    expect(fakePort.messages.slice(-2)).toEqual([
      expect.objectContaining({
        type: "tempo-map-preview",
        previewVersion: 2,
        tempoStartTicks: null,
        tempoBpms: null,
      }),
      expect.objectContaining({
        type: "loop-preview",
        previewVersion: 2,
        loop: null,
      }),
    ]);

    await transport.dispose();
  });

  test("sends versioned lightweight commands without retransferring notes", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(project, createClipPlaybackSource(clip));
    const originalInstrument = snapshot.instruments[0];
    expect(originalInstrument).toBeDefined();
    if (originalInstrument === undefined) return;
    const fakePort = new FakeMessagePort();
    const transport = new AudioWorkletTransport(
      snapshot, clip.transportSettings, {}, 0,
      () => new FakeAudioContext() as unknown as AudioContext,
      () => new FakeAudioWorkletNode(fakePort) as unknown as AudioWorkletNode,
    );

    await transport.play(0);
    const messageCount = fakePort.messages.length;
    transport.replacePlaybackState({
      ...snapshot,
      masterGain: 0.7,
      masterMuted: true,
      masterTuningFrequencyHz: 442,
      instruments: [{
        ...originalInstrument,
        gain: 0.6,
        pan: 0.25,
        muted: true,
        solo: true,
        instrument: { ...originalInstrument.instrument, filterCutoffHz: 2_345 },
      }],
    }, {
      ...clip.transportSettings,
      loopEnabled: !clip.transportSettings.loopEnabled,
    });

    const updates = fakePort.messages.slice(messageCount);
    expect(updates.map((message) => message.type)).toEqual([
      "transport-config", "instrument-gain", "instrument-pan",
      "instrument-mute", "instrument-solo", "instrument-config",
      "master-gain", "master-mute", "master-tuning",
    ]);
    expect(updates.every((message) =>
      message.protocolVersion === AUDIO_WORKLET_PROTOCOL_VERSION)).toBe(true);
    expect(updates.some((message) => message.type === "load-timeline"
      || message.type === "replace-instrument-events")).toBe(false);
    expect(updates.some((message) => "pitches" in message)).toBe(false);
    await transport.dispose();
  });

  test("retransfers only the instrument events that changed", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(project, createClipPlaybackSource(clip));
    const instrument = snapshot.instruments[0];
    expect(instrument).toBeDefined();
    if (instrument === undefined) return;
    const fakePort = new FakeMessagePort();
    const transport = new AudioWorkletTransport(
      snapshot, clip.transportSettings, {}, 0,
      () => new FakeAudioContext() as unknown as AudioContext,
      () => new FakeAudioWorkletNode(fakePort) as unknown as AudioWorkletNode,
    );
    await transport.play(0);
    const messageCount = fakePort.messages.length;

    transport.replacePlaybackState({
      ...snapshot,
      instruments: [{
        ...instrument,
        noteIds: ["replacement-note"],
        pitches: new Uint8Array([64]),
        startTicks: new Float64Array([120]),
        durationTicks: new Float64Array([240]),
      }],
    }, clip.transportSettings);

    const updates = fakePort.messages.slice(messageCount);
    expect(updates.map((message) => message.type))
      .toEqual(["replace-instrument-events"]);
    expect(updates[0]).toMatchObject({
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
      instrumentId: instrument.instrumentId,
      noteIds: ["replacement-note"],
    });
    expect(fakePort.messages.filter((message) => message.type === "load-timeline"))
      .toHaveLength(1);
    await transport.dispose();
  });

  test("retransfers events when only their stable note identity changes", async () => {
    const project = createTestProject({
      clips: [{
        id: TEST_CLIP_ID,
        notes: [createTestNote({ id: "original-note" })],
      }],
    });
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(project, createClipPlaybackSource(clip));
    const instrument = snapshot.instruments[0];
    expect(instrument).toBeDefined();
    if (instrument === undefined) return;
    const fakePort = new FakeMessagePort();
    const transport = new AudioWorkletTransport(
      snapshot, clip.transportSettings, {}, 0,
      () => new FakeAudioContext() as unknown as AudioContext,
      () => new FakeAudioWorkletNode(fakePort) as unknown as AudioWorkletNode,
    );
    await transport.play(0);
    const messageCount = fakePort.messages.length;

    transport.replacePlaybackState({
      ...snapshot,
      instruments: [{
        ...instrument,
        noteIds: instrument.noteIds.map((noteId) => `${noteId}-replacement`),
      }],
    }, clip.transportSettings);

    expect(fakePort.messages.slice(messageCount).map((message) => message.type))
      .toEqual(["replace-instrument-events"]);
    await transport.dispose();
  });

  test("replaces a playing clip immediately without a stop command", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const fakePort = new FakeMessagePort();
    const fakeNode = new FakeAudioWorkletNode(fakePort);
    const fakeContext = new FakeAudioContext();
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {},
      0,
      () => fakeContext as unknown as AudioContext,
      () => fakeNode as unknown as AudioWorkletNode,
    );

    await transport.play(480);
    transport.replacePlaybackState(
      { ...snapshot, sourceId: "replacement-clip" },
      clip.transportSettings,
      0,
    );

    expect(transport.status).toBe("playing");
    expect(fakePort.messages.slice(-2).map((message) => message.type))
      .toEqual(["load-timeline", "seek"]);
    expect(fakePort.messages.some((message) => message.type === "stop"))
      .toBe(false);

    await transport.dispose();
  });

  test("promotes a queued clip and ignores late position reports", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const nextSnapshot = {
      ...snapshot,
      sourceId: "clip-next",
    };
    const fakePort = new FakeMessagePort();
    const fakeNode = new FakeAudioWorkletNode(fakePort);
    const fakeContext = new FakeAudioContext();
    const statusReports: Array<{
      readonly sourceId: string;
      readonly tick: number;
    }> = [];
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {
        onStatusChange(_status, sourceId, tick) {
          statusReports.push({ sourceId, tick });
        },
      },
      0,
      () => fakeContext as unknown as AudioContext,
      () => fakeNode as unknown as AudioWorkletNode,
    );

    await transport.play(0);
    transport.queuePlaybackState(nextSnapshot, clip.transportSettings);

    const loadMessage = fakePort.messages.find(
      (message) => message.type === "load-timeline",
    );
    const queueMessage = fakePort.messages.find(
      (message) => message.type === "queue-timeline",
    );

    expect(loadMessage?.type).toBe("load-timeline");
    expect(queueMessage?.type).toBe("queue-timeline");

    if (
      loadMessage?.type !== "load-timeline"
      || queueMessage?.type !== "queue-timeline"
    ) {
      return;
    }

    fakePort.emit({
      type: "transport-state",
      status: "playing",
      sourceId: nextSnapshot.sourceId,
      tick: 24,
      frame: 1_024,
      sequence: queueMessage.sequence,
    });
    fakePort.emit({
      type: "transport-state",
      status: "stopped",
      sourceId: snapshot.sourceId,
      tick: snapshot.durationTicks,
      frame: 1_025,
      sequence: loadMessage.sequence,
    });

    expect(transport.status).toBe("playing");
    expect(transport.getPositionTick()).toBe(24);
    expect(statusReports.at(-1)).toEqual({
      sourceId: nextSnapshot.sourceId,
      tick: 24,
    });

    await transport.dispose();
  });

  test("promotes a preloaded clip racing an incremental update and queue clear", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(project, createClipPlaybackSource(clip));
    const instrument = snapshot.instruments[0];
    expect(instrument).toBeDefined();
    if (instrument === undefined) return;
    const nextSnapshot = { ...snapshot, sourceId: "racing-preloaded-clip" };
    const fakePort = new FakeMessagePort();
    const reports: string[] = [];
    const transport = new AudioWorkletTransport(
      snapshot, clip.transportSettings, {
        onStatusChange(_status, sourceId) { reports.push(sourceId); },
      }, 0,
      () => new FakeAudioContext() as unknown as AudioContext,
      () => new FakeAudioWorkletNode(fakePort) as unknown as AudioWorkletNode,
    );
    await transport.play(0);
    transport.queuePlaybackState(nextSnapshot, clip.transportSettings);
    const queueMessage = fakePort.messages.filter((message) =>
      message.type === "queue-timeline").at(-1);
    expect(queueMessage?.type).toBe("queue-timeline");
    if (queueMessage?.type !== "queue-timeline") return;

    transport.replacePlaybackState({
      ...snapshot,
      instruments: [{ ...instrument, pan: 0.5 }],
    }, clip.transportSettings);
    const clearMessage = fakePort.messages.filter((message) =>
      message.type === "clear-queued-timeline").at(-1);
    expect(fakePort.messages.at(-1)).toMatchObject({
      type: "instrument-pan",
      sequence: 1,
    });
    expect(clearMessage?.type).toBe("clear-queued-timeline");
    if (clearMessage?.type !== "clear-queued-timeline") return;

    fakePort.emit({
      type: "transport-state",
      status: "playing",
      sourceId: nextSnapshot.sourceId,
      tick: 8,
      frame: 1_024,
      sequence: queueMessage.sequence,
    });
    fakePort.emit({
      type: "queued-timeline-state",
      operation: clearMessage.operation,
      sequence: null,
    });

    expect(reports.at(-1)).toBe(nextSnapshot.sourceId);
    expect(transport.getPositionTick()).toBe(8);
    await transport.dispose();
  });

  test("publishes exact worklet positions after pause and stop", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const fakePort = new FakeMessagePort();
    const fakeNode = new FakeAudioWorkletNode(fakePort);
    const fakeContext = new FakeAudioContext();
    const statusReports: Array<{
      readonly status: string;
      readonly tick: number;
    }> = [];
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {
        onStatusChange(status, _sourceId, tick) {
          statusReports.push({ status, tick });
        },
      },
      0,
      () => fakeContext as unknown as AudioContext,
      () => fakeNode as unknown as AudioWorkletNode,
    );

    await transport.play(0);
    const loadMessage = fakePort.messages.find(
      (message) => message.type === "load-timeline",
    );

    expect(loadMessage?.type).toBe("load-timeline");

    if (loadMessage?.type !== "load-timeline") {
      return;
    }

    fakePort.emit({
      type: "transport-state",
      status: "playing",
      sourceId: snapshot.sourceId,
      tick: 24,
      frame: 1_024,
      sequence: loadMessage.sequence,
    });
    transport.pause();
    fakePort.emit({
      type: "transport-state",
      status: "paused",
      sourceId: snapshot.sourceId,
      tick: 32,
      frame: 1_152,
      sequence: loadMessage.sequence,
    });

    expect(statusReports.at(-1)).toEqual({ status: "paused", tick: 32 });

    await transport.play(32);
    fakePort.emit({
      type: "transport-state",
      status: "playing",
      sourceId: snapshot.sourceId,
      tick: 48,
      frame: 2_176,
      sequence: loadMessage.sequence,
    });
    transport.stop();
    fakePort.emit({
      type: "transport-state",
      status: "stopped",
      sourceId: snapshot.sourceId,
      tick: 56,
      frame: 2_304,
      sequence: loadMessage.sequence,
    });

    expect(statusReports.at(-1)).toEqual({ status: "stopped", tick: 56 });

    await transport.dispose();
  });

  test("forgets queued snapshots after the worklet acknowledges replacement and clearing", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const fakePort = new FakeMessagePort();
    const fakeNode = new FakeAudioWorkletNode(fakePort);
    const fakeContext = new FakeAudioContext();
    const statusReports: string[] = [];
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {
        onStatusChange(_status, sourceId) {
          statusReports.push(sourceId);
        },
      },
      0,
      () => fakeContext as unknown as AudioContext,
      () => fakeNode as unknown as AudioWorkletNode,
    );

    await transport.play(0);
    const firstQueuedSnapshot = { ...snapshot, sourceId: "clip-queued-1" };
    const secondQueuedSnapshot = { ...snapshot, sourceId: "clip-queued-2" };

    transport.queuePlaybackState(
      firstQueuedSnapshot,
      clip.transportSettings,
    );
    transport.queuePlaybackState(
      secondQueuedSnapshot,
      clip.transportSettings,
    );

    const queueMessages = fakePort.messages.filter(
      (message) => message.type === "queue-timeline",
    );
    const firstQueueMessage = queueMessages[0];
    const secondQueueMessage = queueMessages[1];

    expect(firstQueueMessage?.type).toBe("queue-timeline");
    expect(secondQueueMessage?.type).toBe("queue-timeline");

    if (
      firstQueueMessage?.type !== "queue-timeline"
      || secondQueueMessage?.type !== "queue-timeline"
    ) {
      return;
    }

    fakePort.emit({
      type: "queued-timeline-state",
      operation: secondQueueMessage.operation,
      sequence: secondQueueMessage.sequence,
    });
    fakePort.emit({
      type: "transport-state",
      status: "playing",
      sourceId: firstQueuedSnapshot.sourceId,
      tick: 0,
      frame: 1_024,
      sequence: firstQueueMessage.sequence,
    });

    expect(statusReports).not.toContain(firstQueuedSnapshot.sourceId);

    transport.clearQueuedPlaybackState();
    const clearMessage = fakePort.messages.at(-1);

    expect(clearMessage?.type).toBe("clear-queued-timeline");

    if (clearMessage?.type !== "clear-queued-timeline") {
      return;
    }

    fakePort.emit({
      type: "queued-timeline-state",
      operation: clearMessage.operation,
      sequence: null,
    });
    fakePort.emit({
      type: "transport-state",
      status: "playing",
      sourceId: secondQueuedSnapshot.sourceId,
      tick: 0,
      frame: 2_048,
      sequence: secondQueueMessage.sequence,
    });

    expect(statusReports).not.toContain(secondQueuedSnapshot.sourceId);

    await transport.dispose();
  });

  test("forwards reduced-rate master levels through the browser callback", async () => {
    const project = createTestProject();
    const clip = getActiveClip(project);
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(clip),
    );
    const fakePort = new FakeMessagePort();
    const fakeNode = new FakeAudioWorkletNode(fakePort);
    const fakeContext = new FakeAudioContext();
    const reports: number[] = [];
    const transport = new AudioWorkletTransport(
      snapshot,
      clip.transportSettings,
      {
        onMasterLevels(levels) {
          reports.push(levels.peakLeft);
        },
      },
      0,
      () => fakeContext as unknown as AudioContext,
      () => fakeNode as unknown as AudioWorkletNode,
    );

    await transport.play();
    fakePort.emit({
      type: "master-levels",
      frame: 2_400,
      levels: {
        peakLeft: 0.8,
        peakRight: 0.7,
        rmsLeft: 0.4,
        rmsRight: 0.35,
        preProtectionPeak: 1.2,
        gainReductionDb: 2.5,
      },
    });

    expect(reports).toEqual([0.8]);
    await transport.dispose();
  });
});

type UnversionedWorkletMessage<T> = T extends AudioWorkletToMainMessage
  ? Omit<T, "protocolVersion"> : never;

class FakeMessagePort {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public readonly messages: MainToAudioWorkletMessage[] = [];

  public postMessage(message: MainToAudioWorkletMessage): void {
    this.messages.push(message);
  }

  public emit(message: UnversionedWorkletMessage<AudioWorkletToMainMessage>): void {
    this.onmessage?.({ data: {
      ...message,
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
    } } as MessageEvent);
  }

  public close(): void {}
}

class FakeAudioWorkletNode {
  public onprocessorerror: (() => void) | null = null;
  public disconnected = false;

  public constructor(public readonly port: FakeMessagePort) {}

  public connect(): void {}

  public disconnect(): void {
    this.disconnected = true;
  }
}

class FakeAudioContext {
  public state: AudioContextState = "suspended";
  public readonly destination = {};
  public loadedModuleUrl = "";
  public readonly audioWorklet = {
    addModule: async (moduleUrl: string): Promise<void> => {
      this.loadedModuleUrl = moduleUrl;
    },
  };

  public async resume(): Promise<void> {
    this.state = "running";
  }

  public async close(): Promise<void> {
    this.state = "closed";
  }
}
