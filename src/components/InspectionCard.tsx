import React from 'react';
import { Clock, AlertCircle, CheckCircle2, XCircle, MinusCircle, Trash2 } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import FadeInText from './FadeInText';

const pick = (rec: Record<string, unknown> | null | undefined, ...keys: string[]) => {
  if (!rec) return '';
  for (const k of keys) {
    const v = (rec as any)[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
};

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

type Summary = { totals?: { pass?: number; fail?: number; na?: number; pending?: number; total?: number }; updatedAt?: string | null; updatedBy?: string | null };

export const InspectionCard = ({ inspection, variant = 'ongoing', onClick, onDelete, isDeleting = false, summary }: { inspection: any; variant?: 'ongoing'|'completed'; onClick?: (i?: any) => void; onDelete?: (e?: any, i?: any) => void; isDeleting?: boolean; summary?: Summary }) => {
  const isOngoing = variant === 'ongoing';
  const borderClass = isOngoing ? 'border-orange-200 bg-orange-50 hover:border-orange-400 hover:shadow-lg transition-all' : 'border-green-200 bg-green-50';
  const titleClass = isOngoing ? 'text-orange-900' : 'text-green-800';
  const subtitleClass = isOngoing ? 'text-orange-700' : 'text-green-700';
  const metaClass = isOngoing ? 'text-orange-600' : 'text-green-600';

  // Only use server-provided totals (from `summary.totals` or `inspection.totals`).
  // Do NOT compute totals from `inspection.items` on the client; hide counts when not provided by server.
  const sTotals = summary && (summary.totals as any) ? (summary.totals as any) : (inspection.totals || null);
  const totals = sTotals || null;
  const lastUpdated = pick(inspection, 'updatedAt', 'updated_at') || (summary && (summary.updatedAt || (summary as any).updated_at)) || (inspection.raw as any)?.updatedAt || (inspection.raw as any)?.updated_at || undefined;
  const lastUpdatedBy = pick(inspection, 'updatedBy', 'updated_by') || (summary && (summary.updatedBy || (summary as any).updated_by)) || (inspection.raw as any)?.updatedBy || (inspection.raw as any)?.updated_by || undefined;

  return (
    <div className={`border-2 ${borderClass} rounded-lg overflow-hidden`}>
      <button onClick={() => onClick && onClick(inspection)} className="w-full text-left">
        <div className="p-4 lg:p-6">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {isOngoing ? <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />}
                <h3 className={`${titleClass} truncate`}>{inspection.venueName}</h3>
              </div>
              {inspection.roomName && (
                <div>
                  <p className={`${subtitleClass} text-sm truncate`}>{inspection.roomName}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className={`flex items-center gap-2 text-xs lg:text-sm ${metaClass}`}>
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Created: {formatDate(inspection.timestamp)}</span>
            </div>
            <div className={`text-xs lg:text-sm ${subtitleClass} block`}>Created by: <span className="font-medium">{inspection.inspectorName || (inspection as any).createdBy || pick(inspection.raw as any, 'createdBy', 'created_by', 'inspectorName') || <span className="text-gray-400">—</span>}</span></div>

            <div className={`flex items-center gap-2 text-xs lg:text-sm ${metaClass}`}>
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>
                Last updated: <FadeInText visible={!!lastUpdated} className="inline-block">{lastUpdated ? formatDate(lastUpdated) : <span className="text-gray-400">—</span>}</FadeInText>
              </span>
            </div>
            <div className={`text-xs ${subtitleClass} block`}>Last updated by: <span className="font-medium">{lastUpdatedBy ?? <span className="text-gray-400">—</span>}</span></div>

            {totals && (
              <div className="flex gap-4 text-sm mt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Pass: <NumberFlow value={totals.pass ?? 0} className="inline-block" aria-label={`pass-count-${inspection.id}`} /></span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-gray-700">Fail: <NumberFlow value={totals.fail ?? 0} className="inline-block" aria-label={`fail-count-${inspection.id}`} /></span>
                </div>
                <div className="flex items-center gap-2">
                  <MinusCircle className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">NA: <NumberFlow value={totals.na ?? 0} className="inline-block" aria-label={`na-count-${inspection.id}`} /></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-500" />
                  <span className="text-gray-700">Pending: <NumberFlow value={totals.pending ?? 0} className="inline-block" aria-label={`pending-count-${inspection.id}`} /></span>
                </div>
              </div>
            )}
          </div>

          <div className={`pt-3 border-t ${isOngoing ? 'border-orange-200' : 'border-green-200'}`}>
            <span className={`${isOngoing ? 'text-orange-800' : 'text-green-800'} text-sm font-medium`}>{isOngoing ? 'Tap to continue →' : 'Tap to view →'}</span>
          </div>
        </div>
      </button>

      {isOngoing && (
        <div className="px-4 lg:px-6 pb-4 border-t border-orange-200">
          <button
            onClick={(e) => onDelete && onDelete(e, inspection)}
            disabled={isDeleting}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded transition-colors text-sm ${isDeleting ? 'bg-red-200 text-red-400 cursor-not-allowed' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
          >
            {isDeleting ? (
              <span>Deleting…</span>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete Inspection</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default InspectionCard;
