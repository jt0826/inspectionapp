import React from 'react';
import { ArrowLeft, Building2, MapPin } from 'lucide-react';
import type { Venue, Room } from '../types/venue';

interface VenueLayoutProps {
  venue: Venue;
  onBack: () => void;
}

export function VenueLayout({ venue, onBack }: VenueLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 text-white p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 lg:mb-6 text-sm lg:text-base">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Venues</span>
          </button>
          <div className="flex items-center gap-3 lg:gap-6">
            <Building2 className="w-8 h-8 text-white opacity-90" />
            <div>
              <h1 className="mb-1 text-xl lg:text-3xl">{venue.name}</h1>
              <p className="text-blue-100 text-sm lg:text-base flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{venue.address}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(venue.rooms || []).map((room: Room) => (
            <div key={room.id} className="bg-white border border-gray-200 rounded-lg p-4 lg:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 text-base lg:text-lg truncate">{room.name}</h3>
                  <div className="text-gray-500 text-sm mt-1">{(room.items || []).length} {(room.items || []).length === 1 ? 'item' : 'items'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                {(room.items || []).length > 0 ? (
                  (room.items || []).map((it: any, idx: number) => (
                    <div key={it.id || idx} className="px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-sm text-gray-700">
                      {it.name || it.itemName || `Item ${idx + 1}`}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm">No items defined</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
