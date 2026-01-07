/**
 * InspectionContext
 * -----------------
 * Purpose:
 * - Provides a central place to store inspection-related state (list, current inspection, helpers)
 *   by wrapping the `useInspections()` hook and exposing its values via React Context.
 * - Replaces ad-hoc global DOM events (e.g., `window.dispatchEvent('inspectionSaved')`) with an
 *   explicit, testable refresh mechanism (`triggerRefresh()` / `refreshKey`).
 *
 * Usage patterns:
 * - Writers (components that create, save, or delete inspections) should call `triggerRefresh()`
 *   after a successful server-side operation to notify interested consumers to refresh.
 * - Readers (components that need to re-fetch when inspections change) should include
 *   `refreshKey` in `useEffect` dependency arrays to re-run their fetch logic when the key
 *   increments. Example:
 *
 *     const { refreshKey } = useInspectionContext();
 *     useEffect(() => { fetchList(); }, [refreshKey]);
 *
 * - For optimizations where one component precomputes a server response (e.g., `InspectorHome`
 *   precomputes a list of inspections and counts), the optional `lastLoadedInspections` snapshot
 *   can be used to publish that snapshot synchronously for other components (e.g., `VenueList`) to
 *   consume without waiting for a separate network request.
 *
 * Testing:
 * - Tests should assert that calling `triggerRefresh()` increments `refreshKey` and that
 *   consumers with `refreshKey` in their deps re-run side effects.
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import { useInspections } from '../hooks/useInspections';
import type { Inspection } from '../types/inspection';

type InspectionContextValue = ReturnType<typeof useInspections> & {
  refreshKey: number;
  triggerRefresh: () => void;
  lastLoadedInspections: any[] | null;
  setLastLoadedInspections: (items: any[] | null) => void;
};

const InspectionContext = createContext<InspectionContextValue | null>(null);

export function InspectionProvider({ children }: { children: React.ReactNode }) {
  const inspectionsHook = useInspections();
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastLoadedInspections, setLastLoadedInspections] = useState<any[] | null>(null);

  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const value: InspectionContextValue = {
    ...inspectionsHook,
    refreshKey,
    triggerRefresh,
    lastLoadedInspections,
    setLastLoadedInspections,
  };

  return <InspectionContext.Provider value={value}>{children}</InspectionContext.Provider>;
}

export function useInspectionContext() {
  const ctx = useContext(InspectionContext);
  if (!ctx) throw new Error('useInspectionContext must be used within an InspectionProvider');
  return ctx;
}
