import React, { useState, useEffect } from 'react';
import { ArrowLeft, History, Building2, Calendar, CheckCircle2, XCircle, AlertCircle, Search, Trash2 } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import FadeInText from './FadeInText';
import FadeIn from 'react-fade-in';
import LoadingOverlay from './LoadingOverlay';
import type {Inspection} from '../types/inspection';
import { getInspectionsPartitioned } from '../utils/inspectionApi';
import InspectionCard from './InspectionCard';
import { formatDateTime as formatDate } from '../utils/date';

interface InspectionHistoryProps {
  inspections: Inspection[];
  onBack: () => void;
  onDeleteInspection: (inspectionId: string) => void;
  onResumeInspection?: (inspection: string | Record<string, unknown>) => void;
}

import { useToast } from './ToastProvider';
import { useInspectionContext } from '../contexts/InspectionContext';

export function InspectionHistory({ inspections, onBack, onDeleteInspection, onResumeInspection }: InspectionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  // Fade-in animations
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const { show, confirm } = useToast();
  // Re-fetch history when `refreshKey` increments in the InspectionContext so that
  // history stays in sync after create/save/delete operations elsewhere in the app.
  const { refreshKey } = useInspectionContext();




  // Use server-provided inspections from the consolidated query endpoint
  const [sourceInspections, setSourceInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    const fetchList = async () => {
      setLoading(true);
      try {
        // Request all completed inspections (completedLimit <= 0 => no limit)
        const body = await getInspectionsPartitioned({ completedLimit: 0 });
        if (cancelled) return;

        // Prefer server-supplied 'completed' partition; otherwise use the canonical 'inspections' list
        if (body && Array.isArray(body.completed) && body.completed.length > 0) {
          setSourceInspections(body.completed as any[]);
        } else if (body && Array.isArray(body.inspections) && body.inspections.length > 0) {
          setSourceInspections(body.inspections as any[]);
        } else {
          // No data returned from the canonical endpoint
          setSourceInspections([]);
        }
      } catch (e) {
        console.warn('Failed to fetch inspections for history', e);
        setSourceInspections([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchList();

    const onFocus = () => { fetchList(); };
    window.addEventListener('focus', onFocus);

    // Re-run when the global inspection refreshKey increments
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [refreshKey]);

  // Use sourceInspections if present, otherwise use the parent inspections prop
  const effectiveInspections: any[] = (sourceInspections && sourceInspections.length > 0) ? sourceInspections : inspections;

  // No extra completeness checking or legacy fallbacks — the server should provide completed/inspections partitions.
  const [checkingComplete, setCheckingComplete] = useState(false);

  useEffect(() => {
    setCheckingComplete(false);
  }, [sourceInspections]);

  // Normalize inspections from server to the home / card shape. This means ensuring totals and updatedAt/updatedBy are present.
  const normalize = (rec: any) => {
    if (!rec) return null as any;

    // Map canonical fields from the monolithic JSON returned by inspections-query
    const id = String(rec.id || rec.inspection_id || '');
    const venueName = String(rec.venueName || rec.venue_name || rec.venue || '');
    const roomName = String(rec.roomName || rec.room_name || rec.room || '');
    const inspectorName = String(rec.createdBy || rec.created_by || '');

    // Prefer explicit timestamps from the server
    const updatedAt = rec.updatedAt || '';
    const completedAt = (rec.completedAt || rec.completed_at || rec.completedTimestamp) || '';
    const timestamp = rec.timestamp || rec.createdAt || rec.created_at || rec.updatedAt || '';

    // Totals should be provided by the server; default to zeros but warn if missing
    const totals = (rec.totals && typeof rec.totals === 'object') ? { pass: rec.totals.pass ?? 0, fail: rec.totals.fail ?? 0, na: rec.totals.na ?? 0, total: rec.totals.total ?? 0 } : { pass: 0, fail: 0, na: 0, total: 0 };
    if (!rec.totals) console.warn(`Inspection ${id} missing totals in server payload`);
    // Only warn about missing completedAt if the server claims the inspection is completed
    const recStatus = String(rec.status || rec.state || '').toLowerCase();
    if (recStatus === 'completed' && !completedAt) console.warn(`Inspection ${id} missing completedAt in server payload`);

    const items = Array.isArray(rec.items) ? rec.items : [];

    return {
      ...rec,
      id,
      venueName,
      roomName,
      inspectorName,
      updatedAt,
      completedAt,
      timestamp,
      totals,
      items,
    };
  };

  const normalizedInspections = effectiveInspections.map(normalize).filter(Boolean);

  // History should show only completed inspections (based on status, items, or server check)
  // Show only inspections with explicit completed status (server should provide completed partition when possible)
  const completedInspections = normalizedInspections.filter((inspection: any) => {
    const status = String(inspection.status || inspection.state || '').toLowerCase();
    return status === 'completed';
  });

  const handleDelete = async (inspectionId: string) => {
    // Deleting from history is not allowed for completed inspections (immutable)
    show('Completed inspections cannot be deleted from history', { variant: 'error' });
  };

  const filteredInspections = completedInspections.filter((inspection: any) => {
    const searchLower = searchTerm.toLowerCase();
    const venueName = String(inspection.venueName || inspection.venue_name || inspection.venue || '').toLowerCase();
    const roomName = String(inspection.roomName || inspection.room_name || inspection.room || '').toLowerCase();
    const inspectorName = String(inspection.createdBy || inspection.created_by || '').toLowerCase();

    const matchesSearch =
      venueName.includes(searchLower) ||
      roomName.includes(searchLower) ||
      inspectorName.includes(searchLower);

    if (!matchesSearch) return false;



    // Date range filter (client-side) - use completedAt if available, otherwise updatedAt/timestamp
    const rawDate = inspection.completedAt || inspection.completed_at || inspection.updatedAt || inspection.updated_at || inspection.timestamp || inspection.createdAt || inspection.created_at;
    if (rawDate) {
      const d = new Date(String(rawDate));
      if (startDate) {
        const s = new Date(startDate + 'T00:00:00');
        if (d < s) return false;
      }
      if (endDate) {
        const e = new Date(endDate + 'T23:59:59');
        if (d > e) return false;
      }
    }

    return true;
  });

  // Sort by most recent first using canonical completedAt/timestamp
  const sortedInspections = [...filteredInspections].sort((a: any, b: any) => {
    const aTs = String(a.completedAt || a.timestamp || a.updatedAt || '');
    const bTs = String(b.completedAt || b.timestamp || b.updatedAt || '');
    return new Date(bTs).getTime() - new Date(aTs).getTime();
  });

  // Render list using normalized field access
  const renderInspectionItem = (inspection: any, idx: number) => {
    const id = String(inspection.id || inspection.inspection_id || '');
    const items = (inspection.items || []) as any[];

    // Use server-provided totals only (normalize ensures defaults)
    const passedItems = inspection.totals.pass ?? 0;
    const failedItems = inspection.totals.fail ?? 0;
    const naItems = inspection.totals.na ?? 0;
    const totalItems = inspection.totals.total ?? (passedItems + failedItems + naItems);
    const hasIssues = failedItems > 0;

    const venueName = String(inspection.venueName || '');
    const roomName = String(inspection.roomName || '');
    const inspectorName = String(inspection.inspectorName || inspection.createdBy || inspection.created_by || '');
    const timestamp = String(inspection.timestamp || inspection.completedAt || inspection.createdAt || '');

    return (
      <div
        className={`border-2 rounded-lg ${hasIssues ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}
      >
        <div className="p-4 lg:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {hasIssues ? (
                  <AlertCircle className="w-5 h-5 lg:w-6 lg:h-6 text-red-600 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 lg:w-6 lg:h-6 text-green-600 flex-shrink-0" />
                )}
                <h3 className={`text-base lg:text-lg truncate ${hasIssues ? 'text-red-900' : 'text-green-900'}`}>
                  {formatDate(inspection.completedAt || inspection.updatedAt || inspection.timestamp)}
                </h3>
              </div>
              <div>
                <p className={`text-sm ${hasIssues ? 'text-red-700' : 'text-green-700'} truncate`}>{venueName}</p>
                {roomName && (
                  <div className={`flex items-center gap-2 text-sm ${hasIssues ? 'text-red-700' : 'text-green-700'}`}>
                    <Building2 className="w-4 h-4 flex-shrink-0" />
                    <span>{roomName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subtle totals */}
          <FadeIn delay={110 + idx * 30} transitionDuration={220}>
            <div className="text-xs text-gray-500 mb-2">Pass: <NumberFlow value={passedItems ?? null} /> • Fail: <NumberFlow value={failedItems ?? null} /> • NA: <NumberFlow value={naItems ?? null} /> • Total: <NumberFlow value={totalItems ?? null} /></div>
          </FadeIn>

          {/* Metadata */}
          <div className="space-y-2 text-xs lg:text-sm">
            <FadeIn delay={140 + idx * 30} transitionDuration={220}>
              <div className={`flex items-center gap-2 ${hasIssues ? 'text-red-600' : 'text-green-600'}`}>
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span>{formatDate(inspection.completedAt || inspection.updatedAt || inspection.timestamp || timestamp)}</span>
              </div>
            </FadeIn>
            <FadeIn delay={170 + idx * 30} transitionDuration={220}>
              <div className={`${hasIssues ? 'text-red-700' : 'text-green-700'}`}>
                Created by: <span className="font-medium">{inspectorName || (inspection.createdBy || inspection.created_by)}</span>
              </div>
            </FadeIn>
          </div>

          {/* Failed Items Details */}
          {hasIssues && (
            <div className="mt-4 pt-4 border-t border-red-200">
              <h4 className="text-sm text-red-900 font-medium mb-2">Issues Found:</h4>
              <div className="space-y-1">
                {items
                  .filter((item) => String(item?.status || '').toLowerCase() === 'fail')
                  .map((item, itemIdx) => (
                    <FadeIn key={itemIdx} delay={200 + idx * 30 + itemIdx * 40} transitionDuration={220}>
                      <div className="text-xs lg:text-sm text-red-700 flex items-start gap-2">
                        <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{String(item?.item || item?.name || '')}</span>
                      </div>
                    </FadeIn>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Completed history items are immutable — no delete button */}
        {/* removed for now */} 
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <LoadingOverlay visible={loading} message={"Loading completed inspections…"} />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 lg:mb-6 text-sm lg:text-base"
          >
            <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
            <span>Back to Home</span>
          </button>
          <div className="flex items-center gap-3 lg:gap-4">
            <History className="w-8 h-8 lg:w-10 lg:h-10" />
            <div>
              <h1 className="text-xl lg:text-3xl">Inspection History</h1>
              <p className="text-blue-100 text-sm lg:text-base">
                Showing {filteredInspections.length} of {completedInspections.length} completed inspection{completedInspections.length !== 1 ? 's' : ''} (total {sourceInspections.length})
                {checkingComplete && (
                  <span className="ml-3 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Checking completion…</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 lg:p-6 bg-gray-50 border-b">
          <div className="space-y-3 lg:space-y-0 lg:flex lg:gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by venue, room, or inspector..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm lg:text-base placeholder:text-gray-400 text-gray-900"
                />
              </div>
            </div>



            {/* Date range filter (client-side) - let's add a 'to' word between the dates */}
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1 text-sm text-gray-600" aria-label="Start date" />
              <span className="text-gray-400">to</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1 text-sm text-gray-600" aria-label="End date" />
              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-sm text-gray-600 hover:text-gray-900">Clear</button>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                {filteredInspections ? filteredInspections.length : '—'} shown
              </span>
            </div>
            <div className="w-full lg:hidden mt-1 text-xs text-gray-500">Tap to select the date</div> 
          </div>
        </div>

        {/* Inspections List */}
        <div className="p-4 lg:p-6">
          {sortedInspections.length === 0 ? (
            <div className="text-center py-12 lg:py-16 text-gray-500">
              <History className="w-12 h-12 lg:w-16 lg:h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-sm lg:text-base">
                {searchTerm || startDate || endDate ? 'No inspections match your filters' : 'No completed inspections yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {sortedInspections.map((inspection, idx) => (
                <FadeIn key={String(inspection.inspection_id || inspection.id || idx)} delay={80 + idx * 40} transitionDuration={300}>
                  <InspectionCard
                    inspection={inspection}
                    variant="completed"
                    onClick={() => {
                      if (typeof onResumeInspection === 'function') {
                        onResumeInspection({ ...inspection });
                      } else {
                        try { window.dispatchEvent(new CustomEvent('viewInspection', { detail: { inspectionId: String(inspection.id || inspection.inspection_id || '') } })); } catch (e) { /* ignore */ }
                      }
                    }}
                  />
                </FadeIn>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
