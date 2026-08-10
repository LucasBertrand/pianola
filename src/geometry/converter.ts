import {
  VIEWPORT_CONSTANTS,
} from "../config/program-constants";

export const MIN_MIDI_PITCH =
  VIEWPORT_CONSTANTS.minimumMidiPitch;
export const MAX_MIDI_PITCH =
  VIEWPORT_CONSTANTS.maximumMidiPitch;
export const MAXIMUM_HORIZONTAL_ZOOM =
  VIEWPORT_CONSTANTS.maximumHorizontalZoom;
export const MAXIMUM_VERTICAL_ZOOM =
  VIEWPORT_CONSTANTS.maximumVerticalZoom;

export interface ViewportState {
  readonly zoomX: number;
  readonly zoomY: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly pitchHeight: number;
  readonly ticksPerPixel: number;
  readonly devicePixelRatio: number;
}

export class CoordinateConverter {
  private tickToCssPixelScale = 1;
  private cssPixelToTickScale = 1;
  private pitchHeightCssPixels = 1;
  private scrollXCssPixels = 0;
  private scrollYCssPixels = 0;
  private pixelRatio = 1;
  private tickToDevicePixelScale = 1;
  private devicePixelToTickScale = 1;
  private pitchHeightDevicePixels = 1;
  private scrollXDevicePixels = 0;
  private scrollYDevicePixels = 0;

  public constructor(viewport: ViewportState) {
    this.setViewportState(viewport);
  }

  public setViewportState(viewport: ViewportState): void {
    assertPositiveFinite(viewport.zoomX, "zoomX");
    assertPositiveFinite(viewport.zoomY, "zoomY");
    assertFinite(viewport.scrollX, "scrollX");
    assertFinite(viewport.scrollY, "scrollY");
    assertPositiveFinite(viewport.pitchHeight, "pitchHeight");
    assertPositiveFinite(viewport.ticksPerPixel, "ticksPerPixel");
    assertPositiveFinite(viewport.devicePixelRatio, "devicePixelRatio");

    this.tickToCssPixelScale = viewport.zoomX / viewport.ticksPerPixel;
    this.cssPixelToTickScale = 1 / this.tickToCssPixelScale;
    this.pitchHeightCssPixels = viewport.pitchHeight * viewport.zoomY;
    this.scrollXCssPixels = viewport.scrollX;
    this.scrollYCssPixels = viewport.scrollY;
    this.pixelRatio = viewport.devicePixelRatio;
    this.tickToDevicePixelScale =
      this.tickToCssPixelScale * this.pixelRatio;
    this.devicePixelToTickScale = 1 / this.tickToDevicePixelScale;
    this.pitchHeightDevicePixels =
      this.pitchHeightCssPixels * this.pixelRatio;
    this.scrollXDevicePixels = this.scrollXCssPixels * this.pixelRatio;
    this.scrollYDevicePixels = this.scrollYCssPixels * this.pixelRatio;
  }

  public tickToPixelX(tick: number): number {
    return (
      tick * this.tickToDevicePixelScale
      - this.scrollXDevicePixels
    );
  }

  public pixelXToTick(pixel: number): number {
    return (
      pixel + this.scrollXDevicePixels
    ) * this.devicePixelToTickScale;
  }

  public pitchToPixelY(pitch: number): number {
    return (
      (MAX_MIDI_PITCH - pitch) * this.pitchHeightDevicePixels
      - this.scrollYDevicePixels
    );
  }

  public pixelYToPitch(pixel: number): number {
    const pitchRow = (
      pixel + this.scrollYDevicePixels
    ) / this.pitchHeightDevicePixels;

    return MAX_MIDI_PITCH - Math.floor(pitchRow);
  }

  public tickToCssPixelX(tick: number): number {
    return tick * this.tickToCssPixelScale - this.scrollXCssPixels;
  }

  public cssPixelXToTick(pixel: number): number {
    return (
      pixel + this.scrollXCssPixels
    ) * this.cssPixelToTickScale;
  }

  public pitchToCssPixelY(pitch: number): number {
    return (
      (MAX_MIDI_PITCH - pitch) * this.pitchHeightCssPixels
      - this.scrollYCssPixels
    );
  }

  public cssPixelYToPitch(pixel: number): number {
    const pitchRow = (
      pixel + this.scrollYCssPixels
    ) / this.pitchHeightCssPixels;

    return MAX_MIDI_PITCH - Math.floor(pitchRow);
  }

  public cssPixelToDevicePixel(pixel: number): number {
    return pixel * this.pixelRatio;
  }

  public devicePixelToCssPixel(pixel: number): number {
    return pixel / this.pixelRatio;
  }

  public cssSizeToDevicePixels(size: number): number {
    return Math.round(size * this.pixelRatio);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}
