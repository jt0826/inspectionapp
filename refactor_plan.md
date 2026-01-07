# 🛠️ Actionable Refactoring Checklist

This checklist is organized by priority and includes specific file references, line numbers, and implementation guidance.

---

## Phase 1: Configuration & Infrastructure (Do First)

### 1.1 Create Centralized API Configuration

**Problem:** API URLs hardcoded in 15+ locations

**Create new file:** `src/config/api.ts`

```tsx
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '<https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev>';

export const API = {
  // Inspections
  inspectionsQuery: `${API_BASE}/inspections-query`,
  inspectionsCreate: `${API_BASE}/inspections-create`,
  inspectionsDelete: `${API_BASE}/inspections-delete`,
  inspections: `${API_BASE}/inspections`,

  // Venues
  venuesQuery: `${API_BASE}/venues-query`,
  venuesCreate: `${API_BASE}/venues-create`,

  // Images
  listImagesDb: `${API_BASE}/list-images-db`,
  registerImage: `${API_BASE}/register-image`,
  signUpload: `${API_BASE}/sign-upload`,
  deleteS3ByDbEntry: `${API_BASE}/delete-s3-by-db-entry`,
  deleteImageDb: `${API_BASE}/delete-image-db`,

  // Dashboard
  dashboard: `${API_BASE}/dashboard`,
};

```

**Files to update (replace hardcoded URLs with imports):**

| File | Lines | Current URL | Replace With |
| --- | --- | --- | --- |
| App.tsx | 128 | `API_BASE` variable | Remove, use API config |
| App.tsx | 192 | `/inspections` | `API.inspections` |
| App.tsx | 233 | `/inspections` | `API.inspections` |
| App.tsx | 569 | `/venues-create` | `API.venuesCreate` |
| inspectionApi.ts | 4,31,55,etc | Multiple URLs | Use `API.*` |
| venueApi.ts | 4 | `/venues-query` | `API.venuesQuery` |
| VenueForm.tsx | 7 | `API_BASE` variable | `API.venuesCreate` |
| VenueSelection.tsx | 74 | `/inspections-create` | `API.inspectionsCreate` |
| InspectorHome.tsx | 72 | `/inspections-query` | `API.inspectionsQuery` |
| InspectionForm.tsx | 256,276,290 | Multiple URLs | Use `API.*` |

---

### 1.2 Create Centralized ID Generator

**Problem:** ID generation scattered with inconsistent formats

**Create new file:** `src/utils/id.ts`

```tsx
export const generateId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  // Fallback for older browsers
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
};

// Specific generators for type safety
export const generateInspectionId = () => generateId('insp');
export const generateVenueId = () => generateId('venue');
export const generateRoomId = () => generateId('room');
export const generateItemId = () => generateId('item');
export const generatePhotoId = () => generateId('photo');

```

**Files to update:**

| File | Lines | Current Code | Replace With |
| --- | --- | --- | --- |
| VenueForm.tsx | 24-32 | `generateId()` function | Import from `utils/id` |
| VenueSelection.tsx | 62 | ``inspection-${Date.now()}`` | `generateInspectionId()` |
| InspectionForm.tsx | 44 | `makePhotoId()` | `generatePhotoId()` |
| App.tsx | 358 | `'item_' + Math.random()...` | `generateItemId()` |
| App.tsx | 395 | `'insp_' + Date.now()` | `generateInspectionId()` |

---

## Phase 2: Type System & Data Normalization

### 2.1 Create Canonical Type Definitions

**Problem:** Same data has multiple field names (`venueId` vs `venue_id` vs `venue`)

**Create new file:** `src/types/inspection.ts`

```tsx
// Canonical types - use these everywhere in frontend
export interface Inspection {
  id: string;
  venueId: string;
  venueName: string;
  roomId: string;
  roomName: string;
  inspectorName: string;
  status: 'draft' | 'in-progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  items: InspectionItem[];
  totals?: InspectionTotals;
}

export interface InspectionTotals {
  pass: number;
  fail: number;
  na: number;
  pending: number;
  total: number;
}

export interface InspectionItem {
  id: string;
  name: string;  // renamed from 'item' for clarity
  status: 'pass' | 'fail' | 'na' | 'pending';
  notes: string;
  photos: Photo[];
}

export interface Photo {
  id: string;
  imageId?: string;
  s3Key?: string;
  preview?: string;
  filename?: string;
  contentType?: string;
  filesize?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  status: 'pending' | 'uploading' | 'uploaded';
}

```

