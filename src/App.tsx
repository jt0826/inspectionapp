import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { Login } from './components/Login';
import { VenueList } from './components/VenueList';
import { RoomList } from './components/RoomList';
import { InspectionForm } from './components/InspectionForm';
import { InspectionSummary } from './components/InspectionSummary';
import { InspectionHistory } from './components/InspectionHistory';
import { VenueForm } from './components/VenueForm';
import { UserProfile } from './components/UserProfile';
import { InspectorHome } from './components/InspectorHome';
import { getInspectionItems } from './utils/inspectionApi';
import { VenueSelection } from './components/VenueSelection';
import { InspectionConfirmation } from './components/InspectionConfirmation';
import { VenueLayout } from './components/VenueLayout';

export interface Venue {
  id: string;
  name: string;
  address: string;
  rooms: Room[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Room {
  id: string;
  name: string;
  items?: { id: string; name: string }[];
}

export interface InspectionItem {
  id: string;
  item: string;
  status: 'pass' | 'fail' | 'na' | 'pending' | null;
  notes: string;
  photos: string[];
}

export interface Inspection {
  id: string;
  venueId: string;
  venueName: string;
  roomId: string;
  roomName: string;
  timestamp: string;
  inspectorName: string;
  items: InspectionItem[];
  status: 'draft' | 'in-progress' | 'completed';
}

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
  | 'venueLayout';

function AppContent() {
  const { isAuthenticated, user } = useAuth();
  const [currentView, setCurrentView] = useState<View>('home');
  // Replace hard-coded venues with data from backend
  const [venues, setVenues] = useState<Venue[]>([]);
  // Use consolidated venueslh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-query
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-query'; // replace with your API base URL (venues)



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
    createdAt: v.createdAt || new Date().toISOString(),
    updatedAt: v.updatedAt || v.createdAt || new Date().toISOString(),
    createdBy: v.createdBy || ''
  });

