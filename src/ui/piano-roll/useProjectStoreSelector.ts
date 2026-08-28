import {
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  ProjectStorePort,
} from "../../application/history/project-store";
import {
  createProjectStoreSelectorAdapter,
  type ProjectStoreSelector,
} from "./project-store-selector";

export function useProjectStoreSelector<TSnapshot>(
  store: ProjectStorePort,
  selector: ProjectStoreSelector<TSnapshot>,
  isEqual: (left: TSnapshot, right: TSnapshot) => boolean = Object.is,
): TSnapshot {
  const adapter = useMemo(
    () => createProjectStoreSelectorAdapter(store, selector, isEqual),
    [store],
  );

  adapter.updateSelector(selector, isEqual);

  return useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
}
