import React from 'react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import type { Venue, Room } from '../types/venue';
import type { Inspection } from '../types/inspection';
import { useEffect, useState } from 'react';
import { getInspectionsPartitioned } from '../utils/inspectionApi';

import { getVenueById } from '../utils/venueApi';
import LoadingOverlay from './LoadingOverlay';
import FadeIn from 'react-fade-in';

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
  // Track whether we have a server-provided per-room breakdown so temporary missing data won't clear authoritative per-room counts
  const serverByRoomSet = React.useRef(false);
  // Keep raw server byRoom so we can remap to venue room ids when venue loads
  const rawServerByRoomRef = React.useRef<Record<string, any> | null>(null);

  // Loading states for consistent overlay UX
  const [venueLoading, setVenueLoading] = useState<boolean>(false);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  // Simple mapping: match server byRoom keys to venue room ids using exact, suffix, or stripped comparisons
  const simpleMapByRoomToVenue = (rawByRoom: Record<string, any>, rooms: Room[] | undefined) => {
    if (!rooms || !rawByRoom) return {};
    const mapped: Record<string, any> = {};
    const rawKeys = Object.keys(rawByRoom || {});

    const stripPrefix = (s: string) => String(s || '').replace(/^room[_-]/i, '').replace(/^r[_-]/i, '');

    for (const r of rooms) {
      const rid = String((r as any).id || (r as any).roomId || r.id);
      const sr = stripPrefix(rid).toLowerCase();
      // 1. normalized stripped exact
      let foundKey = rawKeys.find(k => stripPrefix(k).toLowerCase() === sr);
      // 2. exact
      if (!foundKey) foundKey = rawKeys.find(k => k === rid);
      // 3. suffix match
      if (!foundKey) foundKey = rawKeys.find(k => k.endsWith(rid));
      // 4. includes (raw key contains rid)
      if (!foundKey) foundKey = rawKeys.find(k => k.includes(rid));
      // 5. normalized includes (stripped key contains stripped rid)
      if (!foundKey) foundKey = rawKeys.find(k => stripPrefix(k).toLowerCase().includes(sr) || sr.includes(stripPrefix(k).toLowerCase()));
      if (foundKey) mapped[rid] = rawByRoom[foundKey];
    }

    console.debug('[RoomList] simple mapped byRoom keys -> venue ids:', Object.keys(mapped));
    return mapped;
  };

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
        setVenueLoading(true);
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
      } finally {
        setVenueLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [venueId, propVenue, inspectionId, inspections]);



  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSummaryLoading(true);
      try {
        if (!inspectionId) {
          serverByRoomSet.current = false;
          setRoomCounts({});
          setSummaryTotals(null);
          return;
        }

        try {
          const body = await getInspectionsPartitioned();
          console.debug('[RoomList] partitioned body:', body);
          if (!body) {
            // If we previously received a server byRoom, don't clear authoritative per-room counts on transient missing body
            if (!serverByRoomSet.current) {
              setRoomCounts({});
              setSummaryTotals(null);
            }
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
          console.debug('[RoomList] found summary in partitioned candidates:', found);
          if (found) {
            console.debug('[RoomList] server byRoom keys:', found.byRoom ? Object.keys(found.byRoom) : 'none', 'venue room ids:', (venue?.rooms || []).map(r => r.id));
            // Prefer using server-provided totals if present
            if (found.totals) { setSummaryTotals(found.totals || null); }

            // Use byRoom when available; when missing, preserve previously-set authoritative byRoom if present
            if (found.byRoom) {
              rawServerByRoomRef.current = found.byRoom || {};
              // If venue is loaded, map server keys to venue room ids; otherwise attempt to fetch venue immediately to map
              if (venue && venue.rooms && venue.rooms.length > 0) {
                const mapped = simpleMapByRoomToVenue(found.byRoom || {}, venue.rooms as Room[]);
                setRoomCounts(mapped);
                serverByRoomSet.current = true;
              } else {
                // attempt to fetch venue by id and map immediately (avoids timing issues where venue state isn't updated yet)
                try {
                  const vid = found.venueId || found.venue_id || (found.raw && (found.raw.venueId || found.raw.venue_id));
                  if (vid) {
                    const v = await getVenueById(String(vid));
                    if (v && v.rooms && v.rooms.length > 0) {
                      const mapped = simpleMapByRoomToVenue(found.byRoom || {}, (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })) as Room[]);
                      setRoomCounts(mapped);
                      // update cached venue so UI uses same room ids
                      const mappedVenue = { id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || '', updatedAt: v.updatedAt || v.createdAt || '', createdBy: v.createdBy || '' } as Venue;
                      setVenue(mappedVenue);
                      if (typeof onVenueLoaded === 'function') onVenueLoaded(mappedVenue);
                      serverByRoomSet.current = true;
                      return;
                    }
                  }
                } catch (e) {
                  console.warn('[RoomList] failed to fetch venue for immediate mapping', e);
                }

                // Fallback: store raw counts (will be remapped when venue loads)
                setRoomCounts(found.byRoom || {});
                serverByRoomSet.current = true;
              }
              return;
            } else {
              if (!serverByRoomSet.current) {
                // we never had authoritative byRoom; ensure no data is present
                setRoomCounts({});
              }
              // keep summaryTotals if present (we already set it above)
              return;
            }
          }

          // If no summary available at all, reset everything
          serverByRoomSet.current = false;
          setRoomCounts({});
          setSummaryTotals(null);
        } catch (e) {
          console.warn('Failed to load inspections partitioned body', e);
          // Be conservative on error: do not wipe authoritative byRoom
          if (!serverByRoomSet.current) {
            setRoomCounts({});
            setSummaryTotals(null);
          }
        }
      } finally {
        setSummaryLoading(false);
      }
    };

    load();

    const onSaved = () => { if (!cancelled) load(); };
    const onLoaded = (ev: any) => { if (!cancelled) load(); };
    window.addEventListener('inspectionSaved', onSaved as EventListener);
    window.addEventListener('inspectionsLoaded', onLoaded as EventListener);

    return () => { cancelled = true; window.removeEventListener('inspectionSaved', onSaved as EventListener); window.removeEventListener('inspectionsLoaded', onLoaded as EventListener); };
  }, [inspectionId]);

  // When venue becomes available, remap any raw server byRoom to venue room ids
  useEffect(() => {
    if (!venue || !rawServerByRoomRef.current) return;
    try {
      const mapped = simpleMapByRoomToVenue(rawServerByRoomRef.current, venue.rooms as Room[]);
      setRoomCounts(mapped);
      serverByRoomSet.current = true;
    } catch (e) {
      console.warn('Failed to remap server byRoom to venue rooms', e);
    }
  }, [venue]);

  const isRoomInspected = (roomId: string) => {
    // Only use server-provided per-room counts as the source of truth
    if (!serverByRoomSet.current) return false;
    const counts = roomCounts[roomId];
    if (counts) {
      // Consider a room inspected only when we have items and ALL of them are 'pass'
      return counts.total > 0 && counts.pass === counts.total;
    }
    return false;
  };

  const inspectedCount = serverByRoomSet.current ? (venue?.rooms || []).filter((room) => isRoomInspected(room.id)).length : 0;

  // Effective aggregate totals are only present when server supplies them. No client-side fallbacks.
  const effectiveTotals = summaryTotals || null;

  // Progress percentage to render for progress bar
  const progressPercent = (() => {
    try {
      if (serverByRoomSet.current) return ((inspectedCount / (venue!.rooms.length || 1)) * 100);
      if (effectiveTotals && effectiveTotals.total) return (((effectiveTotals.pass + effectiveTotals.fail + effectiveTotals.na) / effectiveTotals.total) * 100);
      return 0;
    } catch (e) {
      return 0;
    }
  })();

  // If venue is not yet loaded, show the standard LoadingOverlay and a simple note
  if (!venue) {
    return (
      <div className="min-h-screen bg-white">
        <LoadingOverlay visible={true} message={"Loading venue…"} />
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
      <LoadingOverlay visible={venueLoading || summaryLoading} message={venueLoading ? 'Loading venue…' : 'Loading…'} />
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
            {serverByRoomSet.current ? (
              <div className="text-gray-900 text-sm lg:text-base"><NumberFlow value={inspectedCount} className="inline-block" /> / <NumberFlow value={venue!.rooms.length} className="inline-block" /></div>
            ) : (
              // No per-room breakdown available — show placeholders (server is the single source of truth)
              <div className="text-gray-900 text-sm lg:text-base">— / —</div>
            )}
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 lg:h-3 mb-3">
            <div
              className="bg-green-500 h-2 lg:h-3 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }} />
          </div>

          {/* Aggregate summary (left, below progress bar) */}
          {effectiveTotals ? (
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Pass: <NumberFlow value={effectiveTotals.pass ?? null} className="inline-block" /></span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-gray-700">Fail: <NumberFlow value={effectiveTotals.fail ?? null} className="inline-block" /></span>
              </div>
              <div className="flex items-center gap-2">
                <MinusCircle className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">NA: <NumberFlow value={effectiveTotals.na ?? null} className="inline-block" /></span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                <span className="text-gray-700">Pending: <NumberFlow value={effectiveTotals.pending ?? null} className="inline-block" /></span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Rooms List */}
        <div className="p-4 lg:p-6">
          <h2 className="text-gray-500 text-sm lg:text-base uppercase tracking-wide mb-4 lg:mb-6">Rooms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
            {venue!.rooms.map((room, idx) => {
              const inspected = isRoomInspected(room.id);
              return (
                <button key={room.id}
                  onClick={() => onRoomSelect(room)}
                  className={`text-left p-4 lg:p-6 border rounded-lg transition-all ${
                    inspected
                      ? 'border-green-300 bg-green-50 hover:bg-green-100'
                      : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                  }`}>
                  <FadeIn delay={80 + idx * 40} transitionDuration={300}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 lg:mb-2">
                          <h3 className="text-gray-900 text-base lg:text-lg">{room.name}</h3>

                          {/* Per-room pass/fail/pending badges
                               - If no DB counts exist for the room, default to pending = number of defined items */}
                          {(() => {
                            // While waiting for server data, show all counts as 0
                            const counts = roomCounts[room.id] || { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
                            return (
                              <div className="ml-3 text-xs flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  <span className="text-gray-700"><NumberFlow value={counts.pass ?? null} className="inline-block" /></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <XCircle className="w-4 h-4 text-red-600" />
                                  <span className="text-gray-700"><NumberFlow value={counts.fail ?? null} className="inline-block" /></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <MinusCircle className="w-4 h-4 text-gray-400" />
                                  <span className="text-gray-700"><NumberFlow value={counts.na ?? null} className="inline-block" /></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4 text-yellow-500" />
                                  <span className="text-gray-700"><NumberFlow value={counts.pending ?? null} className="inline-block" /></span>
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
                  </FadeIn>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
