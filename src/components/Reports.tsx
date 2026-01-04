import React, { useState } from 'react';
import { ArrowLeft, FileText, Download, Calendar, Building2, CheckCircle2, XCircle, TrendingUp, BarChart3, Filter } from 'lucide-react';
import { Inspection, Venue } from '@/App';

interface ReportsProps {
  inspections: Inspection[];
  venues: Venue[];
  onBack: () => void;
}

export function Reports({ inspections, venues, onBack }: ReportsProps) {
  const [reportType, setReportType] = useState<'summary' | 'detailed' | 'venue'>('summary');
  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Calculate statistics
  const getStats = () => {
    const filteredInspections = inspections.filter((inspection) => {
      if (selectedVenue !== 'all' && inspection.venueId !== selectedVenue) return false;
      if (dateRange.start || dateRange.end) {
        if (!inspection.timestamp) return false;
        const inspectionDate = new Date(inspection.timestamp);
        const startDate = dateRange.start ? new Date(dateRange.start) : null;
        const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : null;
        if (startDate && inspectionDate < startDate) return false;
        if (endDate && inspectionDate > endDate) return false;
      }
      return true;
    });

    const totalInspections = filteredInspections.length;
    const totalItems = filteredInspections.reduce((sum, i) => sum + i.items.length, 0);
    const passedItems = filteredInspections.reduce(
      (sum, i) => sum + i.items.filter((item) => item.status === 'pass').length,
      0
    );
    const failedItems = filteredInspections.reduce(
      (sum, i) => sum + i.items.filter((item) => item.status === 'fail').length,
      0
    );
    const naItems = filteredInspections.reduce(
      (sum, i) => sum + i.items.filter((item) => item.status === 'na').length,
      0
    );
    const completedItems = passedItems + failedItems + naItems;
    const passRate = completedItems > 0 ? ((passedItems / completedItems) * 100).toFixed(1) : '0';

    // Venue breakdown
    const venueStats = venues.map((venue) => {
      const venueInspections = filteredInspections.filter((i) => i.venueId === venue.id);
      const venueIssues = venueInspections.reduce(
        (sum, i) => sum + i.items.filter((item) => item.status === 'fail').length,
        0
      );
      return {
        venueName: venue.name,
        inspectionCount: venueInspections.length,
        issueCount: venueIssues,
      };
    });

    // Category breakdown
    const categories = ['Safety', 'Cleanliness', 'Maintenance', 'Equipment', 'Compliance'];
    const categoryStats = categories.map((category) => {
      const categoryItems = filteredInspections.flatMap((i) =>
        // Items may not have category property anymore, so tolerate missing values
        (i.items as any[]).filter((item) => (item as any).category === category)
      );
      const passed = categoryItems.filter((item) => item.status === 'pass').length;
      const failed = categoryItems.filter((item) => item.status === 'fail').length;
      const total = passed + failed + categoryItems.filter((item) => item.status === 'na').length;
      return {
        category,
        passed,
        failed,
        total,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : '0',
      };
    });

    return {
      totalInspections,
      totalItems,
      passedItems,
      failedItems,
      naItems,
      completedItems,
      passRate,
      venueStats,
      categoryStats,
      filteredInspections,
    };
  };

  const stats = getStats();

  const exportToCSV = () => {
    const csvRows = [];
    csvRows.push(['Facility Inspection Report']);
    csvRows.push(['Generated:', new Date().toLocaleString()]);
    csvRows.push([]);
    csvRows.push(['Summary Statistics']);
    csvRows.push(['Total Inspections', stats.totalInspections]);
    csvRows.push(['Pass Rate', stats.passRate + '%']);
    csvRows.push(['Total Issues', stats.failedItems]);
    csvRows.push([]);
    csvRows.push(['Venue', 'Inspections', 'Issues']);
    stats.venueStats.forEach((v) => {
      csvRows.push([v.venueName, v.inspectionCount, v.issueCount]);
    });

    const csvContent = csvRows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspection-report-${Date.now()}.csv`;
    a.click();
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8 pb-8 print:hidden">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 text-sm lg:text-base">
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8" />
            <div>
              <h1>Reports</h1>
              <p className="text-blue-100 text-sm">Analytics and Insights</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 bg-gray-50 border-b print:hidden">
          <div className="space-y-3">
            {/* Report Type */}
            <div>
              <label className="block text-gray-700 text-sm mb-2">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="summary">Summary Report</option>
                <option value="detailed">Detailed Report</option>
                <option value="venue">Venue Comparison</option>
              </select>
            </div>

            {/* Venue Filter */}
            <div>
              <label className="block text-gray-700 text-sm mb-2">Venue</label>
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Venues</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-700 text-sm mb-1">Start Date</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-1">End Date</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={exportToCSV}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={printReport}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <FileText className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="p-4 print:p-8">
          {/* Print Header */}
          <div className="hidden print:block mb-6">
            <h1 className="text-2xl mb-2">Facility Inspection Report</h1>
            <p className="text-gray-600">Generated: {new Date().toLocaleString()}</p>
          </div>

          {/* Summary Stats */}
          <div className="mb-6">
            <h2 className="text-gray-700 mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              <span>Key Metrics</span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-blue-600 text-sm mb-1">Total Inspections</div>
                <div className="text-blue-900 text-2xl">{stats.totalInspections}</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-green-600 text-sm mb-1">Pass Rate</div>
                <div className="text-green-900 text-2xl">{stats.passRate}%</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-600 text-sm mb-1">Total Issues</div>
                <div className="text-red-900 text-2xl">{stats.failedItems}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="text-gray-600 text-sm mb-1">Items Checked</div>
                <div className="text-gray-900 text-2xl">{stats.completedItems}</div>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          {(reportType === 'summary' || reportType === 'detailed') && (
            <div className="mb-6">
              <h2 className="text-gray-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                <span>Category Performance</span>
              </h2>
              <div className="space-y-3">
                {stats.categoryStats.map((cat) => (
                  <div key={cat.category} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-gray-900">{cat.category}</h3>
                      <span className="text-sm text-gray-600">{cat.passRate}% pass</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${cat.passRate}%` }}
                      />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        {cat.passed} Pass
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-600" />
                        {cat.failed} Fail
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Venue Breakdown */}
          {(reportType === 'summary' || reportType === 'venue') && stats.venueStats.length > 0 && (
            <div className="mb-6">
              <h2 className="text-gray-700 mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                <span>Venue Breakdown</span>
              </h2>
              <div className="space-y-2">
                {stats.venueStats.map((venue) => (
                  <div key={venue.venueName} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-gray-900 text-sm">{venue.venueName}</h3>
                      <div className="flex gap-3 text-xs">
                        <span className="text-gray-600">{venue.inspectionCount} inspections</span>
                        <span className="text-red-600">{venue.issueCount} issues</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Inspections */}
          {reportType === 'detailed' && (
            <div>
              <h2 className="text-gray-700 mb-3">Detailed Inspection List</h2>
              <div className="space-y-3">
                {stats.filteredInspections.map((inspection, index) => {
                  const failed = inspection.items.filter((i) => i.status === 'fail').length;
                  return (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 text-sm">
                      <div className="mb-2">
                        <p className="text-gray-900">{inspection.venueName}</p>
                        <p className="text-gray-600 text-xs">{inspection.roomName}</p>
                        <p className="text-gray-500 text-xs">
                          {inspection.timestamp ? new Date(inspection.timestamp).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      {failed > 0 && (
                        <div className="text-red-700 text-xs">
                          {failed} issue{failed !== 1 ? 's' : ''} found
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}