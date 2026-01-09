/**
 * useAppHandlers.ts
 * =================
 * 
 * Central hook that consolidates all application-level handler logic extracted from App.tsx.
 * This separation follows the "container/presenter" pattern where:
 * - useAppHandlers: Contains business logic, state management, and side effects
 * - App.tsx: Pure rendering logic that maps state to UI components
 * 
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        useAppHandlers                           │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
 * │  │  useNavigation  │  │  useInspections │  │   useVenues    │  │
 * │  │  • currentView  │  │  • inspections  │  │  • venues      │  │
 * │  │  • navigate()   │  │  • CRUD ops     │  │  • CRUD ops    │  │
 * │  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
 * │           │                    │                   │           │
 * │           └────────────────────┼───────────────────┘           │
 * │                                ▼                               │
 * │                    ┌────────────────────┐                      │
 * │                    │  Handler Functions │                      │
 * │                    │  • Venue handlers  │                      │
 * │                    │  • Room handlers   │                      │
 * │                    │  • Inspection hdlr │                      │
 * │                    │  • Navigation hdlr │                      │
 * │                    └────────────────────┘                      │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * @module hooks/useAppHandlers
 * @see {@link App.tsx} - Consumer of this hook
 * @see {@link useNavigation} - Navigation state machine
 * @see {@link useInspections} - Inspection state management
 * @see {@link useVenues} - Venue state management
 */

import { useCallback } from 'react';
import { useNavigation } from './useNavigation';
import { useInspections } from './useInspections';
import { useVenues } from './useVenues';
import { useToast } from '../components/ToastProvider';
import { getInspectionItemsForRoom } from '../utils/inspectionApi';
import { generateItemId } from '../utils/id';
import type { Venue, Room } from '../types/venue';
import type { Inspection } from '../types/inspection';

/**
 * Configuration options for the useAppHandlers hook.
 * 
 * These options allow AppContent to pass in local state that hasn't been
 * migrated to context yet. This enables incremental refactoring without
 * a "big bang" rewrite.
 * 
 * @interface UseAppHandlersOptions
 */
interface UseAppHandlersOptions {
  /**
   * Display name of the currently authenticated user.
   * Used for `createdBy` fields when creating inspections/venues.
   * @example "John Anderson"
   */
  displayName: string;

  /**
   * Whether the current inspection is in read-only mode.
   * Set to `true` when viewing completed inspections.
   */
  inspectionReadOnly: boolean;

  /**
   * Setter for inspectionReadOnly state.
   * Called when navigation determines if inspection should be editable.
   */
  setInspectionReadOnly: (v: boolean) => void;

  /**
   * The inspection currently being edited, with items loaded.
   * `null` when creating a new inspection or not in editing mode.
   */
  editingInspection: Inspection | null;

  /**
   * Setter for editingInspection state.
   * Called when resuming or editing an existing inspection.
   */
  setEditingInspection: (v: Inspection | null) => void;

  /**
   * Index of the inspection being edited in the inspections array.
   * Used for legacy update paths. `null` for new inspections.
   */
  editingInspectionIndex: number | null;

  /**
   * Setter for editingInspectionIndex state.
   */
  setEditingInspectionIndex: (v: number | null) => void;
}

/**
 * useAppHandlers - Primary application logic hook
 * 
 * Consolidates all handler functions previously scattered in App.tsx into
 * a single, well-organized hook. Each handler is wrapped in `useCallback`
 * to maintain stable references and prevent unnecessary re-renders.
 * 
 * ## Handler Categories
 * 
 * ### Venue Handlers
 * - `handleVenueSelect`: Select a venue and navigate appropriately
 * - `handleAddVenue`: Navigate to venue creation form
 * - `handleEditVenue`: Navigate to venue edit form
 * - `handleDeleteVenue`: Delete venue with optimistic UI update
 * - `handleSaveVenue`: Persist venue changes to backend
 * 
 * ### Room Handlers
 * - `handleRoomSelect`: Select a room within venue, update inspection context
 * 
 * ### Inspection Handlers
 * - `handleCreateNewInspection`: Start new inspection flow
 * - `handleInspectionCreated`: Callback after server creates inspection
 * - `handleInspectionSubmit`: Submit inspection to local state (pre-save)
 * - `handleResumeInspection`: Resume an in-progress or view completed inspection
 * - `handleReInspection`: Create new inspection from failed items only
 * - `handleEditInspection`: Edit existing inspection
 * - `handleDeleteInspection`: Delete by array index (legacy)
 * - `handleDeleteInspectionById`: Delete by inspection ID
 * 
 * ### Navigation Handlers
 * - `handleBackFrom*`: Context-aware back navigation
 * - `handleViewHistory`, `handleViewProfile`, `handleViewDashboard`: Direct navigation
 * - `handleConfirmInspection`, `handleReturnHomeFromConfirm`: Confirmation flow
 * 
 * @param options - Configuration options with external state setters
 * @returns Object containing all handlers and derived state
 * 
 * @example
 * ```tsx
 * const {
 *   currentView,
 *   handleCreateNewInspection,
 *   handleVenueSelect,
 *   // ... other handlers
 * } = useAppHandlers({
 *   displayName: user.name,
 *   inspectionReadOnly,
 *   setInspectionReadOnly,
 *   // ... other options
 * });
 * ```
 */
