import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getActiveClip,
} from "../../domain/project/project-document";
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
  MainToAudioWorkletMessage,
} from "../worklet/audio-worklet-protocol";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../tests/support/test-builders";

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
      snapshot,
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
});

class FakeMessagePort {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public readonly messages: MainToAudioWorkletMessage[] = [];

  public postMessage(message: MainToAudioWorkletMessage): void {
    this.messages.push(message);
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
