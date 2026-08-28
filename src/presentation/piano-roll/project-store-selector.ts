import type {
  ProjectStorePort,
} from "../../application/history/project-store";
import type {
  EditorSessionState,
} from "../../domain/project/project-document";

export type ProjectStoreSelector<TSnapshot> = (
  state: EditorSessionState,
) => TSnapshot;

export interface ProjectStoreSelectorAdapter<TSnapshot> {
  readonly getSnapshot: () => TSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  updateSelector(
    selector: ProjectStoreSelector<TSnapshot>,
    isEqual: (left: TSnapshot, right: TSnapshot) => boolean,
  ): void;
}

/** Caches one selected snapshot and suppresses unchanged notifications. */
export function createProjectStoreSelectorAdapter<TSnapshot>(
  store: Pick<ProjectStorePort, "getState" | "subscribe">,
  initialSelector: ProjectStoreSelector<TSnapshot>,
  initialIsEqual: (left: TSnapshot, right: TSnapshot) => boolean = Object.is,
): ProjectStoreSelectorAdapter<TSnapshot> {
  let selector = initialSelector;
  let isEqual = initialIsEqual;
  let snapshot = selector(store.getState());
  const getSnapshot = (): TSnapshot => {
    const candidate = selector(store.getState());

    if (!isEqual(snapshot, candidate)) {
      snapshot = candidate;
    }

    return snapshot;
  };

  return {
    getSnapshot,
    subscribe(listener) {
      return store.subscribe((state) => {
        const candidate = selector(state);

        if (isEqual(snapshot, candidate)) {
          return;
        }

        snapshot = candidate;
        listener();
      });
    },
    updateSelector(nextSelector, nextIsEqual) {
      selector = nextSelector;
      isEqual = nextIsEqual;
      getSnapshot();
    },
  };
}
