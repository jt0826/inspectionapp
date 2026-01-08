import { useState, useCallback } from 'react';
import type { Inspection } from '../types/inspection';
import { normalizeInspection } from '../utils/normalizers';
import { API } from '../config/api';
import { generateInspectionId } from '../utils/id';

/**
 * useInspections - Hook to manage inspection collection and the active inspection.
 *
 * Responsibilities
 * - Keep an in-memory list of normalized `Inspection` objects
 * - Track the currently selected inspection id and derived `currentInspection`
 * - Provide helper operations to create, update, delete, and select inspections
 *
 * Notes
 * - `createInspection` calls the remote API (`API.inspectionsCreate`) and normalizes
 *   the server response using `normalizeInspection`. It sets `isCreating` while the
 *   request is in flight and adds the created inspection to the local state.
 * - `updateInspection` and `deleteInspection` are local, synchronous updates to the
 *   in-memory collection; persistence should be handled by the caller if necessary.
 */
export function useInspections() {
  /** List of inspections in canonical frontend shape (normalized) */
  const [inspections, setInspections] = useState<Inspection[]>([]);

  /** Currently-selected inspection id (or null if none selected) */
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null);

  /** True while a createInspection call is in progress */
  const [isCreating, setIsCreating] = useState(false);

  /** Derived currently selected inspection object (or null) */
  const currentInspection = inspections.find(i => i.id === currentInspectionId) || null;

  /**
   * createInspection(payload)
   * - payload: { venueId?, venueName?, createdBy?, updatedBy?, status? }
   * - Returns: Promise<Inspection> (the created inspection)
   * - Side effects: POST to `API.inspectionsCreate`, normalizes response,
   *   appends to `inspections`, and selects the created inspection.
   * - Throws: if the network request returns non-OK status.
   *
   * Usage:
   *   const created = await createInspection({ venueId: 'v1', createdBy: 'Alice' });
   */
  const createInspection = useCallback(async (payload: { venueId?: string; venueName?: string; createdBy?: string } ) => {
    setIsCreating(true);
    try {
      const inspectionId = generateInspectionId();
      const body = {
        action: 'create_inspection',
        inspection: {
          inspection_id: inspectionId,
          venueId: payload.venueId,
          venueName: payload.venueName,
          createdBy: payload.createdBy,
          status: 'in-progress',
        },
      };

      const res = await fetch(API.inspectionsCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to create inspection');

      const data = await res.json();
      const realBody = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
      const createdRaw = realBody.inspectionData || realBody.inspection || realBody;
      const created = normalizeInspection(createdRaw || { inspection_id: inspectionId, venueId: payload.venueId, venueName: payload.venueName, createdBy: payload.createdBy, status: 'in-progress' });

      setInspections(prev => [...prev, created]);
      setCurrentInspectionId(created.id);
      return created;
    } finally {
      setIsCreating(false);
    }
  }, []);

  /**
   * updateInspection(id, updates)
   * - Synchronously apply partial updates to the inspection identified by `id`.
   * - Note: This does not persist to the server. Use this for optimistic UI updates
   *   or when the caller is responsible for persistence.
   */
  const updateInspection = useCallback((id: string, updates: Partial<Inspection>) => {
    setInspections(prev => prev.map(insp => (insp.id === id ? { ...insp, ...updates } : insp)));
  }, []);

  /**
   * setVenueForCurrentInspection(venue)
   * - Update the current inspection with venue details (venueId, venueName) and mark in-progress
   */
  const setVenueForCurrentInspection = useCallback((venue: { id: string; name: string }) => {
    if (!venue) return;
    setInspections(prev => prev.map(insp => (insp.id === currentInspectionId ? { ...insp, venueId: venue.id, venueName: venue.name, status: (insp.status || 'in-progress') } : insp)));
  }, [currentInspectionId]);

  /**
   * setRoomForCurrentInspection(room)
   * - Update the current inspection with room details (roomId, roomName)
   */
  const setRoomForCurrentInspection = useCallback((room: { id: string; name: string }) => {
    if (!room) return;
    setInspections(prev => prev.map(insp => (insp.id === currentInspectionId ? { ...insp, roomId: room.id, roomName: room.name } : insp)));
  }, [currentInspectionId]);

  /**
   * deleteInspection(id)
   * - Remove the inspection from local state. If the deleted inspection was selected,
   *   clear the selection.
   */
  const deleteInspection = useCallback((id: string) => {
    setInspections(prev => prev.filter(i => i.id !== id));
    setCurrentInspectionId(prev => (prev === id ? null : prev));
  }, []);

  /**
   * selectInspection(id)
   * - Set the currently selected inspection id (or null to clear selection).
   */
  const selectInspection = useCallback((id: string | null) => {
    setCurrentInspectionId(id);
  }, []);

  return {
    inspections,
    currentInspection,
    currentInspectionId,
    isCreating,
    createInspection,
    updateInspection,
    setVenueForCurrentInspection,
    setRoomForCurrentInspection,
    deleteInspection,
    selectInspection,
    setInspections,
  } as const;
}
