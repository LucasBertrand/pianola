import type {
  OscillatorWaveform,
} from "../../../domain/instruments/instrument";

// A frequency-relative leak removes the tiny integration bias left by the two
// discrete BLEP transitions. Unlike a fixed per-sample leak, it has the same
// settling time in oscillator periods at every pitch.
const TRIANGLE_LEAK_PER_CYCLE = 0.25;

/** Allocation-free PolyBLEP oscillator state owned by one worklet voice. */
export class PolyBlepOscillator {
  private phase = 0;
  private integratedTriangle = -1;

  public reset(phase: number): void {
    this.phase = phase - Math.floor(phase);
    this.integratedTriangle = 1 - 4 * Math.abs(this.phase - 0.5);
  }

  public render(
    waveform: OscillatorWaveform,
    phaseIncrement: number,
    pulseWidth: number,
  ): number {
    const phase = this.phase;
    let sample: number;

    switch (waveform) {
      case "sine":
        sample = Math.sin(2 * Math.PI * phase);
        break;

      case "triangle": {
        const square = renderBandLimitedPulse(phase, phaseIncrement, 0.5);

        this.integratedTriangle += 4 * phaseIncrement * square;
        this.integratedTriangle *= 1
          - TRIANGLE_LEAK_PER_CYCLE * phaseIncrement;
        sample = this.integratedTriangle;
        break;
      }

      case "square":
        sample = renderBandLimitedPulse(
          phase,
          phaseIncrement,
          pulseWidth,
        );
        break;

      case "sawtooth":
        sample = 2 * phase - 1 - polyBlep(phase, phaseIncrement);
        break;
    }

    this.phase = phase + phaseIncrement;
    this.phase -= Math.floor(this.phase);
    return sample;
  }
}

function renderBandLimitedPulse(
  phase: number,
  phaseIncrement: number,
  requestedPulseWidth: number,
): number {
  // When the two edges are closer than one BLEP transition their residuals
  // overlap and cease to describe a representable pulse. Moving the edges to
  // the one-sample limit keeps high notes and extreme widths bounded and
  // preserves the exact zero-mean correction for the effective pulse.
  const pulseWidth = Math.max(
    phaseIncrement,
    Math.min(1 - phaseIncrement, requestedPulseWidth),
  );
  let sample = phase < pulseWidth ? 1 : -1;

  sample += polyBlep(phase, phaseIncrement);
  let fallingPhase = phase - pulseWidth;
  if (fallingPhase < 0) {
    fallingPhase += 1;
  }
  sample -= polyBlep(fallingPhase, phaseIncrement);
  return sample - (2 * pulseWidth - 1);
}

function polyBlep(phase: number, phaseIncrement: number): number {
  if (phase < phaseIncrement) {
    const normalized = phase / phaseIncrement;
    return normalized + normalized - normalized * normalized - 1;
  }

  if (phase > 1 - phaseIncrement) {
    const normalized = (phase - 1) / phaseIncrement;
    return normalized * normalized + normalized + normalized + 1;
  }

  return 0;
}