**Create new file:** `src/types/venue.ts`

```tsx
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
  items: RoomItem[];
}

export interface RoomItem {
  id: string;
  name: string;
}

```

---

### 2.2 Create Data Normalizers

**Problem:** Every component has its own normalization logic

**Create new file:** `src/utils/normalizers.ts`

```tsx
import type { Inspection, Venue, Room, InspectionItem } from '../types';

// Normalize API response to canonical Inspection
export function normalizeInspection(raw: any): Inspection {
  return {
    id: raw.inspection_id || raw.id || '',
    venueId: raw.venueId || raw.venue_id || raw.venue || '',
    venueName: raw.venueName || raw.venue_name || '',
    roomId: raw.roomId || raw.room_id || raw.room || '',
    roomName: raw.roomName || raw.room_name || '',
    inspectorName: raw.inspectorName || raw.createdBy || raw.created_by || raw.inspector_name || '',
    status: normalizeStatus(raw.status),
    createdAt: raw.createdAt || raw.created_at || raw.timestamp || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    completedAt: raw.completedAt || raw.completed_at || undefined,
    items: (raw.items || []).map(normalizeInspectionItem),
    totals: raw.totals || undefined,
  };
}

export function normalizeVenue(raw: any): Venue {
  return {
    id: raw.venueId || raw.id || '',
    name: raw.name || '',
    address: raw.address || '',
    rooms: (raw.rooms || []).map(normalizeRoom),
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || raw.createdAt || '',
    createdBy: raw.createdBy || '',
  };
}

export function normalizeRoom(raw: any): Room {
  return {
    id: raw.roomId || raw.id || '',
    name: raw.name || '',
    items: (raw.items || []).map((it: any) => ({
      id: it.itemId || it.id || '',
      name: it.name || it.item || '',
    })),
  };
}

export function normalizeInspectionItem(raw: any): InspectionItem {
  return {
    id: raw.itemId || raw.id || raw.ItemId || '',
    name: raw.itemName || raw.item || raw.ItemName || raw.name || '',
    status: normalizeStatus(raw.status) as any,
    notes: raw.comments || raw.notes || '',
    photos: raw.photos || [],
  };
}

function normalizeStatus(s: any): 'draft' | 'in-progress' | 'completed' | 'pending' {
  const str = String(s || 'pending').toLowerCase();
  if (str === 'completed') return 'completed';
  if (str === 'in-progress' || str === 'in_progress') return 'in-progress';
  if (str === 'draft') return 'draft';
  return 'pending';
}

```

**Files to update (replace inline normalization):**

| File | Lines | Current Code | Action |
| --- | --- | --- | --- |
| App.tsx | 131-143 | `mapDbVenueToVenue()` | Replace with `normalizeVenue()` |
| App.tsx | 308-322 | Inline inspection mapping | Use `normalizeInspection()` |
| App.tsx | 395-406 | Inline `simpleInspection` creation | Use `normalizeInspection()` |
| VenueList.tsx | 119 | Inline venue mapping | Use `normalizeVenue()` |
| VenueSelection.tsx | 35 | Inline venue mapping | Use `normalizeVenue()` |
| RoomList.tsx | 54 | Inline venue mapping | Use `normalizeVenue()` |
| InspectorHome.tsx | 237-261 | Complex inline normalization | Use `normalizeInspection()` |
| InspectionHistory.tsx | 80-110 | `normalize()` function | Replace with shared normalizer |

---

## Phase 3: Break Up App.tsx (Most Important Refactor)

### 3.1 Extract Navigation State Machine

**Problem:** App.tsx is 828 lines handling navigation, state, and API calls

**Create new file:** `src/hooks/useNavigation.ts`

```tsx
import { useState, useCallback } from 'react';

export type View =
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

export function useNavigation() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [viewHistory, setViewHistory] = useState<View[]>(['home']);

  const navigate = useCallback((view: View) => {
    setViewHistory(prev => [...prev, view]);
    setCurrentView(view);
  }, []);

  const goBack = useCallback(() => {
    setViewHistory(prev => {
      if (prev.length <= 1) return prev;
      const newHistory = prev.slice(0, -1);
      setCurrentView(newHistory[newHistory.length - 1]);
      return newHistory;
    });
  }, []);

  const goHome = useCallback(() => {
    setViewHistory(['home']);
    setCurrentView('home');
  }, []);

  return { currentView, navigate, goBack, goHome };
}

```

