import React, { useEffect, useState } from 'react';
import { Building2, MapPin, CheckCircle2, Home, ArrowRight, Loader2 } from 'lucide-react';
import { Venue } from '../App';
import { getVenueById } from '../utils/venueApi';
import { localIso } from '../utils/time';

interface InspectionConfirmationProps {
  venue?: Venue | null;
  pendingVenueId?: string | null;
  onConfirm: () => void;
  onReturnHome: () => void;
}

export function InspectionConfirmation({
  venue,
  pendingVenueId,
  onConfirm,
  onReturnHome,
}: InspectionConfirmationProps) {
  const [localVenue, setLocalVenue] = useState<Venue | null>(venue || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!venue && pendingVenueId) {
      (async () => {
        setLoading(true);
        try {
          const v = await getVenueById(String(pendingVenueId));
          if (v && !cancelled) {


            const mapped = { id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || localIso(), updatedAt: v.updatedAt || v.createdAt || localIso(), createdBy: v.createdBy || '' } as Venue;
            setLocalVenue(mapped);
          }
        } catch (e) {
          console.warn('Failed to fetch venue for confirmation', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [venue, pendingVenueId]);

  const displayVenue = venue || localVenue;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8">
          <div className="flex items-center gap-3 lg:gap-4 mb-4">
            <CheckCircle2 className="w-8 h-8 lg:w-10 lg:h-10" />
            <div>
              <h1 className="text-xl lg:text-3xl">Inspection Created</h1>
              <p className="text-blue-100 text-sm lg:text-base">Venue selected successfully</p>
            </div>
          </div>
        </div>

        {/* Venue Details Card */}
        <div className="p-6 lg:p-8">
          <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-300 rounded-xl p-6 lg:p-8 mb-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 lg:w-16 lg:h-16 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl lg:text-2xl text-gray-900 mb-2">{displayVenue?.name ?? 'Venue'}</h2>
                <div className="flex items-center gap-2 text-gray-700 mb-3">
                  <MapPin className="w-4 h-4 lg:w-5 lg:h-5 flex-shrink-0" />
                  <span className="text-sm lg:text-base">{displayVenue?.address ?? ''}</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-full">
                  <span className="text-sm lg:text-base text-gray-700">
                    {displayVenue ? `${displayVenue.rooms.length} ${displayVenue.rooms.length === 1 ? 'room' : 'rooms'} available` : 'Venue details unavailable'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white bg-opacity-60 rounded-lg p-4 lg:p-5 border border-green-200">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium text-sm lg:text-base">Inspection created and saved</span>
              </div>
              <p className="text-xs lg:text-sm text-gray-600">
                This inspection has been saved as ongoing. You can return to it anytime from the home page.
              </p>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 lg:p-5 mb-8">
            <h3 className="text-blue-900 font-medium mb-2 text-sm lg:text-base">What's next?</h3>
            <ul className="space-y-2 text-xs lg:text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Proceed to Room Selection</strong> - Continue now to select a room and start inspecting</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Return to Home</strong> - Save for later and resume anytime from ongoing inspections</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={onReturnHome}
              className="flex items-center justify-center gap-3 p-5 lg:p-6 bg-white border-2 border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-900 group"
            >
              <Home className="w-6 h-6 lg:w-7 lg:h-7 text-gray-600 group-hover:text-gray-900" />
              <div className="text-left">
                <div className="font-medium text-base lg:text-lg">Return to Home</div>
                <div className="text-xs lg:text-sm text-gray-600">Resume later</div>
              </div>
            </button>

            <button
              onClick={onConfirm}
              disabled={loading || !displayVenue}
              aria-disabled={loading || !displayVenue}
              className={`flex items-center justify-center gap-3 p-5 lg:p-6 rounded-xl transition-all text-white shadow-lg group ${loading || !displayVenue ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl'}`}
            >
              <div className="text-left flex-1">
                <div className="font-medium text-base lg:text-lg">{loading ? 'Loading…' : 'Proceed to Room Selection'}</div>
                <div className="text-xs lg:text-sm text-blue-100">{loading ? 'Fetching venue details' : 'Continue inspection'}</div>
              </div>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-6 h-6 lg:w-7 lg:h-7 group-hover:translate-x-1 transition-transform" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
