import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, Plus, History, User, Building2, LogOut, Clock, AlertCircle, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { Inspection } from '../App';
import { getInspectionSummary, checkInspectionComplete, getInspectionItems } from '../utils/inspectionApi';
import NumberFlow from '@number-flow/react';
import FadeInText from './FadeInText';
import { computeExpectedTotalsFromVenue, computeExpectedByRoomFromVenue } from '../utils/inspectionHelpers';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastProvider';
import FadeIn from 'react-fade-in';

type Room = { id?: string; roomId?: string; items?: Record<string, unknown>[]; name?: string };
type Venue = { id?: string; venueId?: string; name?: string; rooms?: Room[] };
type CompletionResult = { complete?: boolean; missing?: unknown[]; total_expected?: number };

interface InspectorHomeProps {
  inspections: Inspection[];
  venues?: (Record<string, unknown> | Venue)[];
  onCreateNewInspection: () => void;
  onResumeInspection: (inspection: string | Record<string, unknown>) => void;
  onViewHistory: () => void;
  onViewProfile: () => void;
  onManageVenues: () => void;
  onDeleteInspection: (inspectionId: string) => void;
}

export function InspectorHome({
  inspections,
  venues,
  onCreateNewInspection,
  onResumeInspection,
  onViewHistory,
  onViewProfile,
  onManageVenues,
  onDeleteInspection,
}: InspectorHomeProps) {
  const { user, logout } = useAuth();
  const propsVenues = venues || [];

  const [dynamoInspections, setDynamoInspections] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [venuesMap, setVenuesMap] = useState<Record<string, string>>({});
  const [inspectionSummaries, setInspectionSummaries] = useState<Record<string, unknown>>({});
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Local UI state for delete flow
  const [deleting, setDeleting] = useState(false);
  const { show, confirm } = useToast();
  const [activeCount, setActiveCount] = useState<number | null>(null);

  // Helper: tolerant accessor for fields that may be present under different names
  const pick = (rec: Record<string, unknown> | null | undefined, ...keys: string[]) => {
    if (!rec) return '';
    for (const k of keys) {
      const v = (rec as any)[k];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return '';
  };

  // Fetch inspections from DynamoDB (reusable)
  const fetchInspections = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_inspections' }),
      });

      const data = await response.json();
      // API Gateway proxy integration often returns { statusCode, body }
      let inspectionsArray: Record<string, unknown>[] = [];

      if (Array.isArray(data.inspections)) {
        inspectionsArray = data.inspections as Record<string, unknown>[];
      } else if (data.body) {
        // body may be a JSON string
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          inspectionsArray = (parsed.inspections || parsed.Items || []) as Record<string, unknown>[];
        } catch (err) {
          console.warn('Failed to parse response.body as JSON', err);
        }
      } else if (Array.isArray(data)) {
        inspectionsArray = data as Record<string, unknown>[];
      }

      console.log('[Inspections] resolved items count:', inspectionsArray.length, inspectionsArray[0]);
      setDynamoInspections(inspectionsArray);
    } catch (error) {
      console.error('Error fetching inspections:', error);
      setDynamoInspections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch venues from backend to map venueId -> name (if not provided via props)
  const fetchVenues = useCallback(async () => {
    try {
      const res = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_venues' }),
      });
      const data = await res.json();
      let items: Record<string, unknown>[] = [];
      if (Array.isArray(data)) items = data as Record<string, unknown>[];
      else if (Array.isArray(data.venues)) items = data.venues as Record<string, unknown>[];
      else if (data.body) {
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          items = (parsed.venues || parsed.Items || parsed || []) as Record<string, unknown>[];
        } catch (err) {
          console.warn('Failed to parse venues.body', err);
        }
      }

      const map: Record<string, string> = {};
      items.forEach((v: Record<string, unknown>) => {
        const vRec = v as Record<string, unknown>;
        const id = (vRec['venueId'] as string) || (vRec['id'] as string);
        if (id) map[id] = (vRec['name'] as string) || '';
      });
      setVenuesMap(map);
      return map;
    } catch (err) {
      console.error('Failed to fetch venues for mapping:', err);
      setVenuesMap({});
      return {};
    }
  }, []);

  // Build venuesMap from props if supplied
  useEffect(() => {
    if (venues && venues.length > 0) {
      const map: Record<string, string> = {};
      venues.forEach((v: Venue) => {
        const id = v.id || v.venueId;
        if (id) map[String(id)] = v.name || '';
      });
      setVenuesMap(map);
    } else {
      fetchVenues().catch(() => {});
    }
  }, [venues, fetchVenues]);
  useEffect(() => {
    fetchInspections();
    const onFocus = () => { fetchInspections(); };
    const onInspectionSaved = () => { fetchInspections(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('inspectionSaved', onInspectionSaved as EventListener);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('inspectionSaved', onInspectionSaved as EventListener); };
  }, [fetchInspections]);

  // Fetch per-inspection summaries when inspections load
  useEffect(() => {
    const loadSummaries = async () => {
      try {
        const ids: string[] = dynamoInspections.map((i) => String((i as Record<string, unknown>)['inspection_id'] || '')).filter(Boolean);
        const results: Record<string, unknown> = {};

        // Optimistic seed: prefill inspection summaries from venue definitions to avoid flicker on the homepage
        try {
          const optimistic: Record<string, unknown> = {};
          (dynamoInspections || []).forEach((it: Record<string, unknown>) => {
            const itRec = it as Record<string, unknown>;
            const vid = (itRec['venue_id'] as string) || (itRec['venueId'] as string) || (itRec['venue'] as string);
            const venueObj = (venues || []).find((v: Record<string, unknown>) => String(v['id'] || v['venueId']) === String(vid)) || null;
            const totals = computeExpectedTotalsFromVenue(venueObj as unknown as Record<string, unknown>);
            const byRoom = computeExpectedByRoomFromVenue(venueObj as unknown as Record<string, unknown>);
            const key = String(itRec['inspection_id'] || '');
            (optimistic as Record<string, unknown>)[key] = { inspection_id: key, totals, byRoom } as unknown as Record<string, unknown>;
          });
          setInspectionSummaries(optimistic);
        } catch (e) {
          // ignore optimistic seed errors
        }

        // Fetch summaries in parallel to avoid sequential delays that make lastUpdated appear late
        const summariesArray = await Promise.all(ids.map(async (inspectionId: string) => {
          try {
            // Try the summary endpoint first
            let res: any = null;
            try {
              res = await getInspectionSummary(inspectionId);
            } catch (err) {
              console.warn('getInspectionSummary failed', inspectionId, err);
              res = null;
            }

            // If the summary endpoint returned enough data, enrich it with lastUpdated info (compute from items in parallel)
            if (res && res.totals && res.byRoom) {
              let latestTs: string | null = null;
              let latestBy: string | null = null;
              try {
                const items = (await getInspectionItems(inspectionId)) || [];
                for (const it of items) {
                  const itRec = it as Record<string, unknown>;
                  const tsRaw = itRec['updatedAt'] || itRec['updated_at'] || itRec['createdAt'] || itRec['created_at'];
                  const ts = tsRaw ? String(tsRaw) : null;
                  if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) {
                    latestTs = ts;
                    const byRaw = itRec['inspectorName'] || itRec['createdBy'] || itRec['inspector_name'] || itRec['created_by'] || null;
                    latestBy = byRaw ? String(byRaw) : null;
                  }
                }
              } catch (e) {
                console.warn('Failed to fetch items for lastUpdated', inspectionId, e);
              }

              // Ensure totals include pending items expected by venue definition if DB reports fewer items
              try {
                const meta = dynamoInspections.find((d: Record<string, unknown>) => String(d['inspection_id'] || '') === inspectionId) || {};
                const venueId = String((meta as Record<string, unknown>)['venueId'] || (meta as Record<string, unknown>)['venue_id'] || (meta as Record<string, unknown>)['venue'] || '');
                let expectedTotal = 0;
                if (venueId) {
                  const venueObj = (venues || []).find((v: Venue) => String(v.id || v.venueId) === String(venueId));
                  if (venueObj) {
                    const rooms = (venueObj.rooms || []) as Room[];
                    expectedTotal = rooms.reduce((s: number, r: Room) => s + ((r.items || []).length || 0), 0);
                  }
                }
                if (expectedTotal > 0) {
                  const t = res.totals || { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
                  const known = (t.pass || 0) + (t.fail || 0) + (t.na || 0);
                  t.pending = Math.max(0, expectedTotal - known);
                  t.total = known + t.pending;
                  res.totals = t;
                }
              } catch (e) {
                console.warn('Failed to enrich totals with expected items', inspectionId, e);
              }

              return { ...res, inspection_id: inspectionId, lastUpdated: latestTs, lastUpdatedBy: latestBy };
            }

            // Fallback: query raw items and compute totals using centralized helper
            try {
              const items = (await getInspectionItems(inspectionId)) || [];

              const totals = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
              const byRoom: Record<string, { pass: number; fail: number; na: number; pending: number; total: number }> = {};
              let latestTs: string | null = null;
              let latestBy: string | null = null;
              for (const it of items as Record<string, unknown>[]) {
                const itRec = it as Record<string, unknown>;
                const rid = (itRec['roomId'] as string) || (itRec['room_id'] as string) || (itRec['room'] as string) || '';
                if (!rid) continue;
                const status = ((itRec['status'] as string) || 'pending').toString().toLowerCase();
                totals.total += 1;
                if (status === 'pass') totals.pass++;
                else if (status === 'fail') totals.fail++;
                else if (status === 'na') totals.na++;
                else totals.pending++;

                const br = byRoom[rid] || (byRoom[rid] = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 });
                br.total += 1;
                if (status === 'pass') br.pass++;
                else if (status === 'fail') br.fail++;
                else if (status === 'na') br.na++;
                else br.pending++;

                const tsRaw = itRec['updatedAt'] || itRec['updated_at'] || itRec['createdAt'] || itRec['created_at'];
                const ts = tsRaw ? String(tsRaw) : null;
                if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) {
                  latestTs = ts;
                  const byRaw = itRec['inspectorName'] || itRec['createdBy'] || itRec['inspector_name'] || itRec['created_by'] || null;
                  latestBy = byRaw ? String(byRaw) : null;
                }
              }

              // If DB has fewer items than expected by venue definition, default missing ones to pending
              try {
                const meta = dynamoInspections.find((d: Record<string, unknown>) => String(d['inspection_id'] || '') === inspectionId) || {};
                const venueId = String((meta as Record<string, unknown>)['venueId'] || (meta as Record<string, unknown>)['venue_id'] || (meta as Record<string, unknown>)['venue'] || '');
                if (venueId) {
                  const venueObj = (venues || []).find((v: Venue) => String(v.id || v.venueId) === venueId) || null;
                  if (venueObj) {
                    const rooms = (venueObj.rooms || []) as Room[];
                    rooms.forEach((r: Room) => {
                      const rid = String(r.id || r.roomId || '');
                      if (!byRoom[rid]) {
                        byRoom[rid] = { pass: 0, fail: 0, na: 0, pending: ((r.items || []) as Record<string, unknown>[]).length || 0, total: ((r.items || []) as Record<string, unknown>[]).length || 0 };
                      }
                    });

                    const expectedTotal = ((venueObj.rooms || []) as Room[]).reduce((s: number, r: Room) => s + (((r.items || []) as Record<string, unknown>[]).length || 0), 0);
                    const known = (totals.pass || 0) + (totals.fail || 0) + (totals.na || 0);
                    totals.pending = Math.max(0, expectedTotal - known);
                    totals.total = known + totals.pending;
                  }
                }
              } catch (e) {
                console.warn('Failed to enrich fallback totals', inspectionId, e);
              }

              return { inspection_id: inspectionId, totals, byRoom, lastUpdated: latestTs, lastUpdatedBy: latestBy };
            } catch (e) {
              console.warn('Fallback get_inspection failed for', inspectionId, e);
              return null;
            }
          } catch (e) {
            console.warn('summary fetch failed', inspectionId, e);
            return null;
          }
        }));

        // Convert array back to keyed results for the rest of the code
        for (const s of summariesArray) {
          if (s && s.inspection_id) results[String(s.inspection_id)] = s;
        }

        setInspectionSummaries(results);

        // Reconcile incomplete totals: retry fetching items for inspections whose totals are smaller than venue expected
        (async function reconcileTotals() {
          try {
            const toCheck: string[] = [];
            (dynamoInspections || []).forEach((meta) => {
              const id = String((meta as any)['inspection_id'] || '');
              if (!id) return;
              const summary = results[id] as any;

              // determine expected total from venue definition
              let expectedTotal = 0;
              const venueId = String((meta as any)['venueId'] || (meta as any)['venue_id'] || '');
              if (venueId) {
                const venueObj = (venues || []).find((v: Venue) => String((v as any).id || (v as any).venueId) === String(venueId));
                if (venueObj) expectedTotal = ((venueObj.rooms || []) as Room[]).reduce((s, r) => s + (((r.items || []) as any[]).length || 0), 0);
              }

              if (!summary || !summary.totals || (expectedTotal > 0 && (summary.totals.total || 0) < expectedTotal)) {
                toCheck.push(id);
              }
            });

            if (toCheck.length > 0) {
              const maxAttempts = 3;
              for (let attempt = 1; attempt <= maxAttempts && toCheck.length > 0; attempt++) {
                // Backoff between retries
                await new Promise((r) => setTimeout(r, 500 * attempt));
                for (const id of [...toCheck]) {
                  try {
                    const items = (await getInspectionItems(id)) || [];
                    const totals: any = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
                    for (const it of items as Record<string, any>[]) {
                      const status = String((it.status || it.state || 'pending')).toLowerCase();
                      totals.total += 1;
                      if (status === 'pass') totals.pass++;
                      else if (status === 'fail') totals.fail++;
                      else if (status === 'na') totals.na++;
                      else totals.pending++;
                    }

                    // If we know expectedTotal, ensure pending accounts for missing items
                    const meta = dynamoInspections.find((d: any) => String(d['inspection_id'] || '') === id) || {};
                    const venueId = String(meta['venueId'] || meta['venue_id'] || '');
                    let expectedTotal = 0;
                    if (venueId) {
                      const venueObj = (venues || []).find((v: Venue) => String((v as any).id || (v as any).venueId) === String(venueId));
                      if (venueObj) expectedTotal = ((venueObj.rooms || []) as Room[]).reduce((s, r) => s + (((r.items || []) as any[]).length || 0), 0);
                    }
                    if (expectedTotal > 0) {
                      const known = (totals.pass || 0) + (totals.fail || 0) + (totals.na || 0);
                      totals.pending = Math.max(0, expectedTotal - known);
                      totals.total = known + totals.pending;
                    }

                    results[id] = { ...(results[id] || {}), totals };

                    if (expectedTotal > 0 && totals.total >= expectedTotal) {
                      const idx = toCheck.indexOf(id);
                      if (idx >= 0) toCheck.splice(idx, 1);
                    }
                  } catch (e) {
                    // ignore per-inspection errors
                  }
                }
                setInspectionSummaries({ ...results });
              }
            }
          } catch (e) {
            console.warn('Failed to reconcile incomplete totals', e);
          }
        })();

        // Compute active (uncompleted) inspection count by asking backend whether each inspection is complete
        (async () => {
          try {
            const counts = await Promise.all(dynamoInspections.map(async (it: Record<string, unknown>) => {
              const itRec = it as Record<string, unknown>;
              const status = String(itRec['status'] || 'in-progress');
              if (status && status.toString().toLowerCase() === 'completed') return 0; // already completed

              const venueId = (itRec['venue_id'] as string) || (itRec['venueId'] as string) || (itRec['venue'] as string) || '';
              if (!venueId) return 1; // no venue yet -> not complete

              try {
                const c = await checkInspectionComplete(String(itRec['inspection_id'] || ''), String(venueId)) as CompletionResult | null;
                if (c && c.complete === true) return 0;
                return 1;
              } catch (e) {
                console.warn('checkInspectionComplete failed for', itRec['inspection_id'], e);
                return 1;
              }
            }));
            const totalActive = counts.reduce((s: number, v: number) => s + v, 0);
            setActiveCount(totalActive);
            console.log('[Inspections] active count computed', totalActive);
          } catch (e) {
            console.warn('Failed to compute active count', e);
            setActiveCount(null);
          }
        })();
      } catch (e) {
        console.warn('Failed to load inspection summaries', e);
      }
    };
    if (dynamoInspections && dynamoInspections.length > 0) loadSummaries();
  }, [dynamoInspections]);



  const ongoingInspections = dynamoInspections
    .filter((inspection: Record<string, unknown>) => {
      const status = String(inspection['status'] || 'in-progress');
      return status.toLowerCase() !== 'completed' && !completedMap[String(inspection['inspection_id'] || '')];
    })
    .map((inspection: Record<string, unknown>) => {
      const vid = (inspection['venue_id'] as string) || (inspection['venueId'] as string) || (inspection['venue'] as string) || '';
      const venueObj = (venues || []).find((v: Venue) => String(v.id || v.venueId) === vid) || null;
      const venueName = venueObj ? (venueObj.name || '') : (venuesMap[vid] || (inspection['venue_name'] as string) || (inspection['venueName'] as string) || 'Venue not selected');
      const roomObj = venueObj ? (((venueObj.rooms || []) as Room[]).find((r: Room) => String(r.id || r.roomId) === ((inspection['room_id'] as string) || (inspection['roomId'] as string) || ''))) : null;
      const roomName = roomObj ? (roomObj.name || '') : ((inspection['room_name'] as string) || (inspection['roomName'] as string) || '');

      return {
        id: String(inspection['inspection_id'] || ''),
        venueName: String(venueName),
        roomName: String(roomName),
        timestamp: pick(inspection, 'createdAt', 'created_at', 'timestamp', 'createdAt'),
        venueId: String(vid),
        roomId: String((inspection['room_id'] as string) || ''),
        status: String((inspection['status'] as string) || 'draft'),
        items: (inspection['items'] as unknown[]) || [],
        inspectorName: pick(inspection, 'inspectorName', 'createdBy', 'created_by'),
        createdBy: pick(inspection, 'createdBy', 'created_by', 'inspectorName'),
        raw: inspection,
      };
    });



  const formatDate = (dateString?: unknown) => {
    if (!dateString) return '';
    const date = new Date(String(dateString));
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  type Summary = { totals?: { pass?: number; fail?: number; na?: number; pending?: number; total?: number }; byRoom?: Record<string, any>; lastUpdated?: string | null; lastUpdatedBy?: string | null };
  const getSummary = (id?: string): Summary | undefined => {
    if (!id) return undefined;
    return inspectionSummaries[id] as Summary | undefined;
  };

  // Completed inspections list (derived from status or completedMap)
  const completedInspections = dynamoInspections
    .filter((inspection: Record<string, unknown>) => (((String(inspection['status'] || '')).toLowerCase() === 'completed') || completedMap[String(inspection['inspection_id'] || '')]))
    .map((inspection: Record<string, unknown>) => {
      const vid = (inspection['venue_id'] as string) || (inspection['venueId'] as string) || (inspection['venue'] as string) || '';
      const venueObj = (venues || []).find((v: Venue) => String(v.id || v.venueId) === vid) || null;
      const venueName = venueObj ? (venueObj.name || '') : (venuesMap[vid] || (inspection['venue_name'] as string) || (inspection['venueName'] as string) || 'Venue not selected');
      const roomObj = venueObj ? (((venueObj.rooms || []) as Room[]).find((r: Room) => String(r.id || r.roomId) === ((inspection['room_id'] as string) || (inspection['roomId'] as string) || ''))) : null;
      const roomName = roomObj ? (roomObj.name || '') : ((inspection['room_name'] as string) || (inspection['roomName'] as string) || '');

      return {
        id: String(inspection['inspection_id'] || ''),
        venueName: String(venueName),
        roomName: String(roomName),
        timestamp: pick(inspection, 'createdAt', 'created_at', 'timestamp', 'createdAt'),
        updatedAt: pick(inspection, 'updatedAt', 'updated_at', 'timestamp'),
        completedAt: pick(inspection, 'completedAt', 'completed_at', 'updatedAt', 'updated_at'),
        venueId: String(vid),
        roomId: String((inspection['room_id'] as string) || ''),
        status: String((inspection['status'] as string) || 'completed'),
        items: (inspection['items'] as unknown[]) || [],
        inspectorName: pick(inspection, 'inspectorName', 'createdBy', 'created_by'),
        createdBy: pick(inspection, 'createdBy', 'created_by', 'inspectorName'),
        raw: inspection,
      };
    });

  // Show only the most recent N completed inspections on the Home page to avoid clutter
  const MAX_HOME_COMPLETED = 6;

  const filteredCompletedInspections = completedInspections.filter((ins) => {
    const raw = (ins as any).completedAt || (ins as any).updatedAt || (ins as any).timestamp;
    if (!raw) return false;
    const d = new Date(String(raw));
    if (isNaN(d.getTime())) return false;
    if (startDate) {
      const s = new Date(startDate + 'T00:00:00');
      if (d < s) return false;
    }
    if (endDate) {
      const e = new Date(endDate + 'T23:59:59');
      if (d > e) return false;
    }
    return true;
  });

  const displayedCompletedInspections = [...filteredCompletedInspections]
    .sort((a: any, b: any) => new Date((b.completedAt || b.updatedAt || b.timestamp) as string).getTime() - new Date((a.completedAt || a.updatedAt || a.timestamp) as string).getTime())
    .slice(0, MAX_HOME_COMPLETED);

  const getInspectionProgress = (inspection: Inspection) => {
    if (inspection.status === 'draft') return 'Not started';
    if (!inspection.venueId) return 'Venue not selected';
    if (!inspection.roomId) return 'Room not selected';
    if (inspection.items.length === 0) return 'No items checked';
    const completed = inspection.items.filter(i => i.status !== 'pending').length;
    return `${completed}/${inspection.items.length} items`;
  };

  const handleDeleteInspection = async (e: React.MouseEvent, inspection: Record<string, unknown>) => {
    e.stopPropagation();
    const id = String(inspection['id'] || inspection['inspection_id'] || '');
    const confirmed = await confirm({
      title: 'Delete inspection',
      message: `Are you sure you want to delete the inspection for ${inspection.venueName || id}?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setDeleting(true);
    setDeletingIds(prev => [...prev, id]);

    try {
      const token = localStorage.getItem('authToken') || '';

      // Use centralized helper
      const { deleteInspection } = await import('../utils/inspectionApi');
      const result = await deleteInspection(id, token);

      if (!result || !result.ok) {
        console.error('Failed to delete inspection', result);
        show('Failed to delete inspection', { variant: 'error' });
        return;
      }

      const data = result.data;
      const deleted = data && (data.deleted || 0);
      const remaining = data && (data.remaining || 0);

      if (deleted && deleted > 0) {
        setDynamoInspections(prev => prev.filter(item => item.inspection_id !== id));
        onDeleteInspection(id);
        show('Inspection deleted', { variant: 'success' });
      } else if (data && (data.inspectionDataDeleted || data.metaDeleted)) {
        show('Inspection metadata removed', { variant: 'success' });
        setDynamoInspections(prev => prev.filter(item => item.inspection_id !== id));
        onDeleteInspection(id);
      } else {
        console.warn('Delete returned no deletions', data);
        show('Delete completed but no inspection rows were removed', { variant: 'error' });
      }

      try { await fetchInspections(); } catch (refreshErr) { console.warn('Failed to refresh inspections after delete', refreshErr); }
    } catch (err) {
      console.error('Failed to delete inspection:', err);
      show('Failed to delete inspection', { variant: 'error' });
    } finally {
      setDeleting(false);
      setDeletingIds(prev => prev.filter(i => i !== id));
    }
  }; 
  
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 lg:gap-4">
              <ClipboardCheck className="w-8 h-8 lg:w-10 lg:h-10" />
              <div>
                <h1 className="text-xl lg:text-3xl">Facility Inspector</h1>
                <p className="text-blue-100 text-sm lg:text-base">Welcome, {user?.name}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 lg:p-3 text-blue-100 hover:text-white hover:bg-blue-700 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5 lg:w-6 lg:h-6" />
            </button>
          </div>

          {/* User Profile Card */}
          <button
            onClick={onViewProfile}
            className="w-full lg:max-w-md bg-blue-700 hover:bg-blue-800 rounded-lg p-4 lg:p-5 transition-colors text-left"
          >
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="w-12 h-12 lg:w-14 lg:h-14 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-6 h-6 lg:w-7 lg:h-7 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-base lg:text-lg truncate">{user?.name}</p>
                <p className="text-blue-200 text-sm lg:text-base truncate">{user?.role}</p>
                <p className="text-blue-300 text-xs lg:text-sm truncate">{user?.organization}</p>
              </div>
              <div className="text-blue-200 text-xl">→</div>
            </div>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="p-4 lg:p-6 bg-gray-50 border-b">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4">
            <button
              onClick={onCreateNewInspection}
              className="flex items-center justify-center gap-3 p-6 lg:p-8 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all hover:shadow-lg"
            >
              <Plus className="w-6 h-6 lg:w-8 lg:h-8" />
              <span className="text-lg lg:text-xl">New Inspection</span>
            </button>
            
            <button
              onClick={onViewHistory}
              className="flex items-center justify-center gap-3 p-6 lg:p-8 bg-white border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <History className="w-6 h-6 lg:w-8 lg:h-8 text-gray-700" />
              <span className="text-lg lg:text-xl text-gray-900">History</span>
            </button>

            <button
              onClick={onManageVenues}
              className="flex items-center justify-center gap-3 p-6 lg:p-8 bg-white border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <Building2 className="w-6 h-6 lg:w-8 lg:h-8 text-gray-700" />
              <span className="text-lg lg:text-xl text-gray-900">Manage Venues</span>
            </button>
          </div>
        </div>

        {/* Ongoing Inspections */}
        <div className="p-4 lg:p-6">
          <div className="flex items-center justify-between mb-4 lg:mb-6">
            <h2 className="text-gray-700 text-lg lg:text-xl">Ongoing Inspections</h2>
            {( (activeCount ?? ongoingInspections.length) > 0 ) && (
              <FadeIn className="inline-block" delay={120} transitionDuration={300}>
                <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm">
                  {activeCount ?? ongoingInspections.length} active
                </span>
              </FadeIn>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 lg:py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500 text-sm lg:text-base">Loading inspections...</p>
            </div>
          ) : ongoingInspections.length === 0 ? (
            <div className="text-center py-12 lg:py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <ClipboardCheck className="w-12 h-12 lg:w-16 lg:h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4 text-sm lg:text-base">No ongoing inspections</p>
              <button
                onClick={onCreateNewInspection}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm lg:text-base"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Inspection</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
              {ongoingInspections.map((inspection, idx) => (
                <FadeIn key={inspection.id} delay={80 + idx * 40} transitionDuration={300}>
                  <div
                    className="border-2 border-orange-200 bg-orange-50 rounded-lg overflow-hidden hover:border-orange-400 hover:shadow-lg transition-all"
                  >
                  <button
                    onClick={() => onResumeInspection(inspection)}
                    className="w-full text-left p-4 lg:p-6"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                          <h3 className="text-orange-900 truncate">
                            {inspection.venueName}
                          </h3>
                        </div>
                        {inspection.roomName ? (
                        <div>
                          {inspection.roomName && (
                            <p className="text-orange-700 text-sm truncate">{inspection.roomName}</p>
                          )}
                          {/* Subtle progress: show done/expected if we can */}
                          {(() => {
                            const vid = inspection.venueId;
                            const venueObj = propsVenues.find((v: Venue) => String(v.id || v.venueId) === String(vid));
                            if (venueObj && inspection.roomId) {
                              const roomObj = ((venueObj.rooms || []) as Room[]).find((r: Room) => String(r.roomId || r.id) === String(inspection.roomId));
                              const expected = roomObj ? ((roomObj.items || []) as Record<string, unknown>[]).length : ((inspection.items || []) as Record<string, unknown>[]).length || 0;
                              const done = ((inspection.items || []) as Record<string, unknown>[]).filter((it: Record<string, unknown>) => {
                                const s = String(it['status'] || 'pending');
                                return s && s !== 'pending';
                              }).length;
                              if (expected > 0) return <div className="text-xs text-orange-600 mt-1">{done}/{expected} items</div>;
                            }
                            return null;
                          })()}


                        </div>
                        ) : null}
                      </div>
                    </div>

<FadeIn className="space-y-2 mb-4" delay={60} transitionDuration={240}>
                      <div className="flex items-center gap-2 text-xs lg:text-sm text-orange-600">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>Created: {formatDate(inspection.timestamp)}</span>
                      </div>
                      <FadeInText visible={!!(inspection.inspectorName || (inspection as any).createdBy || pick(inspection.raw as any, 'createdBy', 'created_by', 'inspectorName'))} className="text-xs lg:text-sm text-orange-700 block">
                        Created by: <span className="font-medium">{inspection.inspectorName || (inspection as any).createdBy || pick(inspection.raw as any, 'createdBy', 'created_by', 'inspectorName')}</span>
                      </FadeInText>

                      {(() => {
                        const s = getSummary(inspection.id);
                        return (
                          <div className="flex items-center gap-2 text-xs lg:text-sm text-orange-600">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span>
                              Last updated: <FadeInText visible={!!(s && s.lastUpdated)} className="inline-block">{(s && s.lastUpdated) ? formatDate(s.lastUpdated) : <span className="text-gray-400">—</span>}</FadeInText>
                            </span>
                          </div>
                        );
                      })()} 

                      {(() => {
                        const s = getSummary(inspection.id);
                        return (
                          <div className="text-xs lg:text-sm text-orange-700 block">
                            Last updated by: <FadeInText visible={!!(s && s.lastUpdatedBy)} className="inline-block"><span className="font-medium">{(s && s.lastUpdatedBy) ? s.lastUpdatedBy : <span className="text-gray-400">—</span>}</span></FadeInText>
                          </div>
                        );
                      })()}

                      {/* Summary (pass/fail/pending). If no DB summary exists, compute expected pending from venue definition */}
                      {(() => {
                        const s = inspectionSummaries[inspection.id];
                        let totals = s ? ((s as Record<string, unknown>)['totals'] as Record<string, number> | undefined) || null : null;
                        if (!totals) {
                          // Compute expected pending from venue definition or fallback to items length
                          const vid = inspection.venueId || inspection.venueId || inspection.raw?.venue_id || inspection.raw?.venueId;
                          const venueObj = (venues || []).find((v: Venue) => String(v.id || v.venueId) === String(vid)) || null;
                          let expected = ((inspection.items || []) as Record<string, unknown>[]).length || 0;
                          if (venueObj) {
                            const rooms = (venueObj.rooms || []) as Room[];
                            expected = rooms.reduce((acc: number, r: Room) => acc + (((r.items || []) as Record<string, unknown>[]).length || 0), 0);
                          }
                          totals = { pass: 0, fail: 0, na: 0, pending: expected, total: expected };
                        }
                        if (!totals) return null;
                        return (
                          <div className="flex gap-4 text-sm mt-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              <span className="text-gray-700">Pass: <NumberFlow value={totals.pass ?? null} className="inline-block" /></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-600" />
                              <span className="text-gray-700">Fail: <NumberFlow value={totals.fail ?? null} className="inline-block" /></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-yellow-500" />
                              <span className="text-gray-700">Pending: <NumberFlow value={totals.pending ?? null} className="inline-block" /></span>
                            </div>
                          </div>
                        );
                      })()}
                    </FadeIn>

                    <div className="pt-3 border-t border-orange-200">
                      <span className="text-orange-800 text-sm font-medium">
                        Tap to continue →
                      </span>
                    </div>
                  </button>

                  {/* Delete Button */}
                  <div className="px-4 lg:px-6 pb-4 border-t border-orange-200">
                    <button
                      onClick={(e) => handleDeleteInspection(e, inspection)}
                      disabled={deletingIds.includes(inspection.id)}
                      className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded transition-colors text-sm ${deletingIds.includes(inspection.id) ? 'bg-red-200 text-red-400 cursor-not-allowed' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                    >
                      {deletingIds.includes(inspection.id) ? (
                        <span>Deleting…</span>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Inspection</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                </FadeIn>
              ))}
            </div>
          )}

          {/* Completed Inspections */}
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between mb-4 lg:mb-6">
              <h2 className="text-gray-700 text-lg lg:text-xl">Completed Inspections</h2>
              <div className="flex items-center gap-2 flex-wrap w-full">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
                  <label className="flex flex-col text-xs text-gray-600 w-full sm:w-auto">
                    <span className="text-xs font-medium">Start</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1 text-sm text-gray-600 w-full sm:w-36" aria-label="Start date" />
                  </label>

                  <label className="flex flex-col text-xs text-gray-600 w-full sm:w-auto">
                    <span className="text-xs font-medium">End</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1 text-sm text-gray-600 w-full sm:w-36" aria-label="End date" />
                  </label>

                  <div className="w-full lg:hidden mt-1 text-xs text-gray-500">Tap to select the date range</div>
                </div>

                <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-auto">
                  <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-sm text-gray-600 hover:text-gray-900">Clear</button>
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                    {filteredCompletedInspections.length} shown
                  </span>
                </div>
              </div>
            </div>

            {completedInspections.length === 0 ? (
              <div className="text-center py-12 lg:py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500 mb-4 text-sm lg:text-base">No recently completed inspections</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {displayedCompletedInspections.map((inspection, idx) => (
                  <FadeIn key={inspection.id} delay={80 + idx * 40} transitionDuration={300}>
                  <div
                    className="border-2 border-green-200 bg-green-50 rounded-lg overflow-hidden"
                  >
                    <div className="p-4 lg:p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-green-800 truncate">{formatDate(inspection.completedAt || inspection.updatedAt || inspection.timestamp)}</h3>
                          <FadeIn className="mt-1" delay={60} transitionDuration={240}>
                            <p className="text-green-700 text-sm truncate">{inspection.venueName}</p>
                            {inspection.roomName && (
                              <p className="text-green-700 text-sm truncate">{inspection.roomName}</p>
                            )}

                            {inspection.createdBy && (
                              <div className="text-xs text-green-700 mt-1">Created by: <span className="font-medium">{inspection.createdBy}</span></div>
                            )}

                            {(() => {
                              const s = getSummary(inspection.id);
                              if (s && s.totals) return (
                                <div className="text-xs text-gray-500 mt-2">Pass: {s.totals.pass || 0} • Fail: {s.totals.fail || 0} • NA: {s.totals.na || 0} • Total: {s.totals.total || 0}</div>
                              );
                              return null;
                            })()}
                          </FadeIn>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 lg:px-6 pb-4 border-t border-green-200">
                      <button onClick={() => onViewHistory()} className="w-full py-2 px-3 bg-green-100 text-green-700 rounded text-sm">View in History</button>
                    </div>
                  </div>
                </FadeIn>
                ))}
              </div>
            )}
          </div>


        </div>
      </div>
    </div>
  );
}