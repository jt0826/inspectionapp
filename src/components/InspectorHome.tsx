import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, Plus, History, User, Building2, LogOut, Clock, AlertCircle, CheckCircle2, XCircle, MinusCircle, Trash2, Grid } from 'lucide-react';
import { Inspection } from '../App';
import NumberFlow from '@number-flow/react';
import FadeInText from './FadeInText';
import InspectionCard from './InspectionCard';
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
  onViewDashboard?: () => void;
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
  onViewDashboard,
}: InspectorHomeProps) {
  const { user, logout } = useAuth();
  const propsVenues = venues || [];

  const [dynamoInspections, setDynamoInspections] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [venuesMap, setVenuesMap] = useState<Record<string, string>>({});
  const [inspectionSummaries, setInspectionSummaries] = useState<Record<string, unknown>>({});
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [serverProvidedSummaries, setServerProvidedSummaries] = useState<boolean>(false);

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

      // Normalized parsing
      if (Array.isArray(data.inspections)) {
        inspectionsArray = data.inspections as Record<string, unknown>[];
      } else if (data.body) {
        // body may be a JSON string
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          inspectionsArray = (parsed.inspections || parsed.Items || []) as Record<string, unknown>[];

          // Detect consolidated payload with server-provided partitioning (completed/ongoing)
          if (parsed.completed || parsed.ongoing) {
            setServerProvidedSummaries(true);
            // Build completed map from server-provided completed list
            try {
              const compArr = parsed.completed || [];
              const map: Record<string, boolean> = {};
              (compArr || []).forEach((c: any) => { const id = String(c?.inspection_id || c?.id || ''); if (id) map[id] = true; });
              setCompletedMap(map);
            } catch (e) {
              console.warn('Failed to build completedMap from server payload', e);
            }

            // Set active count from server's ongoing list if present
            try {
              const ongoingArr = parsed.ongoing || [];
              setActiveCount(Array.isArray(ongoingArr) ? ongoingArr.length : null);
            } catch (e) {
              setActiveCount(null);
            }

            // Populate inspectionSummaries from any totals/byRoom fields included per-inspection
            try {
              const results: Record<string, unknown> = {};
              (inspectionsArray || []).forEach((it: Record<string, unknown>) => {
                const id = String(it['inspection_id'] || it['id'] || '');
                if (!id) return;
                const t = (it as any).totals || null;
                const br = (it as any).byRoom || null;
                if (t || br) results[id] = { inspection_id: id, totals: t, byRoom: br } as Record<string, unknown>;
              });
              if (Object.keys(results).length > 0) setInspectionSummaries(results);
            } catch (e) {
              console.warn('Failed to seed inspectionSummaries from server payload', e);
            }
          }
        } catch (err) {
          console.warn('Failed to parse response.body as JSON', err);
        }
      } else if (Array.isArray(data)) {
        inspectionsArray = data as Record<string, unknown>[];
      }

      // Support server-provided partitioning at top-level (data.completed / data.ongoing)
      if (!serverProvidedSummaries && (Array.isArray((data as any)?.completed) || Array.isArray((data as any)?.ongoing))) {
        try {
          setServerProvidedSummaries(true);
          const compArr = (data as any).completed || [];
          const map: Record<string, boolean> = {};
          (compArr || []).forEach((c: any) => { const id = String(c?.inspection_id || c?.id || ''); if (id) map[id] = true; });
          setCompletedMap(map);
          const ongoingArr = (data as any).ongoing || [];
          setActiveCount(Array.isArray(ongoingArr) ? ongoingArr.length : null);

          const results: Record<string, unknown> = {};
          (inspectionsArray || []).forEach((it: Record<string, unknown>) => {
            const id = String(it['inspection_id'] || it['id'] || '');
            if (!id) return;
            const t = (it as any).totals || null;
            const br = (it as any).byRoom || null;
            if (t || br) results[id] = { inspection_id: id, totals: t, byRoom: br } as Record<string, unknown>;
          });
          if (Object.keys(results).length > 0) setInspectionSummaries(results);
        } catch (e) {
          console.warn('Failed to process top-level server partitioning data', e);
        }
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

  // Build venuesMap from props if supplied. Do NOT fetch venues here; VenueList and RoomList are responsible for invoking the venues API when those screens load.
  useEffect(() => {
    if (venues && venues.length > 0) {
      const map: Record<string, string> = {};
      venues.forEach((v: Venue) => {
        const id = v.id || v.venueId;
        if (id) map[String(id)] = v.name || '';
      });
      setVenuesMap(map);
    } else {
      // No-op: do not perform network fetch here
      setVenuesMap({});
    }
  }, [venues]);
  useEffect(() => {
    fetchInspections();
    const onFocus = () => { fetchInspections(); };
    const onInspectionSaved = () => { fetchInspections(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('inspectionSaved', onInspectionSaved as EventListener);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('inspectionSaved', onInspectionSaved as EventListener); };
  }, [fetchInspections]);

  // Replace client-side enrichment with server-sourced summaries only
  useEffect(() => {
    // If server provided per-inspection totals, seed inspectionSummaries from those values
    if (serverProvidedSummaries && dynamoInspections && dynamoInspections.length > 0) {
      try {
        const results: Record<string, unknown> = {};
        (dynamoInspections || []).forEach((it: Record<string, unknown>) => {
          const id = String(it['inspection_id'] || it['id'] || '');
          if (!id) return;
          const t = (it as any).totals || null;
          const br = (it as any).byRoom || null;
          if (t || br) results[id] = { inspection_id: id, totals: t, byRoom: br } as Record<string, unknown>;
        });
        if (Object.keys(results).length > 0) setInspectionSummaries(results);
      } catch (e) {
        console.warn('Failed to build inspectionSummaries from server-provided data', e);
      }
    } else {
      // No server-provided summaries: don't try to compute or enrich on the client — clear any optimistic data
      setInspectionSummaries({});
      setActiveCount(null);
    }
  }, [dynamoInspections, serverProvidedSummaries]);



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

      // Prefer server-provided fields when available
      const createdAt = pick(inspection, 'createdAt', 'created_at', 'timestamp');
      const createdBy = pick(inspection, 'createdBy', 'created_by', 'inspectorName');
      const updatedAt = pick(inspection, 'updatedAt', 'updated_at') || pick((inspection as any).raw as any, 'updatedAt', 'updated_at') || undefined;
      const updatedBy = pick(inspection, 'updatedBy', 'updated_by') || pick((inspection as any).raw as any, 'updatedBy', 'updated_by') || undefined;

      // Totals: prefer inspection.totals (server-provided) -> inspectionSummaries; no client-side aggregation here
      const id = String(inspection['inspection_id'] || '');
      const totals = (inspection as any).totals || (inspectionSummaries[id] as any)?.totals || { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };

      return {
        id: String(inspection['inspection_id'] || ''),
        venueName: String(venueName),
        roomName: String(roomName),
        timestamp: createdAt,
        venueId: String(vid),
        roomId: String((inspection['room_id'] as string) || ''),
        status: String((inspection['status'] as string) || 'draft'),
        items: (inspection['items'] as unknown[]) || [],
        inspectorName: pick(inspection, 'inspectorName', 'createdBy', 'created_by'),
        createdBy: createdBy,
        raw: inspection,
        updatedAt,
        updatedBy,
        totals,
      };
    });



  const sortedOngoingInspections = [...ongoingInspections].sort((a: any, b: any) => {
    const aTs = String(a.timestamp || a.updatedAt || a.createdAt || '');
    const bTs = String(b.timestamp || b.updatedAt || b.createdAt || '');
    return new Date(bTs).getTime() - new Date(aTs).getTime();
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

  type Summary = { totals?: { pass?: number; fail?: number; na?: number; pending?: number; total?: number }; byRoom?: Record<string, any>; updatedAt?: string | null; updatedBy?: string | null };
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

      // Totals: prefer inspection.totals (server-provided) -> inspectionSummaries; no client-side aggregation here
      const id = String(inspection['inspection_id'] || '');
      const totalsComputed = (inspection as any).totals || (inspectionSummaries[id] as any)?.totals || { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };

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
        totals: totalsComputed,
      };
    });

  // Show only the most recent N completed inspections on the Home page to avoid clutter
  const MAX_HOME_COMPLETED = 6;

  // No client-side date filtering on the Home page — date range moved to History
  const filteredCompletedInspections = completedInspections;

  const displayedCompletedInspections = [...filteredCompletedInspections]
    .sort((a: any, b: any) => new Date(String(b.timestamp || b.completedAt || b.updatedAt || '')).getTime() - new Date(String(a.timestamp || a.completedAt || a.updatedAt || '')).getTime())
    .slice(0, MAX_HOME_COMPLETED);

  const getInspectionProgress = (inspection: Inspection) => {
    if (inspection.status === 'draft') return 'Not started';
    if (!inspection.venueId) return 'Venue not selected';
    if (!inspection.roomId) return 'Room not selected';
    if (inspection.items.length === 0) return 'No items checked';
    const completed = inspection.items.filter(i => i.status !== 'pending').length;
    return `${completed}/${inspection.items.length} items`;
  };

  // Use shared InspectionCard component
  // (moved to its own file to share between Home and History)

  const handleDeleteInspection = async (e: React.MouseEvent, inspection: Record<string, unknown>) => {
    e.stopPropagation();
    const id = String(inspection['id'] || inspection['inspection_id'] || '');

    try {
      const { listImagesForInspection, deleteInspection } = await import('../utils/inspectionApi');
      const images = await listImagesForInspection(id);
      const imageCount = (images && images.length) || 0;

      const confirmed = await confirm({
        title: 'Delete inspection',
        message: `Are you sure you want to delete the inspection for ${inspection.venueName || id}? This will also delete ${imageCount} uploaded image${imageCount !== 1 ? 's' : ''}.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      setDeleting(true);
      setDeletingIds(prev => [...prev, id]);

      show('Deleting inspection and images…', { variant: 'info' });

      const token = localStorage.getItem('authToken') || '';
      const result = await deleteInspection(id, { cascade: true }, token);

      if (!result || !result.ok) {
        console.error('Failed to delete inspection', result);
        show('Failed to delete inspection', { variant: 'error' });
        return;
      }

      const summary = result.summary || (result.data && result.data.summary) || null;
      const deletedImages = (summary && summary.deletedImages) || 0;
      const imageFailures = (summary && summary.imageFailures) || [];

      setDynamoInspections(prev => prev.filter(item => item.inspection_id !== id));
      onDeleteInspection(id);

      if (imageFailures.length > 0) {
        show(`Inspection deleted but ${deletedImages} images removed; ${imageFailures.length} image deletions failed. Check console.`, { variant: 'info' });
      } else {
        show(`Inspection deleted (${deletedImages} images removed)`, { variant: 'success' });
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => onViewDashboard && onViewDashboard()}
                className="p-2 lg:p-3 text-blue-100 hover:text-white hover:bg-blue-700 rounded-lg transition-colors"
                title="Dashboard"
                aria-label="Open dashboard"
              >
                <Grid className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>

              <button
                onClick={logout}
                className="p-2 lg:p-3 text-blue-100 hover:text-white hover:bg-blue-700 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
            </div>
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
              {sortedOngoingInspections.map((inspection, idx) => (
                <FadeIn key={inspection.id} delay={80 + idx * 40} transitionDuration={300}>
                  <InspectionCard
                    inspection={inspection}
                    variant="ongoing"
                    onClick={() => onResumeInspection(inspection)}
                    onDelete={(e: React.MouseEvent) => handleDeleteInspection(e, inspection)}
                    isDeleting={deletingIds.includes(inspection.id)}
                    summary={getSummary(inspection.id)}
                  />
                </FadeIn>
              ))}
            </div>
          )}

          {/* Completed Inspections */}
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between mb-4 lg:mb-6">
              <h2 className="text-gray-700 text-lg lg:text-xl">Completed Inspections</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-auto">
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                    {completedInspections.length} shown
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
                    <InspectionCard
                      inspection={inspection}
                      variant="completed"
                      onClick={() => onResumeInspection(inspection)}
                      summary={getSummary(inspection.id)}
                    />
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