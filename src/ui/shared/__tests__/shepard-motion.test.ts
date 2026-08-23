import {
  describe,
  expect,
  test,
} from "vitest";
import {
  calculateShepardMotionFrame,
  createShepardMotionController,
  SHEPARD_OFFSET_X_PROPERTY,
  SHEPARD_OFFSET_Y_PROPERTY,
  SHEPARD_PHASE_PROPERTY,
  type ShepardAnimationPort,
} from "../shepard-motion";

const HORIZONTAL_MOTION = {
  periodPixels: 50,
  speedPixelsPerSecond: 25,
  gradientAngleDegrees: 90,
} as const;

describe("Shepard motion", () => {
  test("moves normally to CSS gradient stripes", () => {
    expect(calculateShepardMotionFrame(1_000, HORIZONTAL_MOTION)).toEqual({
      phasePixels: 25,
      offsetXPixels: 25,
      offsetYPixels: 0,
    });

    const upwardFrame = calculateShepardMotionFrame(1_000, {
      ...HORIZONTAL_MOTION,
      gradientAngleDegrees: 0,
    });
    expect(upwardFrame).toEqual({
      phasePixels: 25,
      offsetXPixels: 0,
      offsetYPixels: -25,
    });
  });

  test("wraps its phase without resetting its visual coordinates", () => {
    expect(calculateShepardMotionFrame(2_000, HORIZONTAL_MOTION)).toEqual({
      phasePixels: 0,
      offsetXPixels: 50,
      offsetYPixels: 0,
    });
  });

  test("supports a reversed optical direction", () => {
    expect(calculateShepardMotionFrame(1_000, {
      ...HORIZONTAL_MOTION,
      speedPixelsPerSecond: 10,
      direction: -1,
    })).toEqual({
      phasePixels: 40,
      offsetXPixels: -10,
      offsetYPixels: 0,
    });
  });

  test("runs one seamless transform cycle on the browser compositor", () => {
    const properties = new Map<string, string>();
    let publishedKeyframes: Keyframe[] | PropertyIndexedKeyframes | null = null;
    let publishedOptions: number | KeyframeAnimationOptions | undefined;
    let cancelled = false;
    const animationPort: ShepardAnimationPort = {
      prefersReducedMotion: () => false,
    };
    const controller = createShepardMotionController({
      style: {
        setProperty: (property, value) => {
          properties.set(property, value ?? "");
        },
      },
      animate: (keyframes, options) => {
        publishedKeyframes = keyframes;
        publishedOptions = options;
        return { cancel: () => { cancelled = true; } };
      },
    }, HORIZONTAL_MOTION, animationPort);

    controller.start();
    expect(controller.isRunning()).toBe(true);
    expect(properties.get(SHEPARD_PHASE_PROPERTY)).toBe("0px");
    expect(properties.get(SHEPARD_OFFSET_X_PROPERTY)).toBe("0px");
    expect(properties.get(SHEPARD_OFFSET_Y_PROPERTY)).toBe("0px");
    expect(publishedKeyframes).toEqual([
      { transform: "translate3d(0px, 0px, 0)" },
      { transform: "translate3d(50px, 0px, 0)" },
    ]);
    expect(publishedOptions).toEqual({
      duration: 2_000,
      easing: "linear",
      iterations: Infinity,
    });

    controller.stop();
    expect(controller.isRunning()).toBe(false);
    expect(cancelled).toBe(true);
    expect(properties.get("transform")).toBe("translate3d(0px, 0px, 0)");
  });

  test("stays static when reduced motion is requested", () => {
    let animationCount = 0;
    const animationPort: ShepardAnimationPort = {
      prefersReducedMotion: () => true,
    };
    const controller = createShepardMotionController({
      style: { setProperty: () => undefined },
      animate: () => {
        animationCount += 1;
        return { cancel: () => undefined };
      },
    }, HORIZONTAL_MOTION, animationPort);

    controller.start();

    expect(controller.isRunning()).toBe(false);
    expect(animationCount).toBe(0);
  });
});
