import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { Login } from './components/Login';
import { VenueList } from './components/VenueList';
import { RoomList } from './components/RoomList';
import { InspectionForm } from './components/InspectionForm';
import { InspectionHistory } from './components/InspectionHistory';
import { VenueForm } from './components/VenueForm';
import { UserProfile } from './components/UserProfile';
import { InspectorHome } from './components/InspectorHome';
import { getInspectionItems } from './utils/inspectionApi';
import { VenueSelection } from './components/VenueSelection';
import { InspectionConfirmation } from './components/InspectionConfirmation';
import { VenueLayout } from './components/VenueLayout';
import { API } from './config/api';
import { generateItemId, generateInspectionId } from './utils/id';
import { Dashboard } from './components/Dashboard';
import { useToast } from './components/ToastProvider';
import { getVenueById } from './utils/venueApi';

import type { Venue, Room } from './types/venue';
import type { Inspection, InspectionItem, Photo } from './types/inspection';

const mockVenues: Venue[] = [
  {
    id: 'v1',
    name: 'Downtown Office Complex',
    address: '123 Main Street',
    rooms: [
      { id: 'r1', name: 'Conference Room A', items: [{ id: 'i1', name: 'Extinguisher' }] },
      { id: 'r2', name: 'Conference Room B', items: [{ id: 'i2', name: 'Projector' }] },
      { id: 'r3', name: 'Main Lobby', items: [] },
      { id: 'r4', name: 'Restroom 1F', items: [] },
      { id: 'r5', name: 'Kitchen', items: [{ id: 'i3', name: 'First Aid Kit' }] },
    ],
    createdAt: '2023-01-01T12:00:00Z',
    updatedAt: '2023-01-01T12:00:00Z',
    createdBy: 'admin',
  },
  {
    id: 'v2',
    name: 'Westside Community Center',
    address: '456 Oak Avenue',
    rooms: [
      { id: 'r6', name: 'Gymnasium', items: [] },
      { id: 'r7', name: 'Multi-purpose Room', items: [] },
      { id: 'r8', name: 'Storage', items: [] },
      { id: 'r9', name: 'Restroom 2F', items: [] },
    ],
    createdAt: '2023-01-01T12:00:00Z',
    updatedAt: '2023-01-01T12:00:00Z',
    createdBy: 'admin',
  },
  {
    id: 'v3',
    name: 'Tech Hub East',
    address: '789 Innovation Drive',
    rooms: [
      { id: 'r10', name: 'Open Workspace', items: [] },
      { id: 'r11', name: 'Private Office 1', items: [] },
      { id: 'r12', name: 'Break Room', items: [] },
      { id: 'r13', name: 'Server Room', items: [] },
    ],
    createdAt: '2023-01-01T12:00:00Z',
    updatedAt: '2023-01-01T12:00:00Z',
    createdBy: 'admin',
  },
];

type View =
  | 'home'
  | 'venues'
  | 'rooms'
  | 'inspection'
  | 'addVenue'
  | 'editVenue'
  | 'profile'
  | 'history'
  | 'selectVenue'
  | 'confirmInspection'
  | 'venueLayout'
  | 'dashboard';

