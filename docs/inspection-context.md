# InspectionContext — documentation

Overview

The `InspectionContext` centralizes inspection-related state and a refresh API for the app. It wraps the `useInspections()` hook and exposes:

- inspections array and helpers (from `useInspections`) — create/update/delete/select
- `refreshKey: number` — increments each time `triggerRefresh()` is called
- `triggerRefresh()` — call after a successful server-side operation (create/save/delete) to notify interested components to re-fetch
- `lastLoadedInspections` (optional) — a snapshot published by the Home view when it fetches inspections; useful for `VenueList` and other views that can consume the snapshot rather than re-fetching

Design goals

- Replace global events (`window.dispatchEvent`) with an explicit, testable mechanism
- Keep the API layer pure (e.g., `inspectionApi.deleteInspection()` returns results; the component should call `triggerRefresh()` if needed)
- Allow publishers to share server snapshots (`lastLoadedInspections`) when the Home view already computed and partitioned the response

Usage examples

1) Trigger a refresh after a save:

```tsx
const { triggerRefresh } = useInspectionContext();

// After a successful save
triggerRefresh();
```

2) React to refreshes in a component that fetches data:

```tsx
const { refreshKey } = useInspectionContext();
useEffect(() => {
  // Re-run when refreshKey changes
  fetchPartitionedInspections();
}, [refreshKey]);
```

3) Publish a snapshot from InspectorHome to avoid extra fetches in VenueList:

```tsx
const { setLastLoadedInspections } = useInspectionContext();
// After receiving inspectionsArray from API
setLastLoadedInspections(inspectionsArray);
```

Testing guidance

- Unit test `triggerRefresh()` increments `refreshKey` and that a component using `refreshKey` re-runs an effect
- Test that `lastLoadedInspections` snapshot is consumed by `VenueList` and `RoomList` when present

Migration notes

- Search the repo for `inspectionSaved` and `inspectionsLoaded` events and replace them with `triggerRefresh()` and/or `setLastLoadedInspections()` depending on whether a snapshot is meaningful

Files of interest

- `src/contexts/InspectionContext.tsx` — provider implementation
- `src/components/InspectorHome.tsx` — publishes `lastLoadedInspections` and reacts to `refreshKey`
- `src/components/InspectionForm.tsx` / `VenueSelection.tsx` — call `triggerRefresh()` after successful server operations
- `src/components/RoomList.tsx` / `src/components/VenueList.tsx` / `src/components/InspectionHistory.tsx` — re-run fetches when `refreshKey` changes

Notes

- `triggerRefresh()` is intentionally lightweight: it only increments a number. Side-effectful behavior (fetches) is left to components to keep responsibilities clear and testable.
