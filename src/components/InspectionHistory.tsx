import React, { useState } from 'react';
import { ArrowLeft, History, Building2, Calendar, CheckCircle2, XCircle, AlertCircle, Search, Trash2 } from 'lucide-react';
import { Inspection } from '../App';

interface InspectionHistoryProps {
  inspections: Inspection[];
  onBack: () => void;
  onDeleteInspection: (inspectionId: string) => void;
}

import { useToast } from './ToastProvider';

export function InspectionHistory({ inspections, onBack, onDeleteInspection }: InspectionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'passed' | 'failed'>('all');
  const { show, confirm } = useToast();

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

  // Completed determination: status === 'completed' or all items are pass
  const isComplete = (inspection: Inspection) => {
    if (((inspection as any).status || '').toString().toLowerCase() === 'completed') return true;
    const items = inspection.items || [];
    if (items.length === 0) return false;
    // Normalize status when checking to be case-insensitive and robust to missing fields
    return items.every((it) => ((it.status || '').toString().toLowerCase() === 'pass'));
  };

  // History should show only completed inspections
  const completedInspections = inspections.filter(isComplete);

  const handleDelete = async (inspectionId: string) => {
    // Deleting from history is not allowed for completed inspections (immutable)
    show('Completed inspections cannot be deleted from history', { variant: 'error' });
  };

  const filteredInspections = completedInspections.filter((inspection) => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      inspection.venueName.toLowerCase().includes(searchLower) ||
      inspection.roomName.toLowerCase().includes(searchLower) ||
      inspection.inspectorName.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // Type filter
    if (filterType === 'all') return true;
    const failedItems = inspection.items.filter((i) => i.status === 'fail').length;
    if (filterType === 'failed') return failedItems > 0;
    if (filterType === 'passed') return failedItems === 0;

    return true;
  });

  // Sort by most recent first
  const sortedInspections = [...filteredInspections].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

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
                {completedInspections.length} completed inspection{completedInspections.length !== 1 ? 's' : ''}
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
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm lg:text-base"
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
              {sortedInspections.map((inspection) => {
                const passedItems = inspection.items.filter((i) => i.status === 'pass').length;
                const failedItems = inspection.items.filter((i) => i.status === 'fail').length;
                const naItems = inspection.items.filter((i) => i.status === 'na').length;
                const totalItems = inspection.items.length;
                const hasIssues = failedItems > 0;

                return (
                  <div
                    key={inspection.id}
                    className={`border-2 rounded-lg ${
                      hasIssues
                        ? 'border-red-200 bg-red-50'
                        : 'border-green-200 bg-green-50'
                    }`}
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
                              {inspection.venueName}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-sm lg:text-base mb-2">
                            <Building2 className={`w-4 h-4 flex-shrink-0 ${hasIssues ? 'text-red-700' : 'text-green-700'}`} />
                            <span className={hasIssues ? 'text-red-700' : 'text-green-700'}>
                              {inspection.roomName}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">Total Items</div>
                          <div className="text-lg lg:text-xl text-gray-900">{totalItems}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <div className="text-xs text-green-600 mb-1">Passed</div>
                          <div className="text-lg lg:text-xl text-green-700">{passedItems}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-red-200">
                          <div className="text-xs text-red-600 mb-1">Failed</div>
                          <div className="text-lg lg:text-xl text-red-700">{failedItems}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">N/A</div>
                          <div className="text-lg lg:text-xl text-gray-700">{naItems}</div>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="space-y-2 text-xs lg:text-sm">
                        <div className={`flex items-center gap-2 ${hasIssues ? 'text-red-600' : 'text-green-600'}`}>
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span>{formatDate(inspection.timestamp)}</span>
                        </div>
                        <div className={`${hasIssues ? 'text-red-700' : 'text-green-700'}`}>
                          Inspector: <span className="font-medium">{inspection.inspectorName}</span>
                        </div>
                      </div>

                      {/* Failed Items Details */}
                      {hasIssues && (
                        <div className="mt-4 pt-4 border-t border-red-200">
                          <h4 className="text-sm text-red-900 font-medium mb-2">Issues Found:</h4>
                          <div className="space-y-1">
                            {inspection.items
                              .filter((item) => item.status === 'fail')
                              .map((item, idx) => (
                                <div key={idx} className="text-xs lg:text-sm text-red-700 flex items-start gap-2">
                                  <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                  <span>{item.item}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Completed history items are immutable — no delete button */}
                    <div className="px-4 lg:px-6 pb-4 border-t border-opacity-30 text-sm text-gray-500">
                      Completed — immutable
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