function AppContent() {
  const { isAuthenticated, user } = useAuth();
  const [currentView, setCurrentView] = useState<View>('home');
  const [inspectionReadOnly, setInspectionReadOnly] = useState<boolean>(false);
  // Replace hard-coded venues with data from backend
  const [venues, setVenues] = useState<Venue[]>([]);
  // API base moved to `src/config/api.ts` (use `API` constants)



  // Map DB venue shape to frontend Venue type
  const mapDbVenueToVenue = (v: any): Venue => ({
    id: v.venueId || v.id,
    name: v.name || '',
    address: v.address || '',
    rooms: (v.rooms || []).map((r: any) => ({
      id: r.roomId || r.id,
      name: r.name || '',
      items: (r.items || []).map((it: any) => ({ id: it.itemId || it.id, name: it.name || it.item || '' })),
    })),
    createdAt: v.createdAt || '',
    updatedAt: v.updatedAt || v.createdAt || '',
    createdBy: v.createdBy || ''
  });

  // NOTE: Venue fetching is now performed by VenueList and RoomList when those pages load.
  // App keeps a `venues` state that will be populated by child pages via callbacks when necessary.
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [pendingVenueId, setPendingVenueId] = useState<string | null>(null);

  // NOTE: Database-sourced inspections are now fetched by `InspectorHome` to avoid duplicate network calls.
  // The App-level code no longer fetches `list_inspections` to prevent unnecessary duplication and reduce load.

  const inspectionsCountMap = React.useMemo(() => {
    return inspections.reduce((acc: Record<string, number>, i: any) => {
      const vid = i.venueId || i.venue_id || i.venue;
      if (vid) acc[vid] = (acc[vid] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [inspections]);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [editingInspectionIndex, setEditingInspectionIndex] = useState<number | null>(null);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null);
  // When true, user has initiated "Create New Inspection" but we haven't created it on the server yet
  const [isCreatingNewInspection, setIsCreatingNewInspection] = useState<boolean>(false);

  const handleVenueSelect = (venue: Venue) => {
    setSelectedVenue(venue);
    
    // If we have a current inspection (ongoing), update it with venue info
    if (currentInspectionId) {
      setInspections(inspections.map(insp => 
        insp.id === currentInspectionId 
          ? { ...insp, venueId: venue.id, venueName: venue.name, status: 'in-progress' as const }
          : insp
      ));

      // Persist venue selection to the inspections service for the current draft (include updated metadata)
      (async () => {
        try {
          const resp = await fetch(API.inspections, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save_inspection',
              inspection: {
                inspection_id: currentInspectionId,
                venueId: venue.id,
                venueName: venue.name,
                venue_name: venue.name,
                updatedBy: user?.name || 'Unknown'
              }
            }),
          });
          if (resp && resp.ok) {
            try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inspectionSaved', { detail: { inspectionId: currentInspectionId } })); } catch (e) { /* ignore */ }
          }
        } catch (e) {
          console.warn('Failed to persist venue selection for inspection:', e);
        }
      })();

      setCurrentView('confirmInspection');
    } else {
      // Old behavior for venue management
      setCurrentView('rooms');
    }
  };

  const handleRoomSelect = (room: Room) => {
    setSelectedRoom(room);
    
    // If we have a current inspection, update it with room info
    if (currentInspectionId) {
      setInspections(inspections.map(insp => 
        insp.id === currentInspectionId 
          ? { ...insp, roomId: room.id, roomName: room.name }
          : insp
      ));

      // Persist room selection to the inspections service so the draft is fully associated (include updated metadata)
      (async () => {
        try {
          const resp = await fetch(API.inspections, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save_inspection',
              inspection: {
                inspection_id: currentInspectionId,
                roomId: room.id,
                roomName: room.name,
                updatedBy: user?.name || 'Unknown'
              }
            }),
          });
          if (resp && resp.ok) {
            try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inspectionSaved', { detail: { inspectionId: currentInspectionId } })); } catch (e) { /* ignore */ }
          }
        } catch (e) {
          console.warn('Failed to persist room selection for inspection:', e);
        }
      })();

      // Ensure we set read-only based on the inspection's latest known status (prevent losing read-only when navigating between views)
      try {
        const insp = inspections.find(i => i.id === currentInspectionId);
        setInspectionReadOnly(Boolean(insp && String(insp.status || '').toLowerCase() === 'completed'));
      } catch (e) {
        // If anything goes wrong, default to not read-only
        setInspectionReadOnly(false);
      }
    }
    
    setCurrentView('inspection');
  };

  const handleReInspection = (inspection: Inspection) => {
    const venue = venues.find((v) => v.id === inspection.venueId);
    const room = venue?.rooms.find((r) => r.id === inspection.roomId);
    
    if (venue && room) {
      setSelectedVenue(venue);
      setSelectedRoom(room);
      
      // Create a new inspection with only failed items
      const failedItemsInspection: Inspection = {
        ...inspection,
        items: inspection.items.filter(item => item.status === 'fail').map(item => ({
          ...item,
          status: null,
          notes: `Re-inspection: ${item.notes}`,
        })),
      };
      
      setEditingInspection(failedItemsInspection);
      setEditingInspectionIndex(null);
      setCurrentView('inspection');
    }
  };

  const handleInspectionSubmit = (inspection: Inspection) => {
    // Avoid client-side completion decision. Let the server be authoritative about completion.
    const updatedInspection = { ...inspection, status: (inspection.status || 'in-progress') as any };

    if (currentInspectionId) {
      // Update existing inspection
      setInspections(inspections.map(insp => 
        insp.id === currentInspectionId ? updatedInspection : insp
      ));
    } else {
      // Add new inspection (legacy path)
      setInspections([...inspections, updatedInspection]);
    }

    setCurrentInspectionId(null);
    setSelectedVenue(null);
    setSelectedRoom(null);
    setCurrentView('home');
  };

  const handleCreateNewInspection = () => {
    // Start a create flow but DO NOT create a draft on the server yet.
    // The actual inspection will be created when the user presses Create in the VenueSelection.
    setIsCreatingNewInspection(true);
    setSelectedVenue(null);
    setSelectedRoom(null);
    setCurrentView('selectVenue');
  };

  // Called by VenueSelection when a new inspection was created on the server
  const handleInspectionCreated = (inspectionData: any, originVenue?: Venue | null) => {
    console.debug('handleInspectionCreated called with inspectionData=', inspectionData, 'originVenue=', originVenue);
    const id = inspectionData.inspection_id || inspectionData.id;
    const simpleInspection: Inspection = {
      id,
      venueId: inspectionData.venueId || inspectionData.venue_id || '',
      venueName: inspectionData.venueName || inspectionData.venue_name || '',
      roomId: inspectionData.roomId || inspectionData.room_id || '',
      roomName: inspectionData.roomName || inspectionData.room_name || '',
      createdAt: inspectionData.createdAt || inspectionData.timestamp || '',
      inspectorName: inspectionData.createdBy || inspectionData.inspectorName || user?.name || 'Unknown',
      items: [],
      status: (inspectionData.status as any) || 'in-progress',
    };

    // If the server response lacks venue info but we have an originVenue, prefer the originVenue (optimistic)
    if (originVenue) {
      console.debug('handleInspectionCreated: applying originVenue optimistically', originVenue.id);
      simpleInspection.venueId = simpleInspection.venueId || originVenue.id;
      simpleInspection.venueName = simpleInspection.venueName || originVenue.name;
    }

    setInspections(prev => [...prev, simpleInspection]);
    setCurrentInspectionId(id);
    setIsCreatingNewInspection(false);

    // Set the venue context so UI can show confirmation. Prefer local venue; otherwise use originVenue (optimistic) or mark pendingVenueId
    const vid = simpleInspection.venueId;
    if (originVenue && !vid) {
      // If we have originVenue but no vid (edge case), apply originVenue
      console.debug('handleInspectionCreated: using originVenue for missing vid', originVenue.id);
      setSelectedVenue(originVenue);
      setPendingVenueId(null);
    } else if (vid) {
      const v = venues.find(x => x.id === vid);
      if (v) {
        console.debug('handleInspectionCreated: found local venue for vid=', vid);
        setSelectedVenue(v);
      } else if (originVenue) {
        console.debug('handleInspectionCreated: using originVenue for vid=', vid, 'originVenue=', originVenue?.id);
        // Use the originVenue provided by the creator (optimistic show) and clear pending
        setSelectedVenue(originVenue);
        console.debug('handleInspectionCreated: clearing pendingVenueId');
        setPendingVenueId(null);
      } else {
        // Venue not found locally: set pendingVenueId so the confirmation screen can fetch it from the server
        console.debug('handleInspectionCreated: venue not found locally; setting pendingVenueId=', vid);
        setPendingVenueId(vid);
        setSelectedVenue(null);
      }
    } else {
      // No venue information available: clear selection and let confirmation handle it
      console.debug('handleInspectionCreated: no venue available on created inspection and no originVenue; clearing pendingVenueId');
      setSelectedVenue(null);
      setPendingVenueId(null);
    }
    setCurrentView('confirmInspection');
  };
  const fetchInspectionItems = async (inspectionId: string, roomId?: string) => {
    try {
      const items = await getInspectionItems(inspectionId);
      if (!items) return [];
      if (roomId) {
        return (items as any[]).filter((it) => String(it.roomId || it.room_id || it.room || '') === String(roomId));
      }
      return items;
    } catch (e) {
      console.warn('Failed to fetch inspection items:', e);
      return [];
    }
  };

  const handleResumeInspection = (inspectionOrId: string | any) => {
    // If a string ID was passed, handle legacy flow
    if (typeof inspectionOrId === 'string') {
      const inspection = inspections.find(i => i.id === inspectionOrId);
      if (!inspection) return;
      setCurrentInspectionId(inspectionOrId);
      if (inspection.venueId) {
        const venue = venues.find(v => v.id === inspection.venueId);
        if (venue) {
          setSelectedVenue(venue);
          if (inspection.roomId) {
            const room = venue.rooms.find(r => r.id === inspection.roomId);
            if (room) {
              setSelectedRoom(room);
              // fetch existing saved items for this inspection and room
              fetchInspectionItems(inspectionOrId, room.id).then((items) => {
                if (items && items.length > 0) {
                  const mapped = items.map((it: any) => {
                    const id = it.itemId || it.item || it.ItemId || generateItemId();
                    const name = it.itemName || it.item || it.ItemName || '';
                    return { id, name, status: it.status, notes: it.comments || '' };
                  });
                  setEditingInspection({ ...inspection, items: mapped });

                  // Upsert into local inspections state so UI (RoomList) can reflect progress
                  setInspections(prev => {
                    const existing = prev.find(p => p.id === inspectionOrId);
                    if (existing) {
                      return prev.map(p => p.id === inspectionOrId ? { ...p, items: mapped } : p);
                    }
                    return [...prev, { ...inspection, items: mapped }];
                  });
                }
              }).catch(() => {});
              setCurrentView('inspection');
              return;
            }
          }
          setCurrentView('rooms');
          return;
        }
      }
      setCurrentView('selectVenue');
      return;
    }

    // Otherwise, object was passed from InspectorHome (dynamo)
    const incoming = inspectionOrId;
    const id = incoming.id || incoming.inspection_id;
    if (!id) {
      console.error('handleResumeInspection: incoming inspection object missing id', incoming);
      // Fail early to avoid masking source-of-truth issues; caller should provide a proper id
      return;
    }

    // Upsert into local inspections state so other parts of the app can reference it
    const existing = inspections.find(i => i.id === id);
    const simpleInspection = {
      id,
      venueId: incoming.venueId || incoming.venue_id || incoming.venue || '',
      venueName: incoming.venueName || incoming.venue_name || '',
      roomId: incoming.roomId || incoming.room_id || '',
      roomName: incoming.roomName || incoming.room_name || '',
      timestamp: incoming.timestamp || incoming.created_at || '',
      inspectorName: incoming.inspectorName || incoming.created_by || 'Unknown',
      items: incoming.items || [],
      status: incoming.status || 'in-progress',
    } as Inspection;

    if (!existing) {
      setInspections(prev => [...prev, simpleInspection]);
    }

    setCurrentInspectionId(id);

    // set read-only flag when inspection is completed
    setInspectionReadOnly((simpleInspection.status || '').toString().toLowerCase() === 'completed');

    // Find the venue
    const venue = venues.find(v => v.id === simpleInspection.venueId);
    if (venue) {
      setSelectedVenue(venue);
      if (simpleInspection.roomId) {
        const room = venue.rooms.find(r => r.id === simpleInspection.roomId);
        if (room) {
          setSelectedRoom(room);
          // fetch saved items for this inspection & room, then set editingInspection
          fetchInspectionItems(id, room.id).then((items) => {
            if (items && items.length > 0) {
              const mapped = items.map((it: any) => {
                const id = it.itemId || it.item || it.ItemId || generateItemId();
                const name = it.itemName || it.item || it.ItemName || '';
                return { id, name, status: it.status, notes: it.comments || '' };
              });
              setEditingInspection({ ...simpleInspection, items: mapped });
            }
          }).catch(() => {});
          setCurrentView('inspection');
          return;
        }
      }
      setCurrentView('rooms');
      return;
    }

    // If venue not found locally, navigate to rooms and allow RoomList to fetch the venue when it mounts
    setPendingVenueId(simpleInspection.venueId || null);
    setCurrentView(simpleInspection.venueId ? 'rooms' : 'selectVenue');
  };

  const handleBackFromVenueSelect = () => {
    setIsCreatingNewInspection(false);
    setCurrentView('home');
  };

  const handleBackFromRooms = () => {
    if (currentInspectionId) {
      // If we're in an inspection flow, go back to home
      setCurrentInspectionId(null);
      setSelectedVenue(null);
      setSelectedRoom(null);
      setCurrentView('home');
    } else {
      // Old behavior
      setSelectedVenue(null);
      setCurrentView('venues');
    }
  };

  const handleBackFromInspection = () => {
    // When leaving inspection, preserve read-only if the inspection is completed according to the latest known inspection state
    if (currentInspectionId) {
      const insp = inspections.find(i => i.id === currentInspectionId);
      setInspectionReadOnly(Boolean(insp && String(insp.status || '').toLowerCase() === 'completed'));
    } else {
      setInspectionReadOnly(false);
    }

    if (selectedVenue) {
      // Normal flow: go back to the room list within the selected venue
      setSelectedRoom(null);
      setCurrentView('rooms');
    } else {
      // No venue selected (e.g., a newly-created inspection without venue context) — navigate to Home
      // Clear inspection context to avoid leaving stale state
      setCurrentInspectionId(null);
      setSelectedRoom(null);
      setCurrentView('home');
    }
  };

  const { show, confirm } = useToast();

  const handleViewHistory = () => {
    setCurrentView('history');
  };

  const handleBackToHome = () => {
    setCurrentInspectionId(null);
    setSelectedVenue(null);
    setSelectedRoom(null);
    setCurrentView('home');
  };

  const handleAddVenue = () => {
    setSelectedVenue(null);
    setCurrentView('addVenue');
  };

  const handleEditVenue = (venue: Venue) => {
    setSelectedVenue(venue);
    setCurrentView('editVenue');
  };

  const handleDeleteVenue = async (venueId: string) => {
    // Determine inspections to delete and attempt a cascading delete of images first
    const originalVenues = venues;
    const originalInspections = inspections;

    const toDeleteInspections = inspections.filter((i) => i.venueId === venueId).map(i => i.id);
    try {
      if (toDeleteInspections.length > 0) {
        show('Deleting associated inspection images…', { variant: 'info' });
        const { deleteInspection } = await import('./utils/inspectionApi');
        const promises = toDeleteInspections.map((iid) => deleteInspection(iid, { cascade: true }));
        const settled = await Promise.allSettled(promises);
        let totalImagesDeleted = 0;
        const failures: any[] = [];
        settled.forEach((s: any) => {
          if (s.status === 'fulfilled' && s.value && s.value.ok) totalImagesDeleted += (s.value.summary?.deletedImages || 0);
          else failures.push(s.reason || s.value);
        });
        if (failures.length > 0) {
          console.warn('Some cascading deletes failed:', failures);
          show('Some images failed to delete. Venue delete will proceed; check console for details.', { variant: 'info' });
        } else {
          show(`Deleted ${totalImagesDeleted} images for this venue`, { variant: 'success' });
        }
      }
    } catch (e) {
      console.warn('Cascading delete images failed', e);
      show('Failed to delete some images for this venue; continuing with venue delete', { variant: 'info' });
    }

    // Optimistic UI update for venue and inspections
    setVenues(venues.filter((v) => v.id !== venueId));
    setInspections(inspections.filter((i) => i.venueId !== venueId));

    try {
      const res = await fetch(API.venuesCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_venue', venueId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to delete venue:', res.status, text);
        // revert UI
        setVenues(originalVenues);
        setInspections(originalInspections);
        alert('Failed to delete venue. See console for details.');
        return;
      }

      const data = await res.json();
      // backend may return { message: 'Deleted' } or proxy { body }
      const body = data?.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
      console.log('delete_venue response', data, body);

      // If the backend returned a summary of deletes, display toast messages similar to inspection deletion
      const summary = data?.summary || body?.summary || null;
      if (summary) {
        const inspectionsDeleted = summary.deleted_metadata || summary.inspections_found || summary.deleted_items || 0;
        const imagesDeleted = summary.deleted_s3_objects || summary.deleted_image_rows || 0;
        if (inspectionsDeleted > 0) {
          show(`Deleted ${inspectionsDeleted} inspections for this venue`, { variant: 'success' });
        }
        if (imagesDeleted > 0) {
          show(`Deleted ${imagesDeleted} images for this venue`, { variant: 'success' });
        }
      }

      // Server-side state already reflected via local update; VenueList will refresh when opened if needed.
      return true;
    } catch (err) {
      console.error('Error deleting venue:', err);
      setVenues(originalVenues);
      alert('Error deleting venue. See console.');
      return false;
    }
  };

  const handleSaveVenue = (venue: Venue, isEdit?: boolean) => {
    if (!isEdit) {
      // Creation flow: append venue and navigate back to venues list
      const newVenue = {
        ...venue,
        createdBy: user?.name || 'Unknown',
      };
      setVenues([...venues, newVenue]);

      // After creating, navigate back to the venues list
      setCurrentView('venues');
    } else {
      // Edit flow: update in-place and remain on edit screen
      const updatedVenue = {
        ...venue,
      };
      setVenues(venues.map((v) => (v.id === venue.id ? updatedVenue : v)));
      setInspections(
        inspections.map((i) =>
          i.venueId === venue.id ? { ...i, venueName: venue.name } : i
        )
      );

      // If this venue is currently selected in the app state, keep it updated so the edit screen reflects latest data
      try {
        if (selectedVenue && String(selectedVenue.id) === String(venue.id)) {
          setSelectedVenue(updatedVenue);
        }
      } catch (e) { /* ignore */ }
    }

    // VenueList will refresh from backend when the Manage Venues screen is opened if necessary.
  };

  const handleEditInspection = (inspection: Inspection, index: number) => {
    const venue = venues.find((v) => v.id === inspection.venueId);
    const room = venue?.rooms.find((r) => r.id === inspection.roomId);
    
    if (venue && room) {
      setSelectedVenue(venue);
      setSelectedRoom(room);
      setEditingInspection(inspection);
      setEditingInspectionIndex(index);
      setCurrentView('inspection');
    }
  };

  const handleDeleteInspection = (index: number) => {
    setInspections(inspections.filter((_, i) => i !== index));
  };

  // Delete by inspection id (used by InspectorHome which passes an id)
  const handleDeleteInspectionById = (inspectionId: string) => {
    setInspections(inspections.filter(i => i.id !== inspectionId));
  };

  const handleBack = () => {
    if (currentView === 'rooms') {
      setCurrentView('venues');
      setSelectedVenue(null);
    } else if (currentView === 'inspection') {
      setCurrentView('rooms');
      setSelectedRoom(null);
      setEditingInspection(null);
      setEditingInspectionIndex(null);
    } else {
      setCurrentView('venues');
      setSelectedVenue(null);
    }
  };

  const handleViewProfile = () => {
    setCurrentView('profile');
  };

  const handleViewDashboard = () => {
    setCurrentView('dashboard');
  };

  const handleConfirmInspection = async () => {
    if (!selectedVenue && pendingVenueId) {
      try {
        const v = await getVenueById(String(pendingVenueId));
        if (v) {
          const mapped = { id: v.venueId || v.id, name: v.name || '', address: v.address || '', rooms: (v.rooms || []).map((r: any) => ({ id: r.roomId || r.id, name: r.name || '', items: r.items || [] })), createdAt: v.createdAt || '', updatedAt: v.updatedAt || v.createdAt || '', createdBy: v.createdBy || '' } as Venue;
          setSelectedVenue(mapped);
        }
      } catch (e) {
        console.warn('Failed to load venue before confirming inspection', e);
      } finally {
        setPendingVenueId(null);
      }
    }
    setCurrentView('rooms');
  };

  const handleReturnHomeFromConfirm = () => {
    // Keep the inspection as ongoing (already saved with venue info)
    setCurrentInspectionId(null);
    setSelectedVenue(null);
    setCurrentView('home');
  };

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {currentView === 'home' && (
        <InspectorHome
          inspections={inspections}
          venues={venues}
          onCreateNewInspection={handleCreateNewInspection}
          onResumeInspection={handleResumeInspection}
          onViewHistory={handleViewHistory}
          onViewProfile={handleViewProfile}
          onManageVenues={() => setCurrentView('venues')}
          onViewDashboard={handleViewDashboard}
          onDeleteInspection={handleDeleteInspectionById}
        />
      )}

      {currentView === 'selectVenue' && (
        <VenueSelection
          venues={venues}
          onVenueSelect={handleVenueSelect}
          onBack={handleBackFromVenueSelect}
          currentInspectionId={currentInspectionId}
          isCreatingNewInspection={isCreatingNewInspection}
          onInspectionCreated={handleInspectionCreated}
        />
      )}

      {currentView === 'dashboard' && (
        <Dashboard onBack={() => setCurrentView('home')} />
      )}

      {currentView === 'confirmInspection' && (
        <InspectionConfirmation
          venue={selectedVenue ?? undefined}
          pendingVenueId={pendingVenueId ?? undefined}
          onConfirm={handleConfirmInspection}
          onReturnHome={handleReturnHomeFromConfirm}
        />
      )}

      {currentView === 'venues' && (
        <VenueList
          venues={venues}
          onVenueSelect={handleVenueSelect}
          onViewVenue={(v) => { setSelectedVenue(v); setCurrentView('venueLayout'); }}
          onViewProfile={handleViewProfile}
          onAddVenue={handleAddVenue}
          onEditVenue={handleEditVenue}
          onDeleteVenue={handleDeleteVenue}
          onBack={() => setCurrentView('home')}
          onVenuesLoaded={(v) => setVenues(v)}
        />
      )}

      {currentView === 'rooms' && (
        <RoomList
          venue={selectedVenue || undefined}
          venueId={selectedVenue ? undefined : pendingVenueId || undefined}
          onRoomSelect={handleRoomSelect}
          onBack={handleBackFromRooms}
          inspections={inspections}
          inspectionId={currentInspectionId}
          onVenueLoaded={(v) => { setSelectedVenue(v); setPendingVenueId(null); }}
        />
      )}

      {currentView === 'inspection' && selectedVenue && selectedRoom && (
        <InspectionForm
          venue={selectedVenue}
          room={selectedRoom}
          inspectionId={currentInspectionId || undefined}
          onSubmit={handleInspectionSubmit}
          onBack={handleBackFromInspection}
          existingInspection={editingInspection}
          readOnly={inspectionReadOnly}
        />
      )}

      {currentView === 'venueLayout' && selectedVenue && (
        <VenueLayout venue={selectedVenue} onBack={() => setCurrentView('venues')} />
      )}



      {(currentView === 'addVenue' || currentView === 'editVenue') && (
        <VenueForm
          venue={selectedVenue}
          onSave={handleSaveVenue}
          onBack={handleBack}
          isEdit={currentView === 'editVenue'}
        />
      )}

      {currentView === 'profile' && (
        <UserProfile onBack={handleBackToHome} />
      )}



      {currentView === 'history' && (
        <InspectionHistory
          inspections={inspections}
          onBack={handleBackToHome}
          onDeleteInspection={handleDeleteInspectionById}
          onResumeInspection={handleResumeInspection}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="min-h-screen bg-gray-50">
          <AppContent />
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}