export function useAppHandlers(options: UseAppHandlersOptions) {
  const {
    displayName,
    inspectionReadOnly,
    setInspectionReadOnly,
    editingInspection,
    setEditingInspection,
    editingInspectionIndex,
    setEditingInspectionIndex,
  } = options;

  // ─────────────────────────────────────────────────────────────────────────────
  // Compose underlying hooks
  // ─────────────────────────────────────────────────────────────────────────────
  const { currentView, navigate, goBack, goHome } = useNavigation();
  const {
    venues,
    selectedVenue,
    selectedRoom,
    pendingVenueId,
    fetchVenues,
    selectVenue,
    selectRoom,
    deleteVenue,
    saveVenue,
    setVenues,
    setPendingVenueId,
  } = useVenues();
  const {
    inspections,
    currentInspectionId,
    isCreating,
    createInspection,
    updateInspection,
    setVenueForCurrentInspection,
    setRoomForCurrentInspection,
    deleteInspection,
    selectInspection,
    setInspections,
  } = useInspections();
  const { show, confirm } = useToast();

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetches inspection items for a specific inspection and optionally filters by room.
   * 
   * Used when resuming an inspection to load previously saved item states
   * (pass/fail/na status, notes, photos).
   * 
   * @param inspectionId - The inspection to fetch items for
   * @param roomId - Optional room filter. If provided, only items for that room are returned.
   * @returns Promise resolving to array of inspection items, or empty array on error
   * 
   * @example
   * ```ts
   * const items = await fetchInspectionItems('insp_abc123', 'room_001');
   * // Returns: [{ itemId, status, comments, photos }, ...]
   * ```
   */
  const fetchInspectionItems = useCallback(async (inspectionId: string, roomId?: string) => {
    try {
      const items = await getInspectionItemsForRoom(inspectionId, roomId);
      return items || [];
    } catch (e) {
      console.warn('Failed to fetch inspection items:', e);
      return [];
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // VENUE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handles venue selection from VenueList or VenueSelection components.
   * 
   * Behavior depends on context:
   * - If an inspection is active (`currentInspectionId` exists): Updates the
   *   inspection's venue and navigates to confirmation screen
   * - Otherwise: Navigates to room list for venue management
   * 
   * @param venue - The selected venue object
   * @returns void
   * 
   * Flow:
   * ```
   * handleVenueSelect(venue)
   *   ├─ [Has inspection] → setVenueForCurrentInspection → navigate('confirmInspection')
   *   └─ [No inspection] → navigate('rooms')
   * ```
   */
  const handleVenueSelect = useCallback((venue: Venue) => {
    selectVenue(venue);

    if (currentInspectionId) {
      setVenueForCurrentInspection(venue);
      navigate('confirmInspection');
    } else {
      navigate('rooms');
    }
  }, [currentInspectionId, selectVenue, setVenueForCurrentInspection, navigate]);

  /**
   * Initiates the venue creation flow.
   * 
   * Clears any previously selected venue and navigates to the VenueForm
   * in "add" mode.
   * 
   * @returns void
   */
  const handleAddVenue = useCallback(() => {
    selectVenue(null);
    navigate('addVenue');
  }, [selectVenue, navigate]);

  /**
   * Initiates the venue editing flow.
   * 
   * Sets the venue to edit and navigates to VenueForm in "edit" mode.
   * 
   * @param venue - The venue to edit
   * @returns void
   */
  const handleEditVenue = useCallback((venue: Venue) => {
    selectVenue(venue);
    navigate('editVenue');
  }, [selectVenue, navigate]);

  /**
   * Deletes a venue with optimistic UI update and rollback on failure.
   * 
   * Flow:
   * 1. Save original inspections state (for rollback)
   * 2. Optimistically remove inspections linked to venue from local state
   * 3. Call backend to delete venue (cascades to related data)
   * 4. On success: Show success toast
   * 5. On failure: Rollback inspections state, show error
   * 
   * @param venueId - ID of the venue to delete
   * @returns Promise<boolean> - true if deletion succeeded, false otherwise
   * 
   * @example
   * ```ts
   * const success = await handleDeleteVenue('venue_abc123');
   * if (!success) {
   *   // Handle failure (state already rolled back)
   * }
   * ```
   */
  const handleDeleteVenue = useCallback(async (venueId: string) => {
    const originalInspections = inspections;
    try {
      // Optimistic update: remove dependent inspections immediately
      setInspections(inspections.filter((i) => i.venueId !== venueId));
      await deleteVenue(venueId);
      show('Venue deleted', { variant: 'success' });
      return true;
    } catch (err) {
      // Rollback on failure
      setInspections(originalInspections);
      console.error('Error deleting venue:', err);
      alert('Error deleting venue. See console.');
      return false;
    }
  }, [inspections, setInspections, deleteVenue, show]);

  /**
   * Saves a venue (create or update) and handles related side effects.
   * 
   * On edit: Also updates the `venueName` field on any inspections linked
   * to this venue to keep data consistent.
   * 
   * @param venue - The venue data to save
   * @param isEdit - Whether this is an edit (true) or create (false)
   * @returns Promise<void>
   * 
   * Side effects:
   * - Persists venue to backend via useVenues.saveVenue
   * - Updates inspection records if editing (venueName sync)
   * - Navigates to venues list on success
   */
  const handleSaveVenue = useCallback(async (venue: Venue, isEdit?: boolean) => {
    try {
      await saveVenue({ ...venue, createdBy: venue.createdBy || displayName }, isEdit);
      if (isEdit) {
        // Sync venue name to related inspections
        setInspections(
          inspections.map((i) =>
            i.venueId === venue.id ? { ...i, venueName: venue.name } : i
          )
        );
      }
      navigate('venues');
    } catch (e) {
      console.error('Failed to save venue', e);
      alert('Failed to save venue. See console for details.');
    }
  }, [saveVenue, displayName, inspections, setInspections, navigate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handles room selection within a venue.
   * 
   * Behavior depends on whether an inspection is active:
   * - With inspection: Updates the inspection's room reference, determines
   *   read-only state based on completion status, and navigates to form
   * - Without inspection: Simply navigates to inspection form (legacy path)
   * 
   * Also handles the edge case where the selected room matches the inspection's
   * current room (no-op except for read-only check).
   * 
   * @param room - The selected room object
   * @returns void
   * 
   * Read-only logic:
   * - If inspection.status === 'completed', form is read-only
   * - Otherwise, form is editable
   */
  const handleRoomSelect = useCallback((room: Room) => {
    selectRoom(room);

    if (currentInspectionId) {
      // Update inspection with new room
      setRoomForCurrentInspection(room);

      // Determine read-only state (check both status and completedAt for consistency)
      try {
        const insp = inspections.find((i) => i.id === currentInspectionId);
        if (insp) {
          const isCompleted = String(insp.status || '').toLowerCase() === 'completed';
          const hasCompletedAt = Boolean((insp as any).completedAt || (insp as any).completed_at);
          setInspectionReadOnly(isCompleted || hasCompletedAt);
        } else {
          setInspectionReadOnly(false);
        }
      } catch (e) {
        setInspectionReadOnly(false);
      }
    }

    navigate('inspection');
  }, [currentInspectionId, inspections, selectRoom, setRoomForCurrentInspection, setInspectionReadOnly, navigate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // INSPECTION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initiates the "Create New Inspection" flow.
   * 
   * Clears all selection state and navigates to venue selection.
   * The actual inspection record is NOT created until the user confirms
   * in VenueSelection (server-authoritative).
   * 
   * @returns void
   * 
   * Flow:
   * ```
   * handleCreateNewInspection()
   *   → Clear: inspection, venue, room
   *   → Navigate to 'selectVenue'
   *   → [User selects venue]
   *   → VenueSelection calls API to create inspection
   *   → handleInspectionCreated() callback
   * ```
   */
  const handleCreateNewInspection = useCallback(() => {
    selectInspection(null);
    selectVenue(null);
    selectRoom(null);
    navigate('selectVenue');
  }, [selectInspection, selectVenue, selectRoom, navigate]);

  /**
   * Callback invoked when VenueSelection successfully creates an inspection on the server.
   * 
   * Handles:
   * 1. Normalizing the server response into a local Inspection object
   * 2. Adding the inspection to local state
   * 3. Selecting the new inspection as current
   * 4. Resolving venue context (local lookup, optimistic from origin, or pending fetch)
   * 5. Navigating to confirmation screen
   * 
   * @param inspectionData - Raw inspection data from server (snake_case or camelCase)
   * @param originVenue - Optional venue object from the creator (optimistic display)
   * @returns void
   * 
   * Venue resolution priority:
   * 1. Local venue matching inspectionData.venueId
   * 2. originVenue if provided (optimistic)
   * 3. Set pendingVenueId for lazy fetch by confirmation screen
   */
  const handleInspectionCreated = useCallback((inspectionData: any, originVenue?: Venue | null) => {
    console.debug('handleInspectionCreated called with inspectionData=', inspectionData, 'originVenue=', originVenue);
    
    // Normalize server response to canonical shape
    const id = inspectionData.inspection_id || inspectionData.id;
    const simpleInspection: Inspection = {
      id,
      venueId: inspectionData.venueId || inspectionData.venue_id || '',
      venueName: inspectionData.venueName || inspectionData.venue_name || '',
      roomId: inspectionData.roomId || inspectionData.room_id || '',
      roomName: inspectionData.roomName || inspectionData.room_name || '',
      createdAt: inspectionData.createdAt || inspectionData.timestamp || '',
      createdBy: inspectionData.createdBy || displayName,
      items: [],
      status: (inspectionData.status as any) || 'in-progress',
    };

    // Apply originVenue optimistically if server response lacks venue info
    if (originVenue) {
      console.debug('handleInspectionCreated: applying originVenue optimistically', originVenue.id);
      simpleInspection.venueId = simpleInspection.venueId || originVenue.id;
      simpleInspection.venueName = simpleInspection.venueName || originVenue.name;
    }

    // Add to local state and select
    setInspections((prev) => [...prev, simpleInspection]);
    selectInspection(id);

    // Resolve venue context for UI
    const vid = simpleInspection.venueId;
    if (originVenue && !vid) {
      console.debug('handleInspectionCreated: using originVenue for missing vid', originVenue.id);
      selectVenue(originVenue);
      setPendingVenueId(null);
    } else if (vid) {
      const v = venues.find((x) => x.id === vid);
      if (v) {
        console.debug('handleInspectionCreated: found local venue for vid=', vid);
        selectVenue(v);
      } else if (originVenue) {
        console.debug('handleInspectionCreated: using originVenue for vid=', vid, 'originVenue=', originVenue?.id);
        selectVenue(originVenue);
        setPendingVenueId(null);
      } else {
        console.debug('handleInspectionCreated: venue not found locally; setting pendingVenueId=', vid);
        setPendingVenueId(vid);
        selectVenue(null);
      }
    } else {
      console.debug('handleInspectionCreated: no venue available; clearing pendingVenueId');
      selectVenue(null);
      setPendingVenueId(null);
    }
    
    navigate('confirmInspection');
  }, [displayName, venues, setInspections, selectInspection, selectVenue, setPendingVenueId, navigate]);

  /**
   * Handles inspection form submission.
   * 
   * Updates local state with the submitted inspection data. Does NOT
   * determine completion status client-side (server-authoritative).
   * 
   * @param inspection - The inspection data from the form
   * @returns void
   * 
   * Post-submit:
   * - Updates or adds inspection in local state
   * - Clears all selection state
   * - Navigates to home
   */
  const handleInspectionSubmit = useCallback((inspection: Inspection) => {
    const updatedInspection = { ...inspection, status: (inspection.status || 'in-progress') as any };

    if (currentInspectionId) {
      setInspections(inspections.map((insp) => (insp.id === currentInspectionId ? updatedInspection : insp)));
    } else {
      setInspections([...inspections, updatedInspection]);
    }

    selectInspection(null);
    selectVenue(null);
    selectRoom(null);
    navigate('home');
  }, [currentInspectionId, inspections, setInspections, selectInspection, selectVenue, selectRoom, navigate]);

  /**
   * Resumes an existing inspection (in-progress) or views a completed one.
   * 
   * Accepts either:
   * - A string ID (legacy path from local state)
   * - A full inspection object (from InspectorHome/DynamoDB)
   * 
   * Flow:
   * 1. Normalize input to get inspection ID
   * 2. Upsert inspection into local state if not present
   * 3. Select the inspection as current
   * 4. Determine read-only state based on completion
   * 5. Resolve venue and room, fetch saved items
   * 6. Navigate to appropriate view (inspection form if room found, else rooms/selectVenue)
   * 
   * @param inspectionOrId - Inspection ID string OR full inspection object
   * @returns void
   */
  const handleResumeInspection = useCallback((inspectionOrId: string | any) => {
    // Legacy flow: string ID was passed
    if (typeof inspectionOrId === 'string') {
      const inspection = inspections.find((i) => i.id === inspectionOrId);
      if (!inspection) return;
      
      selectInspection(inspectionOrId);
      
      if (inspection.venueId) {
        const venue = venues.find((v) => v.id === inspection.venueId);
        if (venue) {
          selectVenue(venue);
          if (inspection.roomId) {
            const room = venue.rooms.find((r) => r.id === inspection.roomId);
            if (room) {
              selectRoom(room);
              // Fetch and map saved items
              fetchInspectionItems(inspectionOrId, room.id).then((items) => {
                if (items && items.length > 0) {
                  const mapped = items.map((it: any) => {
                    const id = it.itemId || it.item || it.ItemId || generateItemId();
                    const name = it.itemName || it.item || it.ItemName || '';
                    return { id, name, status: it.status, notes: it.comments || '', photos: it.photos || [] };
                  });

                  setEditingInspection({ ...inspection, items: mapped });

                  // Upsert into local state
                  setInspections((prev) => {
                    const existing = prev.find((p) => p.id === inspectionOrId);
                    if (existing) {
                      return prev.map((p) => (p.id === inspectionOrId ? { ...p, items: mapped } : p));
                    }
                    return [...prev, { ...(inspection as any), items: mapped }];
                  });
                }
              }).catch(() => {});
              navigate('inspection');
              return;
            }
          }
          navigate('rooms');
          return;
        }
      }
      navigate('selectVenue');
      return;
    }

    // Object flow: full inspection from InspectorHome (DynamoDB)
    const incoming = inspectionOrId;
    const id = incoming.id || incoming.inspection_id;
    if (!id) {
      console.error('handleResumeInspection: incoming inspection object missing id', incoming);
      return;
    }

    // Check if already in local state
    const existing = inspections.find((i) => i.id === id);
    
    // Normalize to canonical shape
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

    // Upsert if not present
    if (!existing) {
      setInspections((prev) => [...prev, simpleInspection]);
    }

    selectInspection(id);
    
    // Completed inspections are read-only (check both status and completedAt for consistency)
    const isCompleted = (simpleInspection.status || '').toString().toLowerCase() === 'completed';
    const hasCompletedAt = Boolean(incoming.completedAt || incoming.completed_at);
    setInspectionReadOnly(isCompleted || hasCompletedAt);

    // Resolve venue and room
    const venue = venues.find((v) => v.id === simpleInspection.venueId);
    if (venue) {
      selectVenue(venue);
      if (simpleInspection.roomId) {
        const room = venue.rooms.find((r) => r.id === simpleInspection.roomId);
        if (room) {
          selectRoom(room);
          // Fetch saved items for display
          fetchInspectionItems(id, room.id).then((items) => {
            if (items && items.length > 0) {
              const mapped = items.map((it: any) => {
                const itemId = it.itemId || it.item || it.ItemId || generateItemId();
                const name = it.itemName || it.item || it.ItemName || '';
                return { id: itemId, name, status: it.status, notes: it.comments || '', photos: it.photos || [] };
              });
              setEditingInspection({ ...simpleInspection, items: mapped });
            }
          }).catch(() => {});
          navigate('inspection');
          return;
        }
      }
      navigate('rooms');
      return;
    }

    // Venue not found locally: set pending for lazy fetch
    setPendingVenueId(simpleInspection.venueId || null);
    navigate(simpleInspection.venueId ? 'rooms' : 'selectVenue');
  }, [inspections, venues, selectInspection, selectVenue, selectRoom, setInspections, setEditingInspection, setInspectionReadOnly, setPendingVenueId, fetchInspectionItems, navigate]);

  /**
   * Creates a new inspection pre-populated with only the failed items from
   * a completed inspection.
   * 
   * Used for "Re-inspect failed items" functionality. Resets status to null
   * and prefixes notes with "Re-inspection:".
   * 
   * @param inspection - The original completed inspection
   * @returns void
   * 
   * Requirements:
   * - Venue and room must be resolvable from local state
   * - Only items with status === 'fail' are included
   */
  const handleReInspection = useCallback((inspection: Inspection) => {
    const venue = venues.find((v) => v.id === inspection.venueId);
    const room = venue?.rooms.find((r) => r.id === inspection.roomId);

    if (venue && room) {
      selectVenue(venue);
      selectRoom(room);

      // Create new inspection with failed items only, statuses reset
      const failedItemsInspection: Inspection = {
        ...inspection,
        items: inspection.items.filter((item) => item.status === 'fail').map((item) => ({
          ...item,
          status: null, // Reset for re-inspection
          notes: `Re-inspection: ${item.notes}`,
        })),
      };

      setEditingInspection(failedItemsInspection);
      setEditingInspectionIndex(null);
      navigate('inspection');
    }
  }, [venues, selectVenue, selectRoom, setEditingInspection, setEditingInspectionIndex, navigate]);

  /**
   * Opens an existing inspection for editing.
   * 
   * @param inspection - The inspection to edit
   * @param index - Array index of the inspection (legacy tracking)
   * @returns void
   */
  const handleEditInspection = useCallback((inspection: Inspection, index: number) => {
    const venue = venues.find((v) => v.id === inspection.venueId);
    const room = venue?.rooms.find((r) => r.id === inspection.roomId);

    if (venue && room) {
      selectVenue(venue);
      selectRoom(room);
      setEditingInspection(inspection);
      setEditingInspectionIndex(index);
      navigate('inspection');
    }
  }, [venues, selectVenue, selectRoom, setEditingInspection, setEditingInspectionIndex, navigate]);

  /**
   * Deletes an inspection by its array index.
   * 
   * @deprecated Use handleDeleteInspectionById instead
   * @param index - Array index of inspection to delete
   * @returns void
   */
  const handleDeleteInspection = useCallback((index: number) => {
    setInspections(inspections.filter((_, i) => i !== index));
  }, [inspections, setInspections]);

  /**
   * Deletes an inspection by its ID.
   * 
   * Note: This only removes from local state. The actual server deletion
   * is handled by InspectorHome which calls the delete API directly.
   * 
   * @param inspectionId - ID of the inspection to delete
   * @returns void
   */
  const handleDeleteInspectionById = useCallback((inspectionId: string) => {
    setInspections(inspections.filter((i) => i.id !== inspectionId));
  }, [inspections, setInspections]);

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVIGATION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handles back navigation from venue selection screen.
   * Clears venue selection and returns to home.
   * 
   * @returns void
   */
  const handleBackFromVenueSelect = useCallback(() => {
    selectVenue(null);
    navigate('home');
  }, [selectVenue, navigate]);

  /**
   * Handles back navigation from rooms list.
   * 
   * Behavior depends on context:
   * - With active inspection: Clears all state, returns to home
   * - Without inspection: Returns to venues list (venue management mode)
   * 
   * @returns void
   */
  const handleBackFromRooms = useCallback(() => {
    if (currentInspectionId) {
      selectInspection(null);
      selectVenue(null);
      selectRoom(null);
      navigate('home');
    } else {
      selectVenue(null);
      navigate('venues');
    }
  }, [currentInspectionId, selectInspection, selectVenue, selectRoom, navigate]);

  /**
   * Handles back navigation from inspection form.
   * 
   * Preserves read-only state based on inspection completion status.
   * Navigation target depends on whether a venue is selected.
   * 
   * @returns void
   */
  const handleBackFromInspection = useCallback(() => {
    // Update read-only state based on current inspection (check both status and completedAt)
    if (currentInspectionId) {
      const insp = inspections.find((i) => i.id === currentInspectionId);
      if (insp) {
        const isCompleted = String(insp.status || '').toLowerCase() === 'completed';
        const hasCompletedAt = Boolean((insp as any).completedAt || (insp as any).completed_at);
        setInspectionReadOnly(isCompleted || hasCompletedAt);
      } else {
        setInspectionReadOnly(false);
      }
    } else {
      setInspectionReadOnly(false);
    }

    if (selectedVenue) {
      // Has venue: go back to room selection
      selectRoom(null);
      navigate('rooms');
    } else {
      // No venue: clear all and go home
      selectInspection(null);
      selectRoom(null);
      navigate('home');
    }
  }, [currentInspectionId, inspections, selectedVenue, selectInspection, selectRoom, setInspectionReadOnly, navigate]);

  /**
   * Generic back handler for VenueForm.
   * Navigation depends on current view context.
   * 
   * @returns void
   */
  const handleBack = useCallback(() => {
    if (currentView === 'rooms') {
      navigate('venues');
      selectVenue(null);
    } else if (currentView === 'inspection') {
      navigate('rooms');
      selectRoom(null);
      setEditingInspection(null);
      setEditingInspectionIndex(null);
    } else {
      navigate('venues');
      selectVenue(null);
    }
  }, [currentView, navigate, selectVenue, selectRoom, setEditingInspection, setEditingInspectionIndex]);

  /**
   * Returns to home, clearing all selection state.
   * 
   * @returns void
   */
  const handleBackToHome = useCallback(() => {
    selectInspection(null);
    selectVenue(null);
    selectRoom(null);
    navigate('home');
  }, [selectInspection, selectVenue, selectRoom, navigate]);

  /**
   * Navigates to inspection history view.
   * @returns void
   */
  const handleViewHistory = useCallback(() => {
    navigate('history');
  }, [navigate]);

  /**
   * Navigates to user profile view.
   * @returns void
   */
  const handleViewProfile = useCallback(() => {
    navigate('profile');
  }, [navigate]);

  /**
   * Navigates to dashboard view.
   * @returns void
   */
  const handleViewDashboard = useCallback(() => {
    navigate('dashboard');
  }, [navigate]);

  /**
   * Confirms inspection setup and proceeds to room selection.
   * Called from InspectionConfirmation screen.
   * 
   * @returns void
   */
  const handleConfirmInspection = useCallback(() => {
    navigate('rooms');
  }, [navigate]);

  /**
   * Returns to home from confirmation screen without proceeding.
   * Keeps the inspection as ongoing (already saved with venue info).
   * 
   * @returns void
   */
  const handleReturnHomeFromConfirm = useCallback(() => {
    selectInspection(null);
    selectVenue(null);
    navigate('home');
  }, [selectInspection, selectVenue, navigate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN VALUE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Returns all handlers and state needed by AppContent.
   * 
   * Grouped by category for clarity:
   * - Navigation state: currentView, navigate, goBack, goHome
   * - Venue state & handlers: venues, selectedVenue, handlers...
   * - Room handlers: handleRoomSelect
   * - Inspection state & handlers: inspections, currentInspectionId, handlers...
   * - Navigation handlers: handleBackFrom*, handleView*...
   */
  return {
    // Navigation state
    currentView,
    navigate,
    goBack,
    goHome,

    // Venue state & handlers
    venues,
    selectedVenue,
    selectedRoom,
    pendingVenueId,
    setVenues,
    setPendingVenueId,
    selectVenue,
    selectRoom,
    handleVenueSelect,
    handleAddVenue,
    handleEditVenue,
    handleDeleteVenue,
    handleSaveVenue,

    // Room handlers
    handleRoomSelect,

    // Inspection state & handlers
    inspections,
    currentInspectionId,
    isCreating,
    handleCreateNewInspection,
    handleInspectionCreated,
    handleInspectionSubmit,
    handleResumeInspection,
    handleReInspection,
    handleEditInspection,
    handleDeleteInspection,
    handleDeleteInspectionById,

    // Navigation handlers
    handleBackFromVenueSelect,
    handleBackFromRooms,
    handleBackFromInspection,
    handleBack,
    handleBackToHome,
    handleViewHistory,
    handleViewProfile,
    handleViewDashboard,
    handleConfirmInspection,
    handleReturnHomeFromConfirm,
  };
}
