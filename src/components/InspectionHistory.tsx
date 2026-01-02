import React, { useState, useEffect } from 'react';
import { ArrowLeft, History, Building2, Calendar, CheckCircle2, XCircle, AlertCircle, Search, Trash2 } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import FadeInText from './FadeInText';
import FadeIn from 'react-fade-in';
import { Inspection } from '../App';
import { getInspections, getInspectionItems } from '../utils/inspectionApi';

interface InspectionHistoryProps {
  inspections: Inspection[];
  onBack: () => void;
  onDeleteInspection: (inspectionId: string) => void;
}

import { useToast } from './ToastProvider';
import { checkInspectionComplete } from '../utils/inspectionApi';

export function InspectionHistory({ inspections, onBack, onDeleteInspection }: InspectionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  // Fade-in animations
  const [filterType, setFilterType] = useState<'all' | 'passed' | 'failed'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const { show, confirm } = useToast();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Completed determination: status === 'completed' or all items are pass (works with DB rows or local objects)
  const isComplete = (inspection: any) => {
    const status = String(inspection.status || inspection.state || inspection.status || '').toLowerCase();
    if (status === 'completed') return true;
    const items = (inspection.items || []) as any[];
    if (!Array.isArray(items) || items.length === 0) return false;
    return items.every((it) => String(it?.status || '').toLowerCase() === 'pass');
  };

  // Prefer DB-sourced inspections when available for accurate counts
  const [dbInspections, setDbInspections] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchAndEnrich = async () => {
      try {
        const items = await getInspections();
        if (cancelled) return;

        // Sequential enrichment: fetch items for each inspection and attach to row when available
        const enriched: any[] = [];
        for (const it of (items || [])) {
          try {
            const id = String(it.inspection_id || it.id || '');
            const fetched = await getInspectionItems(id);
            if (fetched && Array.isArray(fetched)) {
              enriched.push({ ...it, items: fetched });
            } else {
              // preserve any existing items if API didn't return them
              enriched.push({ ...it, items: it.items || [] });
            }
          } catch (e) {
            enriched.push({ ...it, items: it.items || [] });
          }
        }

        if (!cancelled) setDbInspections(enriched);
      } catch (e) {
        console.warn('Failed to fetch inspections for history', e);
        if (!cancelled) setDbInspections([]);
      }
    };

    fetchAndEnrich();

    const onFocus = () => { fetchAndEnrich(); };
    const onSaved = () => { fetchAndEnrich(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('inspectionSaved', onSaved as EventListener);

    return () => { cancelled = true; window.removeEventListener('focus', onFocus); window.removeEventListener('inspectionSaved', onSaved as EventListener); };
  }, []);

  const sourceInspections: any[] = (dbInspections && dbInspections.length > 0) ? dbInspections : inspections;

  // Compute a completion map (reuse same logic as InspectorHome: status, items, or server check)
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [checkingComplete, setCheckingComplete] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCheckingComplete(true);
      const map: Record<string, boolean> = {};
      for (const it of sourceInspections) {
        try {
          const id = String(it.inspection_id || it.id || '');
          if (!id) continue;
          const status = String(it.status || it.state || '').toLowerCase();
          if (status === 'completed') { map[id] = true; continue; }

          const items = (it.items || []) as any[];
          if (Array.isArray(items) && items.length > 0) {
            map[id] = items.every((i) => String(i?.status || '').toLowerCase() === 'pass');
            if (map[id]) continue;
          }

          const venueId = String(it.venueId || it.venue_id || it.venue || '');
          if (!venueId) { map[id] = false; continue; }

          try {
            const c = await checkInspectionComplete(id, venueId);
            map[id] = !!(c && c.complete === true);
          } catch (e) {
            map[id] = false;
          }
        } catch (e) {
          // Resilient: ignore and move on
        }
      }
      if (!cancelled) {
        setCompletedMap(map);
        setCheckingComplete(false);
        console.log('[History] sourceInspections:', sourceInspections.length, 'completedMapCount:', Object.values(map).filter(Boolean).length, 'completedIds:', Object.keys(map).filter(k => map[k]));
      }
    })();
    return () => { cancelled = true; };
  }, [sourceInspections]);

  // History should show only completed inspections (based on status, items, or server check)
  const completedInspections = sourceInspections.filter((inspection: any) => {
    const id = String(inspection.inspection_id || inspection.id || '');
    if (isComplete(inspection)) return true;
    if (id && completedMap[id]) return true;
    return false;
  });

  const handleDelete = async (inspectionId: string) => {
    // Deleting from history is not allowed for completed inspections (immutable)
    show('Completed inspections cannot be deleted from history', { variant: 'error' });
  };

  const filteredInspections = completedInspections.filter((inspection: any) => {
    const searchLower = searchTerm.toLowerCase();
    const venueName = String(inspection.venueName || inspection.venue_name || inspection.venue || '').toLowerCase();
    const roomName = String(inspection.roomName || inspection.room_name || inspection.room || '').toLowerCase();
    const inspectorName = String(inspection.inspectorName || inspection.created_by || inspection.inspector_name || inspection.createdBy || '').toLowerCase();

    const matchesSearch =
      venueName.includes(searchLower) ||
      roomName.includes(searchLower) ||
      inspectorName.includes(searchLower);

    if (!matchesSearch) return false;

    // Type filter
    if (filterType === 'all') {
      // proceed
    } else {
      const rawItems = (inspection.items || []) as any[];
      const items = rawItems.filter((it) => it && (it.itemId || it.id || it.item || it.ItemId));
      const failedItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'fail').length;
      if (filterType === 'failed' && !(failedItems > 0)) return false;
      if (filterType === 'passed' && !(failedItems === 0)) return false;
    }

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

  // Sort by most recent first (defensive timestamp handling)
  const sortedInspections = [...filteredInspections].sort((a: any, b: any) => {
    const aTs = String(a.completedAt || a.completed_at || a.timestamp || a.created_at || a.createdAt || a.updatedAt || a.updated_at || '');
    const bTs = String(b.completedAt || b.completed_at || b.timestamp || b.created_at || b.createdAt || b.updatedAt || b.updated_at || '');
    return new Date(bTs).getTime() - new Date(aTs).getTime();
  });

  // Render list using normalized field access
  const renderInspectionItem = (inspection: any, idx: number) => {
    const id = String(inspection.id || inspection.inspection_id || '');
    const rawItems = (inspection.items || []) as any[];
    const items = rawItems.filter((it) => it && (it.itemId || it.id || it.item || it.ItemId));
    const passedItems = items.filter((i) => String(i?.status || '').toLowerCase() === 'pass').length;
    const failedItems = items.filter((i) => String(i?.status || '').toLowerCase() === 'fail').length;
    const naItems = items.filter((i) => String(i?.status || '').toLowerCase() === 'na').length;
    const totalItems = items.length;
    const hasIssues = failedItems > 0;

    const venueName = String(inspection.venueName || inspection.venue_name || inspection.venue || '');
    const roomName = String(inspection.roomName || inspection.room_name || inspection.room || '');
    const inspectorName = String(inspection.inspectorName || inspection.created_by || inspection.inspector_name || inspection.createdBy || '');
    const timestamp = String(inspection.timestamp || inspection.created_at || inspection.createdAt || inspection.updatedAt || '');

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

            {/* Filter Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm lg:text-base transition-colors ${
                  filterType === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('passed')}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm lg:text-base transition-colors ${
                  filterType === 'passed'
                    ? 'bg-green-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Passed
              </button>
              <button
                onClick={() => setFilterType('failed')}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm lg:text-base transition-colors ${
                  filterType === 'failed'
                    ? 'bg-red-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Issues
              </button>
            </div>

            {/* Date range filter (client-side) */}
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1 text-sm text-gray-600" aria-label="Start date" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1 text-sm text-gray-600" aria-label="End date" />
              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-sm text-gray-600 hover:text-gray-900">Clear</button>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                {filteredInspections ? filteredInspections.length : '—'} shown
              </span>
            </div> 
          </div>
        </div>

        {/* Inspections List */}
        <div className="p-4 lg:p-6">
          {sortedInspections.length === 0 ? (
            <div className="text-center py-12 lg:py-16 text-gray-500">
              <History className="w-12 h-12 lg:w-16 lg:h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-sm lg:text-base">
                {searchTerm || filterType !== 'all' ? 'No inspections match your filters' : 'No completed inspections yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4 lg:space-y-6">
              {sortedInspections.map((inspection, idx) => (
                <FadeIn key={String(inspection.inspection_id || inspection.id || idx)} delay={80 + idx * 40} transitionDuration={300}>
                  {renderInspectionItem(inspection, idx)}
                </FadeIn>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