**Update App.tsx:**

- Remove lines 108-116 (View type definition) → import from hook
- Remove `currentView` state (line 120) → use hook
- Replace `setCurrentView()` calls with `navigate()`

---

### 3.2 Extract Inspection State Management

**Create new file:** `src/hooks/useInspections.ts`

```tsx
import { useState, useCallback } from 'react';
import type { Inspection } from '../types/inspection';
import { normalizeInspection } from '../utils/normalizers';
import { API } from '../config/api';

export function useInspections() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const currentInspection = inspections.find(i => i.id === currentInspectionId) || null;

  const createInspection = useCallback(async (venueId: string, venueName: string, userId: string) => {
    setIsCreating(true);
    try {
      const inspectionId = generateInspectionId();
      const response = await fetch(API.inspectionsCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_inspection',
          inspection: {
            inspection_id: inspectionId,
            venueId,
            venueName,
            createdBy: userId,
            status: 'in-progress',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to create inspection');

      const data = await response.json();
      const body = data.body ? JSON.parse(data.body) : data;
      const created = normalizeInspection(body.inspectionData || body.inspection || body);

      setInspections(prev => [...prev, created]);
      setCurrentInspectionId(created.id);

      return created;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const updateInspection = useCallback((id: string, updates: Partial<Inspection>) => {
    setInspections(prev =>
      prev.map(insp => (insp.id === id ? { ...insp, ...updates } : insp))
    );
  }, []);

  const deleteInspection = useCallback((id: string) => {
    setInspections(prev => prev.filter(i => i.id !== id));
    if (currentInspectionId === id) {
      setCurrentInspectionId(null);
    }
  }, [currentInspectionId]);

  const selectInspection = useCallback((id: string | null) => {
    setCurrentInspectionId(id);
  }, []);

  return {
    inspections,
    currentInspection,
    currentInspectionId,
    isCreating,
    createInspection,
    updateInspection,
    deleteInspection,
    selectInspection,
    setInspections, // for bulk updates from API
  };
}

```

**Functions to move from App.tsx:**

| Current Location | Lines | Move To |
| --- | --- | --- |
| `handleInspectionSubmit` | 285-300 | `useInspections.completeInspection()` |
| `handleCreateNewInspection` | 302-308 | `useInspections.startCreation()` |
| `handleInspectionCreated` | 311-343 | `useInspections.createInspection()` |
| `handleResumeInspection` | 358-447 | `useInspections.resumeInspection()` |
| `handleDeleteInspectionById` | 640-642 | `useInspections.deleteInspection()` |

---

### 3.3 Extract Venue State Management

**Create new file:** `src/hooks/useVenues.ts`

```tsx
import { useState, useCallback } from 'react';
import type { Venue, Room } from '../types/venue';
import { normalizeVenue } from '../utils/normalizers';
import { API } from '../config/api';

export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [pendingVenueId, setPendingVenueId] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    const response = await fetch(API.venuesQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_venues' }),
    });
    const data = await response.json();
    const body = data.body ? JSON.parse(data.body) : data;
    const items = body.venues || body.Items || body || [];
    setVenues(items.map(normalizeVenue));
  }, []);

  const selectVenue = useCallback((venue: Venue | null) => {
    setSelectedVenue(venue);
    if (!venue) setSelectedRoom(null);
  }, []);

  const selectRoom = useCallback((room: Room | null) => {
    setSelectedRoom(room);
  }, []);

  const deleteVenue = useCallback(async (venueId: string) => {
    // Implementation from App.tsx lines 538-593
  }, []);

  const saveVenue = useCallback(async (venue: Venue, isEdit: boolean) => {
    // Implementation from App.tsx lines 595-630
  }, []);

  return {
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
  };
}

```

**Functions to move from App.tsx:**

| Current Location | Lines | Move To |
| --- | --- | --- |
| `handleVenueSelect` | 171-213 | `useVenues.selectVenue()` + separate inspection update |
| `handleRoomSelect` | 215-265 | `useVenues.selectRoom()` + separate inspection update |
| `handleDeleteVenue` | 538-593 | `useVenues.deleteVenue()` |
| `handleSaveVenue` | 595-630 | `useVenues.saveVenue()` |
| `handleEditVenue` | 533-536 | Keep in App.tsx (just navigates) |

