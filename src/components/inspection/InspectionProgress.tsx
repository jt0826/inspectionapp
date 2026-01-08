import React from 'react';
import { CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';
import NumberFlow from '@number-flow/react';

interface Props {
  completedCount: number;
  totalCount: number;
  passCount: number;
  failCount: number;
  naCount: number;
  pendingCount: number;
}

export default function InspectionProgress({ completedCount, totalCount, passCount, failCount, naCount, pendingCount }: Props) {
  const percent = totalCount ? ((completedCount / totalCount) * 100) : 0;
  return (
    <div className="p-4 bg-gray-50 border-b sticky top-0 lg:top-[140px] z-10">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-gray-700">Progress</span>
        <span className="text-gray-900">
          <NumberFlow value={completedCount ?? null} className="inline-block" /> / <NumberFlow value={totalCount ?? null} className="inline-block" />
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-gray-700">Pass: <NumberFlow value={passCount ?? null} className="inline-block" /></span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-600" />
          <span className="text-gray-700">Fail: <NumberFlow value={failCount ?? null} className="inline-block" /></span>
        </div>
        <div className="flex items-center gap-2">
          <MinusCircle className="w-4 h-4 text-gray-600" />
          <span className="text-gray-700">N/A: <NumberFlow value={naCount ?? null} className="inline-block" /></span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-600" />
          <span className="text-gray-500 text-sm">Pending: <NumberFlow value={pendingCount ?? null} className="inline-block" /></span>
        </div>
      </div>
    </div>
  );
}
