import { useState, useCallback } from 'react';
import type { Inspection } from '../types/inspection';
import { normalizeInspection } from '../utils/normalizers';
import { API } from '../config/api';
import { generateInspectionId } from '../utils/id';

export function useInspections() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const currentInspection = inspections.find(i => i.id === currentInspectionId) || null;

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

  const updateInspection = useCallback((id: string, updates: Partial<Inspection>) => {
    setInspections(prev => prev.map(insp => (insp.id === id ? { ...insp, ...updates } : insp)));
  }, []);

  const deleteInspection = useCallback((id: string) => {
    setInspections(prev => prev.filter(i => i.id !== id));
    setCurrentInspectionId(prev => (prev === id ? null : prev));
  }, []);

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
    deleteInspection,
    selectInspection,
    setInspections,
  } as const;
}
