import React from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Venue, Room, Inspection } from '@/App';
import { useEffect, useState } from 'react';
import { getInspectionSummary } from '../utils/inspectionApi';
import { computeExpectedTotalsFromVenue, computeExpectedByRoomFromVenue } from '../utils/inspectionHelpers';

interface RoomListProps {
  venue: Venue;
  onRoomSelect: (room: Room) => void;
  onBack: () => void;
  inspections: Inspection[];
  inspectionId?: string | null;
}

export function RoomList({ venue, onRoomSelect, onBack, inspections, inspectionId }: RoomListProps) {
  const [roomCounts, setRoomCounts] = useState<Record<string, { pass: number; fail: number; na: number; pending: number; total: number }>>({});
  const [summaryTotals, setSummaryTotals] = useState<{ pass: number; fail: number; na: number; pending: number; total: number } | null>(null);



  useEffect(() => {
    const load = async () => {
      if (!inspectionId) {
        setRoomCounts({});
        setSummaryTotals(null);
        return;
      }

      // Seed optimistic totals from venue to avoid flicker while we fetch
      try {
        const optimisticTotals = computeExpectedTotalsFromVenue(venue);
        const optimisticByRoom = computeExpectedByRoomFromVenue(venue);
        setRoomCounts(optimisticByRoom);
        setSummaryTotals(optimisticTotals);
      } catch (e) {
        // ignore
      }

      try {
        const summary = await getInspectionSummary(inspectionId);
        if (summary && summary.byRoom) {
          // Enrich totals with expected items according to the venue definition
          const expectedTotal = (venue?.rooms || []).reduce((s: number, r: any) => s + ((r.items || []).length || 0), 0);
          const totals = JSON.parse(JSON.stringify(summary.totals || { pass: 0, fail: 0, na: 0, pending: 0, total: 0 }));
          const known = (totals.pass || 0) + (totals.fail || 0) + (totals.na || 0);
          totals.pending = Math.max(0, expectedTotal - known);
          totals.total = known + totals.pending;

          // Ensure per-room entries exist for rooms with no DB rows and default them to pending
          const byRoom = { ...(summary.byRoom || {}) } as Record<string, any>;
          (venue?.rooms || []).forEach((r: any) => {
            if (!byRoom[r.id]) {
              byRoom[r.id] = { pass: 0, fail: 0, na: 0, pending: (r.items || []).length || 0, total: (r.items || []).length || 0 };
            }
          });

          setRoomCounts(byRoom);
          setSummaryTotals(totals);
          return;
        }

        // fallback: query raw items and compute
        const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_inspection', inspection_id: inspectionId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const items = data.items || (data.body ? (JSON.parse(data.body).items || []) : []);
        const map: Record<string, { pass: number; fail: number; na: number; pending: number; total: number }> = {};
        const totals = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
        for (const it of items) {
          const rid = it.roomId || it.room_id || it.room || '';
          if (!rid) continue;
          map[rid] = map[rid] || { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
          const status = (it.status || '').toLowerCase();
          if (status === 'pass') { map[rid].pass++; totals.pass++; }
          else if (status === 'fail') { map[rid].fail++; totals.fail++; }
          else if (status === 'na') { map[rid].na++; totals.na++; }
          else { map[rid].pending++; totals.pending++; }
          map[rid].total += 1;
          totals.total += 1;
        }
        // Enrich totals with expected venue item counts and ensure per-room defaults
        try {
          const expectedTotal = (venue?.rooms || []).reduce((s: number, r: any) => s + ((r.items || []).length || 0), 0);
          const known = (totals.pass || 0) + (totals.fail || 0) + (totals.na || 0);
          totals.pending = Math.max(0, expectedTotal - known);
          totals.total = known + totals.pending;

          (venue?.rooms || []).forEach((r: any) => {
            if (!map[r.id]) {
              map[r.id] = { pass: 0, fail: 0, na: 0, pending: (r.items || []).length || 0, total: (r.items || []).length || 0 };
            }
          });
        } catch (e) {
          console.warn('Failed to enrich fallback totals with venue data', e);
        }

        // Merge the computed per-room defaults with any optimistic pre-seed so we don't wipe existing optimistic state structure
        setRoomCounts((prev) => ({ ...(prev || {}), ...(map || {}) }));
        setSummaryTotals(totals);
      } catch (e) {
        console.warn('Failed to load inspection summary or items:', e);
      }
    };

    load();
  }, [inspectionId, venue?.id]);

  const isRoomInspected = (roomId: string) => {
    const counts = roomCounts[roomId];
    if (counts) {
      // Consider a room inspected only when we have items and ALL of them are 'pass'
      return counts.total > 0 && counts.pass === counts.total;
    }
    // fallback to local inspections if no summary available: require all items to be 'pass'
    return inspections.some((inspection) => {
      if (inspection.venueId !== venue.id || inspection.roomId !== roomId) return false;
      const items = inspection.items || [];
      if (items.length === 0) return false;
      // Normalize status to be case-insensitive and robust to missing fields
      return items.every(it => ((it.status || '').toString().toLowerCase() === 'pass'));
    });
  };

  const inspectedCount = venue.rooms.filter((room) => isRoomInspected(room.id)).length;

  // Compute an effective aggregate totals to show at the top.
  const effectiveTotals = (() => {
    if (summaryTotals) return summaryTotals;
    const totals = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
    for (const r of (venue.rooms || [])) {
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
            <div className="text-gray-900 text-sm lg:text-base">{inspectedCount} / {venue.rooms.length}</div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 lg:h-3 mb-3">
            <div
              className="bg-green-500 h-2 lg:h-3 rounded-full transition-all"
              style={{ width: `${(inspectedCount / venue.rooms.length) * 100}%` }}
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
            {venue.rooms.map((room) => {
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
                          const counts = roomCounts[room.id] || { pass: 0, fail: 0, pending: (hasRoomItems ? (room.items || []).length : 0) };
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