---

### 3.4 Move `handleConfirmInspection` Logic

**Current location:** App.tsx

**Problem:** This function fetches venue data and then navigates. It should be split.

**Recommended change:**

```tsx
// In App.tsx - simplified
const handleConfirmInspection = () => {
  navigate('rooms');
};

// In RoomList.tsx - add venue fetching on mount (already partially exists)
useEffect(() => {
  if (!venue && (venueId || pendingVenueId)) {
    fetchVenue(venueId || pendingVenueId);
  }
}, [venue, venueId, pendingVenueId]);

```

**Action:** Remove lines 679-696 from App.tsx. RoomList.tsx already handles venue fetching when `venueId` prop is passed (lines 32-58).

---

## Phase 4: Replace Window Events with Context

### 4.1 Create Inspection Context

**Problem:** Components communicate via `window.dispatchEvent('inspectionSaved')`

**Current event dispatches:**

- inspectionApi.ts - after delete
- App.tsx - after venue selection persisted
- App.tsx - after room selection persisted
- InspectionForm.tsx - after save
- VenueSelection.tsx - after create

**Current listeners:**

- InspectorHome.tsx
- InspectionHistory.tsx
- VenueList.tsx

**Create new file:** `src/contexts/InspectionContext.tsx`

```tsx
import React, { createContext, useContext, useCallback, useState } from 'react';
import { useInspections } from '../hooks/useInspections';

interface InspectionContextValue {
  // All values from useInspections
  inspections: Inspection[];
  currentInspection: Inspection | null;
  // ... etc

  // Refresh trigger for components that need to refetch
  refreshKey: number;
  triggerRefresh: () => void;
}

const InspectionContext = createContext<InspectionContextValue | null>(null);

export function InspectionProvider({ children }: { children: React.ReactNode }) {
  const inspectionsHook = useInspections();
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <InspectionContext.Provider value={{ ...inspectionsHook, refreshKey, triggerRefresh }}>
      {children}
    </InspectionContext.Provider>
  );
}

export const useInspectionContext = () => {
  const ctx = useContext(InspectionContext);
  if (!ctx) throw new Error('useInspectionContext must be used within InspectionProvider');
  return ctx;
};

```

**Files to update:**

| File | Current Code | Replace With |
| --- | --- | --- |
| inspectionApi.ts | `window.dispatchEvent(...)` | Return result, let caller handle |
| InspectorHome.tsx | `window.addEventListener(...)` | `useEffect` with `refreshKey` dep |
| VenueList.tsx | `window.addEventListener(...)` | `useEffect` with `refreshKey` dep |

---

## Phase 5: Specific Function Relocations

### 5.1 Move API Calls Out of Components

| Function | Current Location | New Location | Reason |
| --- | --- | --- | --- |
| Venue persist on selection | App.tsx | `useInspections.updateVenue()` | API calls shouldn't be in event handlers |
| Room persist on selection | App.tsx | `useInspections.updateRoom()` | Same |
| `fetchInspectionItems` | App.tsx | inspectionApi.ts | Already exists there, remove duplicate |
| Image fetching | InspectionForm.tsx | `src/utils/imageApi.ts` (new) | Separate concerns |

---

### 5.2 InspectionForm.tsx Cleanup (932 lines)

**Split into:**

1. **`src/components/inspection/InspectionHeader.tsx`** (lines 585-608)
    - Header with back button, venue/room info
2. **`src/components/inspection/InspectionProgress.tsx`** (lines 610-650)
    - Progress bar and pass/fail/na counts
3. **`src/components/inspection/InspectionItemCard.tsx`** (lines 716-862)
    - Individual item with status buttons, notes, photos
4. **`src/components/inspection/PhotoGrid.tsx`** (lines 778-832)
    - Photo display and upload UI
5. **`src/components/inspection/Lightbox.tsx`** (lines 883-915)
    - Image lightbox modal

**Keep in InspectionForm.tsx:**

- State management
- `handleSubmit` (lines 289-498)
- `handlePhotoUpload` (lines 504-520)
- `removePhoto` (lines 534-577)

---

## Phase 6: Add Idempotency

### 6.1 Client-Side Idempotency Keys

