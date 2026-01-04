import React, { useState } from 'react';
import FadeIn from 'react-fade-in';
import { ArrowLeft, Building2, MapPin, Plus, Edit2, Trash2, User, LogOut, Clock, UserCircle } from 'lucide-react';
import { Venue } from '../App';
import { localIso } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastProvider';
import type { Inspection } from '../App';

import { getVenues } from '../utils/venueApi';

interface VenueListProps {
  venues: Venue[];
  onVenueSelect: (venue: Venue) => void;
  onViewVenue?: (venue: Venue) => void; // Open venue layout preview
  onViewProfile: () => void;
  onAddVenue: () => void;
  onEditVenue: (venue: Venue) => void;
  onDeleteVenue: (venueId: string) => void;
  onBack: () => void;
  inspectionsCount?: Record<string, number>;
  onVenuesLoaded?: (venues: Venue[]) => void; // optional callback to inform parent that venues have been loaded
} 

export function VenueList({ 
  venues, 
  onVenueSelect, 
  onViewVenue,
  onViewProfile,
  onAddVenue,
  onEditVenue,
  onDeleteVenue,
  onBack,
  inspectionsCount,
  onVenuesLoaded,
}: VenueListProps) {
  const { user, logout } = useAuth();

  const [deleting, setDeleting] = useState(false);
  const [localVenues, setLocalVenues] = useState<Venue[]>(venues || []);
  // Use global toast + confirm
  const { show, confirm } = useToast();

  // Fetch venues when this page loads if none provided
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (venues && venues.length > 0) {
        setLocalVenues(venues);
        return;
      }
      try {
        const items = await getVenues();
        if (cancelled) return;
        const mapped = items.map((v: any) => ({ id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || localIso(), updatedAt: v.updatedAt || v.createdAt || localIso(), createdBy: v.createdBy || '' }));
        setLocalVenues(mapped);
        if (typeof onVenuesLoaded === 'function') onVenuesLoaded(mapped);
      } catch (e) {
        console.warn('Failed to load venues on VenueList mount', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDeleteClick = async (e: React.MouseEvent, venue: Venue) => {
    e.stopPropagation();
    const count = inspectionsCount?.[venue.id] ?? 0;

    // Compute number of uploaded images across all inspections for this venue (best-effort)
    let totalImages = 0;
    if (count > 0) {
      try {
        const { getInspections } = await import('../utils/inspectionApi');
        const { listImagesForInspection } = await import('../utils/inspectionApi');
        const allInsps = await getInspections();
        const venueInsps = (allInsps || []).filter((ins: any) => String(ins.venueId || ins.venue_id || ins.venue) === String(venue.id));
        for (const ins of venueInsps) {
          const imgs = await listImagesForInspection(String(ins.inspection_id || ins.id));
          totalImages += (imgs && imgs.length) || 0;
        }
      } catch (e) {
        console.warn('Failed to compute image count for venue', e);
      }
    }

    const confirmed = await confirm({
      title: 'Delete venue',
      message: `Are you sure you want to delete ${venue.name}?${count > 0 ? ' This will also delete ' + count + ' associated inspection' + (count !== 1 ? 's' : '') + (totalImages > 0 ? ' and ' + totalImages + ' uploaded image' + (totalImages !== 1 ? 's' : '') + '.' : '.') : ''}`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const success = await onDeleteVenue(venue.id) as any;
      if (success === true || success === undefined) {
        show(`${venue.name} deleted`, { variant: 'success' });

        // Refresh venues from server to ensure list is authoritative
        try {
          const items = await getVenues();
          const mapped = items.map((v: any) => ({ id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || localIso(), updatedAt: v.updatedAt || v.createdAt || localIso(), createdBy: v.createdBy || '' }));
          setLocalVenues(mapped);
          if (typeof onVenuesLoaded === 'function') onVenuesLoaded(mapped);
          show('Venue list refreshed', { variant: 'success' });
        } catch (e) {
          console.warn('Failed to refresh venues after delete', e);
          show('Venue deleted but failed to refresh list', { variant: 'info' });
        }

      } else {
        show(`Failed to delete ${venue.name}`, { variant: 'error' });
      }
    } catch (err) {
      console.error('Delete failed', err);
      show(`Failed to delete ${venue.name}`, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (e: React.MouseEvent, venue: Venue) => {
    e.stopPropagation();
    onEditVenue(venue);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Defensive back handler: ensure click events don't get swallowed and that onBack exists before calling
  const handleBackClick = (e: React.MouseEvent) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {
      // ignore
    }
    if (typeof onBack === 'function') {
      try { onBack(); } catch (err) { console.error('Error in onBack handler', err); }
    } else {
      console.warn('VenueList: onBack prop not provided');
    }
  };



  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8">
          <div className="flex items-center justify-between mb-4 lg:mb-6">
            <div className="flex items-center gap-3 lg:gap-4">
              <Building2 className="w-8 h-8 lg:w-10 lg:h-10" />
              <div>
                <h1 className="text-xl lg:text-3xl">Facility Inspector</h1>
                <p className="text-blue-100 text-sm lg:text-base">Welcome, {user?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div />
              <button
                onClick={logout}
                className="p-2 lg:p-3 text-blue-100 hover:text-white hover:bg-blue-700 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
            </div>
          </div>

          {/* Manage Venues header (replaces the user profile card) */}
            <button type="button" onClick={handleBackClick} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 lg:mb-6 text-sm lg:text-base">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <h1 className="mb-2 text-xl lg:text-3xl">Manage Venues</h1>
            <p className="text-blue-100 text-sm lg:text-base">Manage facility locations and rooms</p>
        </div>

        {/* Quick Actions */}
        <div className="p-4 lg:p-6 bg-gray-50 border-b">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            <button
              onClick={onAddVenue}
              className="col-span-1 flex items-center justify-center gap-2 lg:gap-3 p-4 lg:p-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5 lg:w-6 lg:h-6" />
              <span className="text-sm lg:text-base">Add New Venue</span>
            </button>
          </div>
        </div>

        {/* Venues List */}
        <div className="p-4 lg:p-6">
          {(localVenues.length === 0) ? (
            <div className="text-center py-12 lg:py-16 text-gray-500">
              <Building2 className="w-12 h-12 lg:w-16 lg:h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-sm lg:text-base">No venues yet. Add your first facility to begin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
              {localVenues.map((venue, idx) => (
                <FadeIn key={venue.id} delay={80 + idx * 40} transitionDuration={240}>
                  <div
                    className="border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all group"
                  >
                    <button
                      onClick={() => (typeof onViewVenue === 'function' ? onViewVenue(venue) : onVenueSelect(venue))}
                      className="w-full text-left p-4 lg:p-6"
                    >
                      <div className="flex items-start justify-between mb-3 lg:mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-gray-900 text-base lg:text-lg truncate">{venue.name}</h3>
                          </div> 
                          <div className="flex items-center gap-2 text-gray-600 text-sm lg:text-base mb-2">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{venue.address}</span>
                          </div>
                          <div className="text-gray-500 text-sm">
                            {venue.rooms.length} {venue.rooms.length === 1 ? 'room' : 'rooms'}
                          </div>
                        </div>
                        <Building2 className="w-6 h-6 lg:w-8 lg:h-8 text-gray-400 flex-shrink-0" />
                      </div>

                      {/* Metadata */}
                      <div className="space-y-1.5 text-xs lg:text-sm text-gray-500 mb-3 lg:mb-4 pb-3 lg:pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <UserCircle className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
                          <span className="truncate">Created by: <span className="text-gray-700">{venue.createdBy}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
                          <span className="truncate">Created: <span className="text-gray-700">{formatDate(venue.createdAt)}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
                          <span className="truncate">Updated: <span className="text-gray-700">{formatDate(venue.updatedAt)}</span></span>
                        </div>
                        {/* Always reserve space for inspections count so UI alignment remains stable even when count is 0 or unavailable */}
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="truncate">Inspections: <span className="text-gray-700 inline-block min-w-[0.5rem] text-right">{(inspectionsCount && inspectionsCount[venue.id] !== undefined) ? inspectionsCount[venue.id] : 0}</span></span>
                        </div>
                      </div>


                    </button>
                  
                    {/* Action Buttons */}
                    <div className="flex gap-2 px-4 lg:px-6 pb-4 lg:pb-6 pt-2 border-t border-gray-100">
                      <button
                        onClick={(e) => handleEdit(e, venue)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 lg:py-3 px-3 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm lg:text-base"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(e, venue)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 lg:py-3 px-3 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors text-sm lg:text-base"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          )}



        </div>
      </div>
    </div>
  );
}
