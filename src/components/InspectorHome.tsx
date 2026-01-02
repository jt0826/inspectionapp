import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, Plus, History, User, Building2, LogOut, Clock, AlertCircle, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { Inspection } from '../App';
import { getInspectionSummary, checkInspectionComplete } from '../utils/inspectionApi';
import { computeExpectedTotalsFromVenue, computeExpectedByRoomFromVenue } from '../utils/inspectionHelpers';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastProvider';

interface InspectorHomeProps {
  inspections: Inspection[];
  venues?: any[];
  onCreateNewInspection: () => void;
  onResumeInspection: (inspection: string | any) => void;
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

  const [dynamoInspections, setDynamoInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [venuesMap, setVenuesMap] = useState<Record<string, string>>({});
  const [inspectionSummaries, setInspectionSummaries] = useState<Record<string, any>>({});
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});

  // Local UI state for delete flow
  const [deleting, setDeleting] = useState(false);
  const { show, confirm } = useToast();
  const [activeCount, setActiveCount] = useState<number | null>(null);

  // Fetch inspections from DynamoDB (reusable)
  const fetchInspections = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_inspections' }),
      });

      const data = await response.json();
      // API Gateway proxy integration often returns { statusCode, body }
      let inspectionsArray: any[] = [];

      if (Array.isArray(data.inspections)) {
        inspectionsArray = data.inspections;
      } else if (data.body) {
        // body may be a JSON string
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          inspectionsArray = parsed.inspections || parsed.Items || [];
        } catch (err) {
          console.warn('Failed to parse response.body as JSON', err);
        }
      } else if (Array.isArray(data)) {
        inspectionsArray = data;
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
      const res = await fetch('https://n7yxt09phk.execute-api.ap-southeast-1.amazonaws.com/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_venues' }),
      });
      const data = await res.json();
      let items: any[] = [];
      if (Array.isArray(data)) items = data;
      else if (Array.isArray(data.venues)) items = data.venues;
      else if (data.body) {
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          items = parsed.venues || parsed.Items || parsed || [];
        } catch (err) {
          console.warn('Failed to parse venues.body', err);
        }
      }

      const map: Record<string, string> = {};
      items.forEach((v: any) => {
        const id = v.venueId || v.id;
        if (id) map[id] = v.name || '';
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
      venues.forEach((v: any) => { map[v.id] = v.name; });
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
        const ids = dynamoInspections.map((i) => i.inspection_id).filter(Boolean);
        const results: Record<string, any> = {};

        // Optimistic seed: prefill inspection summaries from venue definitions to avoid flicker on the homepage
        try {
          const optimistic: Record<string, any> = {};
          (dynamoInspections || []).forEach((it: any) => {
            const vid = it.venue_id || it.venueId || it.venue;
            const venueObj = (venues || []).find((v: any) => v.id === vid);
            const totals = computeExpectedTotalsFromVenue(venueObj);
            const byRoom = computeExpectedByRoomFromVenue(venueObj);
            optimistic[it.inspection_id] = { inspection_id: it.inspection_id, totals, byRoom };
          });
          setInspectionSummaries(optimistic);
        } catch (e) {
          // ignore optimistic seed errors
        }

        await Promise.all(ids.map(async (id) => {
          try {
            // Try the summary endpoint first
            const res = await getInspectionSummary(id);
            // Only accept the returned summary if it contains both totals and byRoom; otherwise run the fallback
            if (res && res.totals && res.byRoom) {
              // Also fetch raw items to compute last-updated info
              try {
                const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';
                const rItems = await fetch(API_BASE, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'get_inspection', inspection_id: id }),
                });
                let items: any[] = [];
                if (rItems.ok) {
                  const dataItems = await rItems.json();
                  items = dataItems.items || (dataItems.body ? (typeof dataItems.body === 'string' ? JSON.parse(dataItems.body).items || [] : dataItems.body.items || []) : []);
                }

                let latestTs: string | null = null;
                let latestBy: string | null = null;
                for (const it of items) {
                  const ts = it.updatedAt || it.updated_at || it.createdAt || it.created_at;
                  if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) {
                    latestTs = ts;
                    latestBy = it.inspectorName || it.createdBy || it.inspector_name || it.created_by || null;
                  }
                }

                // Ensure totals include pending items expected by venue definition if DB reports fewer items
                try {
                  const meta = dynamoInspections.find((d) => d.inspection_id === id) || {};
                  const venueId = meta.venueId || meta.venue_id || meta.venue;
                  let expectedTotal = 0;
                  if (venueId) {
                    const venueObj = (venues || []).find((v: any) => v.id === venueId);
                    if (venueObj) {
                      expectedTotal = (venueObj.rooms || []).reduce((s: number, r: any) => s + ((r.items || []).length || 0), 0);
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
                  console.warn('Failed to enrich totals with expected items', id, e);
                }

                results[id] = { ...res, inspection_id: id, lastUpdated: latestTs, lastUpdatedBy: latestBy };
                console.log('[Summary] loaded for', id, res.totals, 'lastUpdated', latestTs);
                return;
              } catch (e) {
                console.warn('Failed to fetch items for lastUpdated', id, e);
                results[id] = res;
                return;
              }
            }

            // Fallback: query raw items and compute totals (like RoomList does)
            const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';
            try {
              const r = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get_inspection', inspection_id: id }),
              });
              if (!r.ok) {
                const t = await r.text().catch(() => '');
                console.warn('Fallback get_inspection non-ok', r.status, t);
                return;
              }
              const data = await r.json();
              const items = data.items || (data.body ? (typeof data.body === 'string' ? JSON.parse(data.body).items || [] : data.body.items || []) : []);

              const totals = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
              const byRoom: Record<string, any> = {};
              let latestTs: string | null = null;
              let latestBy: string | null = null;
              for (const it of items) {
                const rid = it.roomId || it.room_id || it.room || '';
                if (!rid) continue;
                const status = (it.status || 'pending').toLowerCase();
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

                const ts = it.updatedAt || it.updated_at || it.createdAt || it.created_at;
                if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) {
                  latestTs = ts;
                  latestBy = it.inspectorName || it.createdBy || it.inspector_name || it.created_by || null;
                }
              }

              // If DB has fewer items than expected by venue definition, default missing ones to pending
              try {
                const meta = dynamoInspections.find((d) => d.inspection_id === id) || {};
                const venueId = meta.venueId || meta.venue_id || meta.venue;
                if (venueId) {
                  const venueObj = (venues || []).find((v: any) => v.id === venueId);
                  if (venueObj) {
                    // Ensure per-room entries exist for rooms with no DB rows and mark them pending
                    (venueObj.rooms || []).forEach((r: any) => {
                      const rid = r.id;
                      if (!byRoom[rid]) {
                        byRoom[rid] = { pass: 0, fail: 0, na: 0, pending: (r.items || []).length || 0, total: (r.items || []).length || 0 };
                      }
                    });

                    const expectedTotal = (venueObj.rooms || []).reduce((s: number, r: any) => s + ((r.items || []).length || 0), 0);
                    const known = (totals.pass || 0) + (totals.fail || 0) + (totals.na || 0);
                    totals.pending = Math.max(0, expectedTotal - known);
                    totals.total = known + totals.pending;
                  }
                }
              } catch (e) {
                console.warn('Failed to enrich fallback totals with expected items', id, e);
              }

              results[id] = { inspection_id: id, totals, byRoom, lastUpdated: latestTs, lastUpdatedBy: latestBy };
              console.log('[Summary] fallback computed for', id, totals);
            } catch (e) {
              console.warn('Fallback get_inspection failed for', id, e);
            }
          } catch (e) { console.warn('summary fetch failed', id, e); }
        }));
        setInspectionSummaries(results);

        // Compute active (uncompleted) inspection count by asking backend whether each inspection is complete
        (async () => {
          try {
            const counts = await Promise.all(dynamoInspections.map(async (it: any) => {
              const status = (it.status || 'in-progress');
              if (status && status.toString().toLowerCase() === 'completed') return 0; // already completed

              const venueId = it.venue_id || it.venueId || it.venue;
              if (!venueId) return 1; // no venue yet -> not complete

              try {
                const c = await checkInspectionComplete(it.inspection_id, venueId);
                if (c && c.complete === true) return 0;
                return 1;
              } catch (e) {
                console.warn('checkInspectionComplete failed for', it.inspection_id, e);
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
    .filter((inspection) => ((inspection.status || 'in-progress').toString().toLowerCase() !== 'completed' && !completedMap[inspection.inspection_id]))
    .map((inspection) => {
      const vid = inspection.venue_id || inspection.venueId || inspection.venue;
      const venueObj = (venues || []).find((v: any) => v.id === vid);
      const venueName = venueObj ? venueObj.name : (venuesMap[vid] || inspection.venue_name || inspection.venueName || 'Venue not selected');
      const roomObj = venueObj ? (venueObj.rooms || []).find((r: any) => r.id === (inspection.room_id || inspection.roomId)) : null;
      const roomName = roomObj ? roomObj.name : (inspection.room_name || inspection.roomName || '');

      return {
        id: inspection.inspection_id,
        venueName,
        roomName,
        timestamp: inspection.created_at,
        venueId: vid,
        roomId: inspection.room_id || '',
        status: inspection.status || 'draft',
        items: inspection.items || [],
        inspectorName: inspection.created_by,
        raw: inspection,
      };
    });



  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Completed inspections list (derived from status or completedMap)
  const completedInspections = dynamoInspections
    .filter((inspection) => (((inspection.status || '').toString().toLowerCase() === 'completed') || completedMap[inspection.inspection_id]))
    .map((inspection) => {
      const vid = inspection.venue_id || inspection.venueId || inspection.venue;
      const venueObj = (venues || []).find((v: any) => v.id === vid);
      const venueName = venueObj ? venueObj.name : (venuesMap[vid] || inspection.venue_name || inspection.venueName || 'Venue not selected');
      const roomObj = venueObj ? (venueObj.rooms || []).find((r: any) => r.id === (inspection.room_id || inspection.roomId)) : null;
      const roomName = roomObj ? roomObj.name : (inspection.room_name || inspection.roomName || '');

      return {
        id: inspection.inspection_id,
        venueName,
        roomName,
        timestamp: inspection.created_at || inspection.updated_at || inspection.timestamp,
        venueId: vid,
        roomId: inspection.room_id || '',
        status: inspection.status || 'completed',
        items: inspection.items || [],
        inspectorName: inspection.created_by,
        raw: inspection,
      };
    });

  const getInspectionProgress = (inspection: Inspection) => {
    if (inspection.status === 'draft') return 'Not started';
    if (!inspection.venueId) return 'Venue not selected';
    if (!inspection.roomId) return 'Room not selected';
    if (inspection.items.length === 0) return 'No items checked';
    const completed = inspection.items.filter(i => i.status !== 'pending').length;
    return `${completed}/${inspection.items.length} items`;
  };

  const handleDeleteInspection = async (e: React.MouseEvent, inspection: any) => {
    e.stopPropagation();
    const id = inspection.id || inspection.inspection_id;
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
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm">
                {activeCount ?? ongoingInspections.length} active
              </span>
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
              {ongoingInspections.map((inspection) => (
                <div
                  key={inspection.id}
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
                            const venueObj = propsVenues.find((v: any) => v.id === vid);
                            if (venueObj && inspection.roomId) {
                              const roomObj = (venueObj.rooms || []).find((r: any) => r.roomId === inspection.roomId || r.id === inspection.roomId);
                              const expected = roomObj ? (roomObj.items || []).length : (inspection.items || []).length || 0;
                              const done = (inspection.items || []).filter((it: any) => it.status && it.status !== 'pending').length;
                              if (expected > 0) return <div className="text-xs text-orange-600 mt-1">{done}/{expected} items</div>;
                            }
                            return null;
                          })()}


                        </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-xs lg:text-sm text-orange-600">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>Created: {formatDate(inspection.timestamp)}</span>
                      </div>
                      <div className="text-xs lg:text-sm text-orange-700">
                        Created by: <span className="font-medium">{inspection.inspectorName}</span>
                      </div>

                      {inspectionSummaries[inspection.id] && inspectionSummaries[inspection.id].lastUpdated && (
                        <div className="flex items-center gap-2 text-xs lg:text-sm text-orange-600">
                          <Clock className="w-4 h-4 flex-shrink-0" />
                          <span>Last updated: {formatDate(inspectionSummaries[inspection.id].lastUpdated)}</span>
                        </div>
                      )}

                      {inspectionSummaries[inspection.id] && inspectionSummaries[inspection.id].lastUpdatedBy && (
                        <div className="text-xs lg:text-sm text-orange-700">
                          Last updated by: <span className="font-medium">{inspectionSummaries[inspection.id].lastUpdatedBy}</span>
                        </div>
                      )}

                      {/* Summary (pass/fail/pending). If no DB summary exists, compute expected pending from venue definition */}
                      {(() => {
                        const s = inspectionSummaries[inspection.id];
                        let totals = s && s.totals ? s.totals : null;
                        if (!totals) {
                          // Compute expected pending from venue definition or fallback to items length
                          const vid = inspection.venueId || inspection.venueId || inspection.raw?.venue_id || inspection.raw?.venueId;
                          const venueObj = (venues || []).find((v: any) => v.id === vid);
                          const expected = venueObj ? (venueObj.rooms || []).reduce((s: number, r: any) => s + ((r.items || []).length || 0), 0) : (inspection.items || []).length || 0;
                          totals = { pass: 0, fail: 0, na: 0, pending: expected, total: expected };
                        }
                        if (!totals) return null;
                        return (
                          <div className="flex gap-4 text-sm mt-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              <span className="text-gray-700">Pass: {totals.pass}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-600" />
                              <span className="text-gray-700">Fail: {totals.fail}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-yellow-500" />
                              <span className="text-gray-700">Pending: {totals.pending}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

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
              ))}
            </div>
          )}

          {/* Completed Inspections */}
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between mb-4 lg:mb-6">
              <h2 className="text-gray-700 text-lg lg:text-xl">Completed Inspections</h2>
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                {completedInspections.length} completed
              </span>
            </div>

            {completedInspections.length === 0 ? (
              <div className="text-center py-12 lg:py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500 mb-4 text-sm lg:text-base">No recently completed inspections</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                {completedInspections.map((inspection) => (
                  <div
                    key={inspection.id}
                    className="border-2 border-green-200 bg-green-50 rounded-lg overflow-hidden"
                  >
                    <div className="p-4 lg:p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-green-800 truncate">{inspection.venueName}</h3>
                          <p className="text-green-700 text-sm truncate">{inspection.roomName}</p>
                          <div className="text-xs text-green-600 mt-1">Completed: {formatDate(inspection.timestamp as string)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 lg:px-6 pb-4 border-t border-green-200">
                      <button onClick={() => onViewHistory()} className="w-full py-2 px-3 bg-green-100 text-green-700 rounded text-sm">View in History</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>


        </div>
      </div>
    </div>
  );
}