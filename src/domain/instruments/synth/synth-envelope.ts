export interface AdsrEnvelope {
  readonly attackSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
  /** Segment shape from exponential (-1) through linear (0) to logarithmic (1). */
  readonly curve: number;
}
