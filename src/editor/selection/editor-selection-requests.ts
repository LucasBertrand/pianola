import type {
  InstrumentId,
} from "../../domain/model";

export type EditorSelectionRequest =
  | { readonly type: "clear" }
  | { readonly type: "toggleInstrument"; readonly instrumentId: InstrumentId };

export type EditorSelectionRequestListener = (
  request: EditorSelectionRequest,
) => void;

/**
 * Delivers transient selection intentions without disguising commands as
 * persistent render state. Requests are consumed immediately and are never
 * serialized with the project.
 */
export class EditorSelectionRequests {
  private readonly listeners =
    new Set<EditorSelectionRequestListener>();

  public clear(): void {
    this.publish({ type: "clear" });
  }

  public toggleInstrument(instrumentId: InstrumentId): void {
    this.publish({ type: "toggleInstrument", instrumentId });
  }

  public subscribe(
    listener: EditorSelectionRequestListener,
  ): () => void {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private publish(request: EditorSelectionRequest): void {
    for (const listener of this.listeners) {
      listener(request);
    }
  }
}
