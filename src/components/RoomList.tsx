import React from 'react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';
import { Venue, Room, Inspection } from '@/App';
import { useEffect, useState } from 'react';
import { getInspectionsPartitioned } from '../utils/inspectionApi';

import { getVenueById } from '../utils/venueApi';

interface RoomListProps {
  venue?: Venue | null;
  venueId?: string | null; // optional - if provided and `venue` not passed, RoomList will fetch venue
  onRoomSelect: (room: Room) => void;
  onBack: () => void;
  inspections: Inspection[];
  inspectionId?: string | null;
  onVenueLoaded?: (venue: Venue) => void;
}

export function RoomList({ venue: propVenue, venueId, onRoomSelect, onBack, inspections, inspectionId, onVenueLoaded }: RoomListProps) {
  const [venue, setVenue] = useState<Venue | null>(propVenue || null);
  const [roomCounts, setRoomCounts] = useState<Record<string, { pass: number; fail: number; na: number; pending: number; total: number }>>({});
  const [summaryTotals, setSummaryTotals] = useState<{ pass: number; fail: number; na: number; pending: number; total: number } | null>(null);

  // If a venueId was provided but no venue prop, fetch the venue on mount or when related props change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (venue) return;
      let vid = venueId || (propVenue && (propVenue.id || (propVenue as any).venueId));
      // If vid still not found, try to derive it from the inspections prop using inspectionId
      if (!vid && inspectionId) {
        try {
          const found = (inspections || []).find((i: any) => String(i.id || i.inspection_id || '') === String(inspectionId));
          if (found) vid = found.venueId || null;
          if (vid) console.log('[RoomList] derived venueId from inspections prop:', vid);
        } catch (e) {
          // ignore
        }
      }

      if (!vid) {
        console.log('[RoomList] no venueId or propVenue provided; skipping venue fetch');
        return;
      }

      console.log('[RoomList] attempting to load venue for id:', vid);
      try {
        const v = await getVenueById(String(vid));
        console.log('[RoomList] getVenueById result for', vid, v);
        if (cancelled) return;
        if (v) {

        const mapped = { id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || '', updatedAt: v.updatedAt || v.createdAt || '', createdBy: v.createdBy || '' } as Venue;
          setVenue(mapped);
          if (typeof onVenueLoaded === 'function') onVenueLoaded(mapped);
        }
      } catch (e) {
        console.warn('Failed to load venue for RoomList', e);
      }
    })();
    return () => { cancelled = true; };
  }, [venueId, propVenue, inspectionId, inspections]);



  useEffect(() => {
    const load = async () => {
      if (!inspectionId) {
        setRoomCounts({});
        setSummaryTotals(null);
        return;
      }

      try {
        const body = await getInspectionsPartitioned();
        if (!body) {
          setRoomCounts({});
          setSummaryTotals(null);
          return;
        }

        // Find the inspection summary in the partitioned body (it may be in 'inspections', 'completed' or top-level array)
        const candidates: any[] = [];
        if (Array.isArray(body.inspections)) candidates.push(...body.inspections);
        if (Array.isArray(body.completed)) candidates.push(...body.completed);
        if (Array.isArray(body.ongoing)) candidates.push(...body.ongoing);
        // Also consider top-level 'items' for older payload shapes
        if (Array.isArray(body)) candidates.push(...body as any[]);

        const found = candidates.find((c: any) => String(c.inspection_id || c.id || '') === String(inspectionId));
        if (found && found.byRoom && found.totals) {
          // Use server-provided byRoom and totals directly — no enrichment
          const byRoom = found.byRoom || {};
          setRoomCounts(byRoom);
          setSummaryTotals(found.totals || null);
          return;
        }

        // If server did not return a summary for this inspection, clear
        setRoomCounts({});
        setSummaryTotals(null);
      } catch (e) {
        console.warn('Failed to load inspections partitioned body', e);
        setRoomCounts({});
        setSummaryTotals(null);
      }
    };

    load();
  }, [inspectionId]);

  const isRoomInspected = (roomId: string) => {
    const counts = roomCounts[roomId];
    if (counts) {
      // Consider a room inspected only when we have items and ALL of them are 'pass'
      return counts.total > 0 && counts.pass === counts.total;
    }
    // fallback to local inspections if no summary available: require all items to be 'pass'
    return inspections.some((inspection) => {
      // Defensive: if venue is not loaded, we cannot rely on inspection.venueId; just check by roomId
      if (venue && (inspection.venueId !== venue.id || inspection.roomId !== roomId)) return false;
      const items = inspection.items || [];
      if (items.length === 0) return false;
      // Normalize status to be case-insensitive and robust to missing fields
      return items.every(it => ((it.status || '').toString().toLowerCase() === 'pass'));
    });
  };

  const inspectedCount = (venue?.rooms || []).filter((room) => isRoomInspected(room.id)).length;

  // Compute an effective aggregate totals to show at the top.
  const effectiveTotals = (() => {
    if (summaryTotals) return summaryTotals;
    const totals = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
    for (const r of (venue?.rooms || [])) {
      const counts = roomCounts[r.id];
      if (counts) {
        totals.pass += counts.pass || 0;
        totals.fail += counts.fail || 0;
        totals.na += counts.na || 0;
        totals.pending += counts.pending || 0;
        totals.total += counts.total || 0;
      } else {
        // No DB counts for this room; default pending to number of defined items
        const expected = (r.items || []).length || 0;
        totals.pending += expected;
        totals.total += expected;
      }
    }
    return totals;
  })();

  // If venue is not yet loaded, show a small loading state instead of crashing
  if (!venue) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-blue-600 text-white p-6 lg:p-8 mb-4">
            <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 lg:mb-6 text-sm lg:text-base">
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
              <span>Back to Home</span>
            </button>
            <h1 className="mb-2 text-xl lg:text-3xl">Loading venue…</h1>
            <p className="text-blue-100 text-sm lg:text-base">Fetching venue details</p>
          </div>
          <div className="text-center py-12 lg:py-16 text-gray-500">
            <p className="text-sm lg:text-base">This inspection references a venue that is not yet loaded. If loading takes too long, try opening Manage Venues to refresh the venue list.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 lg:mb-6 text-sm lg:text-base">
            <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
            <span>Back to Home</span>
          </button>
          <h1 className="mb-2 text-xl lg:text-3xl">{venue.name}</h1>
          <p className="text-blue-100 text-sm lg:text-base">{venue.address}</p>
        </div>

        {/* Progress */}
        <div className="p-4 lg:p-6 bg-gray-50 border-b">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <span className="text-gray-700 text-sm lg:text-base">Progress</span>
            <div className="text-gray-900 text-sm lg:text-base">{inspectedCount} / {venue!.rooms.length}</div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 lg:h-3 mb-3">
            <div
              className="bg-green-500 h-2 lg:h-3 rounded-full transition-all"
              style={{ width: `${(inspectedCount / (venue!.rooms.length || 1)) * 100}%` }}
            />
          </div>

          {/* Aggregate summary (left, below progress bar) */}
          {effectiveTotals && (
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Pass: {effectiveTotals.pass}</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-gray-700">Fail: {effectiveTotals.fail}</span>
              </div>
              <div className="flex items-center gap-2">
                <MinusCircle className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">NA: {effectiveTotals.na}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                <span className="text-gray-700">Pending: {effectiveTotals.pending}</span>
              </div>
            </div>
          )} 
        </div>

        {/* Rooms List */}
        <div className="p-4 lg:p-6">
          <h2 className="text-gray-500 text-sm lg:text-base uppercase tracking-wide mb-4 lg:mb-6">Rooms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
            {venue!.rooms.map((room) => {
              const inspected = isRoomInspected(room.id);
              return (
                <button
                  key={room.id}
                  onClick={() => onRoomSelect(room)}
                  className={`text-left p-4 lg:p-6 border rounded-lg transition-all ${
                    inspected
                      ? 'border-green-300 bg-green-50 hover:bg-green-100'
                      : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 lg:mb-2">
                        <h3 className="text-gray-900 text-base lg:text-lg">{room.name}</h3>

                        {/* Per-room pass/fail/pending badges
                             - If no DB counts exist for the room, default to pending = number of defined items */}
                        {(() => {
                          const hasRoomItems = Array.isArray(room.items) && room.items.length > 0;
                          const counts = roomCounts[room.id] || { pass: 0, fail: 0, na: 0, pending: (hasRoomItems ? (room.items || []).length : 0), total: (hasRoomItems ? (room.items || []).length : 0) };
                          // If no items and no counts, don't render badges
                          if (!hasRoomItems && !roomCounts[room.id]) return null;
                          return (
                            <div className="ml-3 text-xs flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <span className="text-gray-700">{counts.pass}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <XCircle className="w-4 h-4 text-red-600" />
                                <span className="text-gray-700">{counts.fail}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MinusCircle className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-700">{counts.na}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4 text-yellow-500" />
                                <span className="text-gray-700">{counts.pending}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-gray-600 text-sm lg:text-base">
                        {(room.items?.length) ? `${room.items.length} item${room.items.length !== 1 ? 's' : ''}` : 'No items'}
                      </div>
                    </div>

                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
