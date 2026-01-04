import React from 'react';
import { ArrowLeft, Grid } from 'lucide-react';

interface DashboardProps {
  onBack: () => void;
}

export function Dashboard({ onBack }: DashboardProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 lg:mb-6 text-sm lg:text-base">
            <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
            <span>Back to Home</span>
          </button>
          <div className="flex items-center gap-3 lg:gap-4">
            <Grid className="w-8 h-8 lg:w-10 lg:h-10" />
            <div>
              <h1 className="text-xl lg:text-3xl">Dashboard</h1>
              <p className="text-blue-100 text-sm lg:text-base">Quick insights and system status</p>
            </div>
          </div>
        </div>

        <div className="p-6 lg:p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="text-sm text-gray-700">Total Inspections</h3>
              <div className="text-2xl font-medium mt-2">—</div>
            </div>
            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="text-sm text-gray-700">Open Inspections</h3>
              <div className="text-2xl font-medium mt-2">—</div>
            </div>
            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="text-sm text-gray-700">Images Stored</h3>
              <div className="text-2xl font-medium mt-2">—</div>
            </div>
          </div>

          <div className="mt-6 p-4 border rounded-lg bg-white">
            <h4 className="text-sm text-gray-700 mb-2">Notes</h4>
            <p className="text-sm text-gray-600">This dashboard is a placeholder. We can add charts, recent activity, and alerts here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
