import { useState, useCallback } from 'react';
import type { Venue, Room } from '../types/venue';
import { API } from '../config/api';
import { normalizeVenue } from '../utils/normalizers';

/**
 * useVenues - manages venue collection and selection
 * - fetchVenues(): load venues from backend and normalize them
 * - selectVenue/Room: local selection helpers
 * - saveVenue: create or update a venue in local state (and optionally server)
 * - deleteVenue: delete a venue (optimistic local change, calls API)
 */
export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [pendingVenueId, setPendingVenueId] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    try {
      const res = await fetch(API.venuesQuery, { method: 'GET' });
      if (!res.ok) throw new Error('Failed to fetch venues');
      const data = await res.json();
      const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
      const items = body.venues || body.Items || body || [];
      setVenues(items.map((v: any) => normalizeVenue(v)));
      return items;
    } catch (e) {
      console.warn('useVenues.fetchVenues failed', e);
      throw e;
    }
  }, []);

  const selectVenue = useCallback((v: Venue | null) => {
    setSelectedVenue(v);
    if (!v) setSelectedRoom(null);
  }, []);

  const selectRoom = useCallback((r: Room | null) => {
    setSelectedRoom(r);
  }, []);

  const saveVenue = useCallback(async (venue: Venue, isEdit?: boolean) => {
    // optimistic local update
    if (!isEdit) {
      setVenues(prev => [...prev, venue]);
      return venue;
    }

    setVenues(prev => prev.map(v => v.id === venue.id ? venue : v));
    return venue;
  }, []);

  const deleteVenue = useCallback(async (venueId: string) => {
    // optimistic removal
    const original = venues;
    setVenues(prev => prev.filter(v => v.id !== venueId));

    try {
      const res = await fetch(API.venuesCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_venue', venueId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete venue: ${res.status} ${text}`);
      }
      const data = await res.json();
      return data;
    } catch (e) {
      // revert
      setVenues(original);
      console.warn('deleteVenue failed; reverted local venues', e);
      throw e;
    }
  }, [venues]);

  return {
    venues,
    selectedVenue,
    selectedRoom,
    pendingVenueId,
    fetchVenues,
    selectVenue,
    selectRoom,
    deleteVenue,
    saveVenue,
    setVenues,
    setPendingVenueId,
  } as const;
}