  // Fetch venues from backend
  const fetchVenues = async () => {
    try {
      // Single endpoint: POST with action 'get_venues'
      const res = await fetch(`${API_BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_venues' }),
      });
      const data = await res.json();

      // Supports API Gateway proxy response shape
      let items: any[] = [];
      if (Array.isArray(data)) items = data;
      else if (Array.isArray(data.venues)) items = data.venues;
      else if (data.body) {
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          items = parsed.venues || parsed.Items || parsed || [];
        } catch (err) {
          console.warn('Failed to parse venues.body', err);
        }
      }

      setVenues(items.map(mapDbVenueToVenue));
    } catch (err) {
      console.error('Failed to fetch venues:', err);
      // fallback: keep existing venues if any
    }
  };

  // Load venues on mount
  React.useEffect(() => { fetchVenues(); }, []);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [dbInspections, setDbInspections] = useState<any[]>([]);

  const fetchDbInspections = async () => {
    try {
      const res = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_inspections' }),
      });
      const data = await res.json();
      let items: any[] = [];
      if (Array.isArray(data.inspections)) items = data.inspections;
      else if (data.body) {
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          items = parsed.inspections || parsed.Items || [];
        } catch (err) {
          console.warn('Failed to parse list_inspections.body', err);
        }
      } else if (Array.isArray(data)) items = data;
      setDbInspections(items);
    } catch (err) {
      console.warn('Failed to fetch inspections (db):', err);
      setDbInspections([]);
    }
  };

  React.useEffect(() => { fetchDbInspections(); const onFocus = () => fetchDbInspections(); window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, []);

  const inspectionsCountMap = React.useMemo(() => {
    return dbInspections.reduce((acc: Record<string, number>, i: any) => {
      const vid = i.venueId || i.venue_id || i.venue;
      if (vid) acc[vid] = (acc[vid] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [dbInspections]);
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
          const resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save_inspection',
              inspection: {
                inspection_id: currentInspectionId,
                venueId: venue.id,
                venueName: venue.name,
                venue_name: venue.name,
                updatedAt: new Date().toISOString(),
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
          const resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save_inspection',
              inspection: {
                inspection_id: currentInspectionId,
                roomId: room.id,
                roomName: room.name,
                updatedAt: new Date().toISOString(),
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
    const completedInspection = { ...inspection, status: 'completed' as const };
    
    if (currentInspectionId) {
      // Update existing inspection
      setInspections(inspections.map(insp => 
        insp.id === currentInspectionId ? completedInspection : insp
      ));
    } else {
      // Add new inspection (legacy path)
      setInspections([...inspections, completedInspection]);
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
  const handleInspectionCreated = (inspectionData: any) => {
    const id = inspectionData.inspection_id || inspectionData.id;
    const simpleInspection: Inspection = {
      id,
      venueId: inspectionData.venueId || inspectionData.venue_id || '',
      venueName: inspectionData.venueName || inspectionData.venue_name || '',
      roomId: inspectionData.roomId || inspectionData.room_id || '',
      roomName: inspectionData.roomName || inspectionData.room_name || '',
      timestamp: inspectionData.createdAt || inspectionData.timestamp || new Date().toISOString(),
      inspectorName: inspectionData.createdBy || inspectionData.inspectorName || user?.name || 'Unknown',
      items: [],
      status: (inspectionData.status as any) || 'in-progress',
    };

    setInspections(prev => [...prev, simpleInspection]);
    setCurrentInspectionId(id);
    setIsCreatingNewInspection(false);

    // Set the selected venue so UI reflects the created inspection's venue
    const vid = simpleInspection.venueId;
    if (vid) {
      const v = venues.find(x => x.id === vid);
      if (v) {
        setSelectedVenue(v);
        setCurrentView('confirmInspection');
        return;
      }
      // If venue not found locally, refresh venues then set
      fetchVenues().then(() => {
        const vv = venues.find(x => x.id === vid);
        if (vv) setSelectedVenue(vv);
        setCurrentView('confirmInspection');
      }).catch(() => setCurrentView('confirmInspection'));
    } else {
      setCurrentView('confirmInspection');
    }
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
                    const id = it.itemId || it.item || it.ItemId || ('item_' + Math.random().toString(36).substr(2,9));
                    const name = it.itemName || it.item || it.ItemName || '';
                    return { id, item: name, status: it.status, notes: it.comments || '' };
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
    const id = incoming.id || incoming.inspection_id || 'insp_' + Date.now();

    // Upsert into local inspections state so other parts of the app can reference it
    const existing = inspections.find(i => i.id === id);
    const simpleInspection = {
      id,
      venueId: incoming.venueId || incoming.venue_id || incoming.venue || '',
      venueName: incoming.venueName || incoming.venue_name || '',
      roomId: incoming.roomId || incoming.room_id || '',
      roomName: incoming.roomName || incoming.room_name || '',
      timestamp: incoming.timestamp || incoming.created_at || new Date().toISOString(),
      inspectorName: incoming.inspectorName || incoming.created_by || 'Unknown',
      items: incoming.items || [],
      status: incoming.status || 'in-progress',
    } as Inspection;

    if (!existing) {
      setInspections(prev => [...prev, simpleInspection]);
    }

    setCurrentInspectionId(id);

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
                const id = it.itemId || it.item || it.ItemId || ('item_' + Math.random().toString(36).substr(2,9));
                const name = it.itemName || it.item || it.ItemName || '';
                return { id, item: name, status: it.status, notes: it.comments || '' };
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

    // If venue not found, try to refresh venues and then set view
    fetchVenues().then(() => {
      const v = venues.find(vv => vv.id === simpleInspection.venueId);
      if (v) {
        setSelectedVenue(v);
        if (simpleInspection.roomId) {
          const room = v.rooms.find(r => r.id === simpleInspection.roomId);
          if (room) {
            setSelectedRoom(room);
            setCurrentView('inspection');
            return;
          }
        }
        setCurrentView('rooms');
        return;
      }
      setCurrentView('selectVenue');
    }).catch(() => setCurrentView('selectVenue'));
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
    if (selectedVenue) {
      setSelectedRoom(null);
      setCurrentView('rooms');
    }
  };

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
    // Optimistic UI update
    const originalVenues = venues;
    setVenues(venues.filter((v) => v.id !== venueId));
    setInspections(inspections.filter((i) => i.venueId !== venueId));

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_venue', venueId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to delete venue:', res.status, text);
        // revert UI
        setVenues(originalVenues);
        alert('Failed to delete venue. See console for details.');
        return;
      }

      const data = await res.json();
      // backend may return { message: 'Deleted' } or proxy { body }
      console.log('delete_venue response', data);

      // Ensure server-side state is reflected
      await fetchVenues();
    } catch (err) {
      console.error('Error deleting venue:', err);
      setVenues(originalVenues);
      alert('Error deleting venue. See console.');
    }
  };

  const handleSaveVenue = (venue: Venue) => {
    if (currentView === 'addVenue') {
      const newVenue = {
        ...venue,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user?.name || 'Unknown',
      };
      setVenues([...venues, newVenue]);
    } else {
      const updatedVenue = {
        ...venue,
        updatedAt: new Date().toISOString(),
      };
      setVenues(venues.map((v) => (v.id === venue.id ? updatedVenue : v)));
      setInspections(
        inspections.map((i) =>
          i.venueId === venue.id ? { ...i, venueName: venue.name } : i
        )
      );
    }

    // Refresh venues from backend after save to pick up server-side state
    fetchVenues().catch(err => console.warn('Failed to refresh venues after save', err));

    setCurrentView('venues');
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

  const handleConfirmInspection = () => {
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

      {currentView === 'confirmInspection' && selectedVenue && (
        <InspectionConfirmation
          venue={selectedVenue}
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
          inspectionsCount={inspectionsCountMap}
        />
      )}

      {currentView === 'rooms' && selectedVenue && (
        <RoomList
          venue={selectedVenue}
          onRoomSelect={handleRoomSelect}
          onBack={handleBackFromRooms}
          inspections={inspections}
          inspectionId={currentInspectionId}
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