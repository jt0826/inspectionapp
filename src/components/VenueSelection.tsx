import React, { useState } from 'react';
import { ArrowLeft, Building2, MapPin, ChevronRight, CheckCircle2, ChevronDown } from 'lucide-react';
import type { Venue } from '../types/venue';
import LoadingOverlay from './LoadingOverlay';
import { API } from '../config/api';
import { generateInspectionId } from '../utils/id';
import { useDisplayName } from '../contexts/AuthContext';
import { useInspectionContext } from '../contexts/InspectionContext';

interface VenueSelectionProps {
  venues: Venue[];
  onVenueSelect: (venue: Venue) => void;
  onBack: () => void;
  // If the parent has an active draft inspection, pass its id to avoid creating a duplicate
  currentInspectionId?: string | null;
  // If true, the user initiated a "create new inspection" flow (no draft exists yet)
  isCreatingNewInspection?: boolean;
  // Notify parent when a new inspection was successfully created on the server
  onInspectionCreated?: (inspection: any, originVenue?: Venue | null) => void;
}

export function VenueSelection({ venues, onVenueSelect, onBack, currentInspectionId, isCreatingNewInspection, onInspectionCreated }: VenueSelectionProps) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [localVenues, setLocalVenues] = useState<Venue[]>(venues || []);
  const [creating, setCreating] = useState(false);
  const [loadingVenues, setLoadingVenues] = useState<boolean>(false);
  const displayName = useDisplayName();
  const { triggerRefresh } = useInspectionContext();

  // If parent didn't provide venues, load them on mount so selection is available

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (venues && venues.length > 0) {
        setLocalVenues(venues);
        return;
      }
      setLoadingVenues(true);
      try {
        const { getVenues } = await import('../utils/venueApi');
        const items = await getVenues();
        if (cancelled) return;
        const mapped = items.map((v: any) => ({ id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || '', updatedAt: v.updatedAt || v.createdAt || '', createdBy: v.createdBy || '' }));
        setLocalVenues(mapped);
      } catch (e) {
        console.warn('Failed to load venues for selection', e);
      } finally {
        setLoadingVenues(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleVenueClick = (venue: Venue) => {
    if (selectedVenue?.id === venue.id) {
      // Deselect if clicking the same venue
      setSelectedVenue(null);
    } else {
      setSelectedVenue(venue);
    }
  };

  const handleCreateInspection = async () => {
    // Only proceed if a venue is selected
    if (!selectedVenue) {
      console.warn('No venue selected');
      return;
    }

    // No draft exists: create a new inspection
    const inspectionId = generateInspectionId(); // Generate a unique inspection ID
    const payload = {
      action: 'create_inspection',
      inspection: {
        inspection_id: inspectionId,
        createdBy: displayName,
        updatedBy: displayName,
        venueId: selectedVenue?.id,
        venueName: selectedVenue?.name,
        status: 'in-progress',
      }
    };

    try {
      setCreating(true);
      {/* IMPORTANT: call the new inspections-create resource to create an inspection */}
      const response = await fetch(API.inspectionsCreate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log('Inspection created successfully');
        let data: any = null;
        try { data = await response.json(); } catch (_) { data = null; }
        let body = data && data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
        const created = body?.inspectionData || body?.inspection || body;
        if (typeof onInspectionCreated === 'function') {
          // Debug: log server-returned created object and current selectedVenue
          console.debug('VenueSelection: create response created=', created, 'selectedVenue=', selectedVenue);
          // Pass the created inspection and the selectedVenue so the parent can optimistically show venue details
          onInspectionCreated(created || { inspection_id: inspectionId, venueId: selectedVenue?.id, venueName: selectedVenue?.name, venue_name: selectedVenue?.name, status: 'in-progress' }, selectedVenue);
        }
        // After creating an inspection on the server, notify app-wide consumers that
        // inspection lists have changed via `triggerRefresh()`. This avoids using
        // global DOM events and keeps update flow explicit to React components.
        try {
          triggerRefresh?.();
        } catch (e) { /* ignore */ }      } else {
        console.error('Failed to create inspection');
      }
    } catch (error) {
      console.error('Error creating inspection:', error);
    } finally {
      setCreating(false);
    }
  }
  

  return (
    <div className="min-h-screen bg-white">
      <LoadingOverlay visible={loadingVenues} message={"Loading venues…"} />
      <div className="max-w-4xl mx-auto pb-24">
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
            <Building2 className="w-8 h-8 lg:w-10 lg:h-10" />
            <div>
              <h1 className="text-xl lg:text-3xl">Select Venue</h1>
              <p className="text-blue-100 text-sm lg:text-base">Choose a facility to inspect</p>
            </div>
          </div>
        </div>

        {/* Venues List */}
        <div className="p-4 lg:p-6">
          {localVenues.length === 0 ? (
            <div className="text-center py-12 lg:py-16 text-gray-500">
              <Building2 className="w-12 h-12 lg:w-16 lg:h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-sm lg:text-base">No venues available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {localVenues.map((venue) => {
                const isSelected = selectedVenue?.id === venue.id;
                
                return (
                  <div
                    key={venue.id}
                    className={`border-2 rounded-lg transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-lg'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <button
                      onClick={() => handleVenueClick(venue)}
                      disabled={creating}
                      className="w-full text-left p-5 lg:p-6 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className={`text-base lg:text-lg truncate ${
                              isSelected ? 'text-blue-700 font-medium' : 'text-gray-900'
                            }`}>
                              {venue.name}
                            </h3>
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-gray-600 text-sm lg:text-base mb-2">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{venue.address}</span>
                          </div>
                          <div className={`text-sm ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                            {venue.rooms.length} {venue.rooms.length === 1 ? 'room' : 'rooms'}
                          </div>
                        </div>
                        <ChevronDown className={`w-6 h-6 lg:w-7 lg:h-7 flex-shrink-0 transition-transform ${
                          isSelected ? 'text-blue-600 rotate-180' : 'text-gray-400'
                        }`} />
                      </div>
                    </button>

                    {/* Rooms Preview - Shows when selected */}
                    {isSelected && (
                      <div className="px-5 lg:px-6 pb-5 lg:pb-6 border-t border-blue-200">
                        <div className="pt-4">
                          <h4 className="text-sm text-blue-900 font-medium mb-3">Available Rooms:</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {venue.rooms.map((room) => (
                              <div
                                key={room.id}
                                className="flex items-center gap-2 p-3 bg-white rounded-lg border border-blue-200"
                              >
                                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-900 truncate">{room.name}</div>
                                  <div className="text-xs text-gray-500">{room.items?.length ? `${room.items.length} item${room.items.length !== 1 ? 's' : ''}` : 'No items'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Bottom Create Button */}
        {selectedVenue && (
          <div className="fixed bottom-0 left-0 right-0 p-4 lg:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t shadow-lg max-w-4xl mx-auto">
            <LoadingOverlay visible={creating} message="Creating…" />
            <button
              onClick={handleCreateInspection}
              disabled={!selectedVenue || creating}
              className={`w-full py-4 lg:py-5 px-6 rounded-xl transition-all flex items-center justify-center gap-3 group ${!selectedVenue ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'}`}
            >
              <CheckCircle2 className="w-6 h-6 lg:w-7 lg:h-7" />
              <div className="text-left flex-1">
                <div className="font-medium text-base lg:text-lg">Create Inspection</div>
                <div className="text-xs lg:text-sm text-blue-100">
                  {selectedVenue ? `for ${selectedVenue.name}` : 'Select a venue to continue'}
                </div>
              </div>
              <ChevronRight className="w-6 h-6 lg:w-7 lg:h-7 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
