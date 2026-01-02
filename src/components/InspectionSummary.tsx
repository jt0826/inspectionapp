import { ArrowLeft, Building2, CheckCircle2, XCircle, AlertCircle, Trash2, Edit2 } from 'lucide-react';
import { Inspection } from '../App';
import { useState } from 'react';
import type { Venue } from '../App';
import { Filter, RotateCw, Image } from 'lucide-react';
import { useToast } from './ToastProvider';

interface InspectionSummaryProps {
  inspections: Inspection[];
  onBack: () => void;
  onClearAll: () => void;
  onEditInspection: (inspection: Inspection, index: number) => void;
  onDeleteInspection: (index: number) => void;
  onReInspection: (inspection: Inspection) => void;
  venues: Venue[];
}

export function InspectionSummary({ 
  inspections, 
  onBack, 
  onClearAll, 
  onEditInspection,
  onDeleteInspection,
  onReInspection,
  venues
}: InspectionSummaryProps) {
  const [filterVenue, setFilterVenue] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getInspectionStats = (inspection: Inspection) => {
    const pass = inspection.items.filter((item) => item.status === 'pass').length;
    const fail = inspection.items.filter((item) => item.status === 'fail').length;
    const na = inspection.items.filter((item) => item.status === 'na').length;
    const total = inspection.items.length;
    const completed = pass + fail + na;

    return { pass, fail, na, total, completed };
  };

  // Determine if an inspection is complete: either status === 'completed' or all items are pass
  const isComplete = (inspection: Inspection) => {
    if (((inspection as any).status || '').toString().toLowerCase() === 'completed') return true;
    const items = inspection.items || [];
    if (items.length === 0) return false;
    // Normalize status when checking to be case-insensitive and robust to missing fields
    return items.every((it) => ((it.status || '').toString().toLowerCase() === 'pass'));
  };

  const { show, confirm } = useToast();

  const handleDelete = async (index: number) => {
    const inspection = inspections[index];
    if (!inspection) return;
    const confirmed = await confirm({ title: 'Delete inspection', message: `Are you sure you want to delete the inspection for ${inspection.venueName || inspection.id}?`, confirmLabel: 'Delete', cancelLabel: 'Cancel' });
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('authToken') || '';
      const API_BASE = 'https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev';
      const { deleteInspection } = await import('../utils/inspectionApi');
      const result = await deleteInspection(inspection.id, token);
      if (!result || !result.ok) {
        console.error('Failed to delete inspection:', result);
        show('Failed to delete inspection', { variant: 'error' });
        return;
      }
      const data = result.data;
      const deleted = data && (data.deleted || 0);
      if (deleted && deleted > 0) {
        onDeleteInspection(index);
        show('Inspection deleted', { variant: 'success' });
      } else if (data && (data.inspectionDataDeleted || data.metaDeleted)) {
        onDeleteInspection(index);
        show('Inspection metadata removed', { variant: 'success' });
      } else {
        show('Delete completed but no inspection rows were removed', { variant: 'error' });
      }
    } catch (err) {
      console.error('Failed to delete inspection:', err);
      show('Failed to delete inspection', { variant: 'error' });
    }
  };

  const handleReInspection = (inspection: Inspection) => {
    onReInspection(inspection);
  };

  const totalInspections = inspections.length;
  const totalIssues = inspections.reduce(
    (sum, inspection) => sum + getInspectionStats(inspection).fail,
    0
  );

  // Only include completed inspections in the history view
  const completedInspections = inspections.filter(isComplete);

  const filteredInspections = completedInspections.filter((inspection) => {
    const startDate = filterStartDate ? new Date(filterStartDate) : null;
    const endDate = filterEndDate ? new Date(filterEndDate) : null;
    const inspectionDate = new Date(inspection.timestamp);

    const venueMatch = filterVenue === 'all' || inspection.venueName === filterVenue;
    const dateMatch =
      (!startDate || inspectionDate >= startDate) && (!endDate || inspectionDate <= endDate);

    return venueMatch && dateMatch;
  });

  const filteredCount = filteredInspections.length;

  const hasActiveFilters =
    filterVenue !== 'all' || filterStartDate !== '' || filterEndDate !== '';

  const clearFilters = () => {
    setFilterVenue('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setShowFilters(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8 pb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 text-sm lg:text-base">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Venues</span>
          </button>
          <h1 className="mb-2">Inspection Summary</h1>
          <p className="text-blue-100 text-sm">
            {totalInspections} {totalInspections === 1 ? 'inspection' : 'inspections'} completed
          </p>
        </div>

        {/* Overall Stats */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-gray-600 text-sm mb-1">Total Inspections</div>
              <div className="text-blue-600 text-2xl">{totalInspections}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-gray-600 text-sm mb-1">Total Issues</div>
              <div className="text-red-600 text-2xl">{totalIssues}</div>
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors ${
              hasActiveFilters ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span className="text-sm">Filters</span>
              {hasActiveFilters && (
                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs">
                  Active
                </span>
              )}
            </div>
            <span className="text-xs text-gray-600">
              {showFilters ? '▲' : '▼'}
            </span>
          </button>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-3 p-4 bg-white border border-gray-300 rounded-lg space-y-3">
              {/* Venue Filter */}
              <div>
                <label className="block text-gray-700 text-sm mb-1">Venue</label>
                <select
                  value={filterVenue}
                  onChange={(e) => setFilterVenue(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Venues</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Filter */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 text-sm mb-1">Start Date</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm mb-1">End Date</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        {completedInspections.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No inspections completed yet</p>
          </div>
        ) : (
          <>
            {/* Inspections List */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-gray-500 text-sm uppercase tracking-wide">
                  {hasActiveFilters ? `Filtered Inspections (${filteredCount})` : 'Completed Inspections'}
                </h2>
              </div>

              {filteredInspections.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No inspections match the current filters</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredInspections.map((inspection, index) => {
                    const stats = getInspectionStats(inspection);
                    const hasIssues = stats.fail > 0;

                    return (
                      <div
                        key={index}
                        className={`border rounded-lg p-4 ${
                          hasIssues ? 'border-red-200 bg-red-50' : 'border-gray-200'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Building2 className="w-4 h-4 text-gray-500" />
                              <h3 className="text-gray-900">{inspection.venueName}</h3>
                            </div>
                            <p className="text-gray-700">{inspection.roomName}</p>
                            <p className="text-gray-500 text-sm mt-1">{formatDate(inspection.timestamp)}</p>
                          </div>
                          {hasIssues && <AlertCircle className="w-6 h-6 text-red-600" />}
                        </div>

                        {/* Stats */}
                        <div className="flex gap-3 text-sm pt-3 border-t">
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-gray-700">{stats.pass} Pass</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span className="text-gray-700">{stats.fail} Fail</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-600">{stats.na} N/A</span>
                          </div>
                        </div>

                        {/* Failed Items */}
                        {hasIssues && (
                          <div className="mt-3 pt-3 border-t border-red-200">
                            <p className="text-red-900 text-sm mb-2">Issues Found:</p>
                            <ul className="space-y-2">
                              {inspection.items
                                .filter((item) => item.status === 'fail')
                                .map((item) => (
                                  <li key={item.id} className="text-sm text-red-800">
                                    • {item.item}
                                    {item.notes && (
                                      <p className="text-red-700 ml-4 mt-1 italic">Note: {item.notes}</p>
                                    )}
                                    {item.photos && item.photos.length > 0 && (
                                      <div className="ml-4 mt-2 flex gap-2 flex-wrap">
                                        {item.photos.map((photo, photoIndex) => (
                                          <img
                                            key={photoIndex}
                                            src={photo}
                                            alt={`Evidence ${photoIndex + 1}`}
                                            className="w-16 h-16 object-cover rounded border border-red-300 cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => window.open(photo, '_blank')}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}

                        {/* Action Buttons: completed history items are immutable (no edit/delete) */}
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          {hasIssues && (
                            <button
                              onClick={() => handleReInspection(inspection)}
                              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition-colors text-sm"
                            >
                              <RotateCw className="w-4 h-4" />
                              <span>Re-inspect</span>
                            </button>
                          )}
                          <div className="flex-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}