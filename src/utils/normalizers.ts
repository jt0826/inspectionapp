import type { Inspection, InspectionItem } from '../types/inspection';

export function normalizeInspection(raw: any): Inspection {
  return {
    id: raw.inspection_id || raw.id || '',
    venueId: raw.venueId || raw.venue_id || raw.venue || '',
    venueName: raw.venueName || raw.venue_name || '',
    roomId: raw.roomId || raw.room_id || raw.room || '',
    roomName: raw.roomName || raw.room_name || '',
    inspectorName: raw.inspectorName || raw.createdBy || raw.created_by || raw.inspector_name || '',
    status: (raw.status || 'in-progress') as any,
    createdAt: raw.createdAt || raw.created_at || raw.timestamp || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    completedAt: raw.completedAt || raw.completed_at || undefined,
    items: (raw.items || []).map((it: any) => normalizeInspectionItem(it)),
    totals: raw.totals || undefined,
  } as Inspection;
}

export function normalizeInspectionItem(raw: any): InspectionItem {
  return {
    id: raw.itemId || raw.id || raw.ItemId || '',
    name: raw.itemName || raw.item || raw.ItemName || raw.name || '',
    status: (raw.status || null) as any,
    notes: raw.comments || raw.notes || '',
    photos: raw.photos || [],
  } as InspectionItem;
}

// Venue normalizers
export function normalizeVenue(raw: any) {
  return {
    id: raw.venueId || raw.id || '',
    name: raw.name || '',
    address: raw.address || '',
    rooms: (raw.rooms || []).map(normalizeRoom),
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || raw.createdAt || '',
    createdBy: raw.createdBy || '',
  };
}

export function normalizeRoom(raw: any) {
  return {
    id: raw.roomId || raw.id || '',
    name: raw.name || '',
    items: (raw.items || []).map((it: any) => ({ id: it.itemId || it.id || '', name: it.name || it.item || '' })),
  };
}