**File:** InspectionForm.tsx

**Current `handleSubmit` (line 289):**

```tsx
const handleSubmit = async () => {
  if (submittingRef.current) return;
  submittingRef.current = true;
  // ...

```

**Add idempotency key:**

```tsx
const handleSubmit = async () => {
  if (submittingRef.current) return;
  submittingRef.current = true;

  // Generate idempotency key for this submission
  const idempotencyKey = `submit_${inspectionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Include in all API calls
  const headers = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
  };
  // ...

```

**Backend change needed:** Lambda should check `X-Idempotency-Key` header and reject duplicates within 5-minute window.

---

### 6.2 Image Upload Idempotency

**File:** InspectionForm.tsx

**Problem:** `register-image` can be called multiple times for same image on retry.

**Add to photo object before upload:**

```tsx
const photoObj = {
  id: generatePhotoId(),
  idempotencyKey: `upload_${inspectionId}_${itemId}_${Date.now()}`, // Add this
  file,
  preview,
  // ...
};

```

**Include in register-image call (line 376):**

```tsx
body: JSON.stringify({
  key,
  idempotencyKey: p.idempotencyKey, // Add this
  inspectionId: inspId,
  // ...
})

```

---

## Phase 7: Cleanup Tasks

### 7.1 Remove Dead Code

| File | Lines | What | Action |
| --- | --- | --- | --- |
| App.tsx | 65-101 | `mockVenues` array | Delete - never used |
| App.tsx | 157-163 | `inspectionsCountMap` | Delete - never used in render |
| App.tsx | 128 | `API_BASE` variable | Delete after centralization |
| InspectionForm.tsx | 21-36 | `defaultInspectionItems` | Move to `src/config/defaults.ts` |

---

### 7.2 Fix Type Safety

| File | Lines | Current | Fix |
| --- | --- | --- | --- |
| App.tsx | 131 | `(v: any)` | `(v: RawVenue)` - define `RawVenue` type |
| InspectorHome.tsx | 46 | `Record<string, unknown>[]` | `RawInspection[]` |
| InspectionForm.tsx | 168 | `(it: any)` | `(it: RawInspectionItem)` |

---

### 7.3 Consolidate Date Formatting

**Create:** `src/utils/date.ts`

```tsx
export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString('en-GB');
}

```

**Files with duplicate `formatDate`:**

- InspectionCard.tsx → Delete, import shared
- InspectorHome.tsx → Delete, import shared
- InspectionHistory.tsx → Delete, import shared

---

## Final Refactored App.tsx Structure

After all changes, App.tsx should be ~200 lines:

```tsx
// src/App.tsx (~200 lines)
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { InspectionProvider } from './contexts/InspectionContext';
import { VenueProvider } from './contexts/VenueContext';
import { useNavigation } from './hooks/useNavigation';
import { useInspectionContext } from './contexts/InspectionContext';
import { useVenueContext } from './contexts/VenueContext';
import { useAuth } from './contexts/AuthContext';
// ... component imports

function AppContent() {
  const { isAuthenticated } = useAuth();
  const { currentView, navigate, goHome } = useNavigation();
  const { currentInspection, selectInspection } = useInspectionContext();
  const { selectedVenue, selectedRoom, selectVenue, selectRoom } = useVenueContext();

  if (!isAuthenticated) return <Login />;

  return (
    <div className="min-h-screen bg-gray-50">
      {currentView === 'home' && <InspectorHome onNavigate={navigate} />}
      {currentView === 'rooms' && <RoomList onNavigate={navigate} />}
      {/* ... other views */}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <InspectionProvider>
          <VenueProvider>
            <AppContent />
          </VenueProvider>
        </InspectionProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

```

---

## Implementation Order

| Week | Tasks |
| --- | --- |
| **1** | 1.1 API config, 1.2 ID generator, 7.1 Remove dead code |
| **2** | 2.1 Type definitions, 2.2 Normalizers, 7.3 Date utils |
| **3** | 3.1 Navigation hook, 3.2 Inspections hook, 3.3 Venues hook |
| **4** | 4.1 Context replacement, remove window events |
| **5** | 3.4 Relocate remaining functions, 5.1-5.2 Component splits |
| **6** | 6.1-6.2 Idempotency, 7.2 Type safety cleanup |

This gives you a 6-week plan with specific, measurable deliverables each week.