
---

# 🧪 Facility Inspector – Comprehensive Test Suite Plan

## Executive Summary

This document outlines a thorough testing strategy for the **Facility Inspector** application, covering all layers from UI components through API integration to backend Lambda functions. The plan follows a **testing pyramid** approach with appropriate coverage at each layer.

```
                    ┌─────────────────┐
                    │   E2E Tests     │  (Playwright/Cypress)
                    │   ~10-15 tests  │
                 ┌──┴─────────────────┴──┐
                 │   Integration Tests   │  (API + Component)
                 │      ~40-60 tests     │
              ┌──┴───────────────────────┴──┐
              │       Unit Tests            │  (Vitest + pytest)
              │       ~150-200 tests        │
              └─────────────────────────────┘
```

---

## 1. Frontend Unit Tests (Vitest + React Testing Library)

### 1.1 Component Tests

**Location:** __tests__

#### Already Implemented ✅
| Component | Test File | Coverage |
|-----------|-----------|----------|
| InspectionHeader | InspectionHeader.test.tsx | Renders room/venue/back button |
| InspectionProgress | `InspectionProgress.test.tsx` | Progress bar states |
| InspectionItemCard | `InspectionItemCard.test.tsx` | Item status rendering |
| Lightbox | `Lightbox.test.tsx` | Image viewer navigation |
| PhotoGrid | `PhotoGrid.test.tsx` | Photo gallery display |

#### Needed Components (Priority Order)

**High Priority**
| Component | Test Cases |
|-----------|------------|
| **Login.tsx** | • Renders email/password fields and submit button<br>• Shows error on invalid credentials<br>• Calls `login()` with entered values<br>• Displays loading state during auth<br>• Shows demo credentials info |
| **InspectorHome.tsx** | • Renders ongoing inspections list<br>• Renders completed inspections (max 6)<br>• Create new inspection button works<br>• Resume inspection callback fires<br>• Delete inspection with confirmation<br>• Loading state displays correctly<br>• Empty state when no inspections |
| **InspectionForm.tsx** | • Renders item list from room definition<br>• Pass/Fail/NA button interactions<br>• Notes field updates item state<br>• Photo upload triggers signUpload flow<br>• Read-only mode disables all inputs<br>• Search/filter functionality<br>• Auto-save triggers on item change<br>• Lightbox opens on photo click |
| **VenueForm.tsx** | • Create mode renders empty form<br>• Edit mode pre-fills venue data<br>• Add/remove room functionality<br>• Add/remove item within room<br>• Validation blocks empty submissions<br>• Confirmation dialog on edit save |
| **Dashboard.tsx** | • Renders KPI cards (total, ongoing, completed)<br>• Pass rate calculation displays<br>• Venue risk scores table renders<br>• Inspector performance table renders<br>• Trend indicators (up/down/stable)<br>• Loading skeleton state<br>• Charts render with data |

**Medium Priority**
| Component | Test Cases |
|-----------|------------|
| **VenueList.tsx** | • Renders list of venues<br>• Edit/Delete buttons trigger handlers<br>• Search/filter venues<br>• Loading state |
| **VenueSelection.tsx** | • Renders venues for inspection start<br>• Creates inspection on venue select<br>• Back navigation |
| **RoomList.tsx** | • Renders rooms from selected venue<br>• Shows completion status per room<br>• Navigation to inspection form |
| **InspectionHistory.tsx** | • Renders completed inspections<br>• Pagination/scrolling<br>• Resume/View actions |
| **InspectionConfirmation.tsx** | • Displays venue/room summary<br>• Confirm/Cancel actions |
| **VenueLayout.tsx** | • Visual venue layout rendering<br>• Room interactive elements |
| **UserProfile.tsx** | • Displays user info<br>• Edit profile fields<br>• Logout action |

**Lower Priority**
| Component | Test Cases |
|-----------|------------|
| **ToastProvider.tsx** | • Shows success toast<br>• Shows error toast<br>• Confirm dialog returns promise<br>• Auto-dismiss after duration |
| **ErrorBoundary.tsx** | • Catches render errors<br>• Displays fallback UI<br>• Error info logged |
| **LoadingOverlay.tsx** | • Renders spinner<br>• Displays custom message |
| **InspectionCard.tsx** | • Displays inspection summary<br>• Status badge colors<br>• Action buttons |
| **FadeInText.tsx** | • Animates text appearance |

---

### 1.2 Hook Tests

**Location:** __tests__

| Hook | Test Cases |
|------|------------|
| **useNavigation.ts** | • Initial view is `'home'`<br>• `navigate()` changes `currentView`<br>• `goBack()` returns to previous view<br>• `goHome()` always returns to `'home'`<br>• View history stack maintained |
| **useInspections.ts** | • Initial state is empty array<br>• `createInspection()` calls API and adds to state<br>• `updateInspection()` updates item in array<br>• `deleteInspection()` removes from array<br>• `setVenueForCurrentInspection()` updates venue fields<br>• `setRoomForCurrentInspection()` updates room fields<br>• Normalizes API response to camelCase |
| **useVenues.ts** | • Initial state is empty array<br>• `fetchVenues()` calls API and normalizes<br>• `selectVenue()` / `selectRoom()` updates selection<br>• `saveVenue()` adds/updates local state<br>• `deleteVenue()` optimistic removal + rollback on error |
| **useAppHandlers.ts** | • Composes underlying hooks correctly<br>• `handleVenueSelect()` with/without active inspection<br>• `handleCreateNewInspection()` creates & navigates<br>• `handleResumeInspection()` sets editing state<br>• `handleDeleteVenue()` with confirmation + cascade<br>• `handleInspectionSubmit()` triggers save<br>• All back/navigation handlers work correctly |

---

### 1.3 Context Tests

**Location:** __tests__

| Context | Test Cases |
|---------|------------|
| **AuthContext.tsx** | • `isAuthenticated` false initially<br>• `login()` with valid credentials sets user<br>• `login()` with invalid credentials returns false<br>• `logout()` clears user state<br>• `updateProfile()` persists changes<br>• `getDisplayName()` returns user.name<br>• Persists to localStorage on login<br>• Restores from localStorage on mount |
| **InspectionContext.tsx** | • Provides `useInspections` values<br>• `triggerRefresh()` increments `refreshKey`<br>• `setLastLoadedInspections()` caches data<br>• Consumers re-render on `refreshKey` change |

---

### 1.4 Utility Function Tests

**Location:** __tests__

| Utility | Test Cases |
|---------|------------|
| **normalizers.ts** | • `normalizeInspection()` snake_case → camelCase<br>• `normalizeInspection()` handles missing fields<br>• `normalizeInspectionItem()` id fallbacks<br>• `normalizeVenue()` with rooms/items<br>• `normalizeRoom()` item normalization |
| **id.ts** | • `generateInspectionId()` format: `inspection_{uuid}`<br>• `generateVenueId()` format: `venue_{uuid}`<br>• `generateRoomId()` format: `room_{uuid}`<br>• `generateItemId()` format: `item_{uuid}`<br>• `generatePhotoId()` format: `photo_{uuid}`<br>• All IDs are unique |
| **case.ts** | • `toCamelCaseKeys()` converts object keys<br>• `toSnakeCaseKeys()` converts object keys<br>• Handles nested objects<br>• Handles arrays |
| **date.ts** | • `formatDateTime()` returns readable format<br>• Handles null/undefined<br>• Handles ISO strings with timezone |
| **imageApi.ts** | • `listImages()` calls correct endpoint<br>• `listImages()` returns empty array on error<br>• `signUpload()` returns presigned POST data<br>• `registerImage()` sends correct payload |
| **inspectionApi.ts** | • `getInspections()` normalizes response<br>• `getInspectionItems()` filters by room<br>• `deleteInspection()` with cascade flag<br>• `getInspectionSummary()` returns totals/byRoom<br>• Error handling returns graceful defaults |

---

### 1.5 Schema Validation Tests

**Location:** `src/schemas/__tests__/`

| Schema | Test Cases |
|--------|------------|
| **inspection.ts** | • `InspectionSchema` validates valid inspection<br>• Rejects invalid status values<br>• `InspectionItemSchema` validates items<br>• `PhotoSchema` validates photo metadata<br>• `parseInspection()` normalizes + validates |
| **venue.ts** | • `VenueSchema` validates venue structure<br>• `RoomSchema` validates room with items<br>• Rejects missing required fields |

---

## 2. Backend Unit Tests (pytest)

**Location:** tests

### 2.1 Lambda Handler Tests

| Lambda | Test Cases |
|--------|------------|
| **create_inspection.py** | • Returns 400 if `inspection_id` missing<br>• Returns 400 if ID format invalid<br>• Creates metadata row in InspectionMetadata<br>• Returns created inspection data<br>• Does not create duplicate meta rows |
| **get_inspections.py** | • Returns list of inspections<br>• Computes totals/byRoom per inspection<br>• Filters ongoing vs completed<br>• Respects `completed_limit` param<br>• Returns empty array if table empty |
| **handler.py** | • Saves metadata when items array empty<br>• Saves item rows for each item<br>• Updates `updatedAt` timestamp<br>• Rejects modification of completed inspections (403)<br>• Caches totals/byRoom after save |
| **completeness.py** | • Returns `complete: true` when all items PASS<br>• Returns `complete: false` with missing items<br>• Handles venues with no items<br>• Loads venue definition from VenueRooms table |
| **delete_inspection.py** | • Deletes metadata row<br>• Cascade deletes item rows<br>• Cascade deletes image metadata<br>• Cascade deletes S3 objects<br>• Returns summary of deleted items |
| **create_venue.py** | • Creates venue with rooms/items<br>• Updates existing venue<br>• Deletes venue with cascade<br>• Validates required fields |
| **get_venues.py** | • Returns all venues<br>• Handles pagination |
| **dashboard.py** | • Returns aggregated metrics<br>• Computes pass rate<br>• Returns venue risk scores<br>• Returns inspector performance<br>• Computes recent completed by day |
| **sign_s3_upload.py** | • Returns presigned POST URL<br>• Generates correct S3 key path<br>• Enforces MAX_FILE_SIZE<br>• Returns expiry time |
| **register_image.py** | • Verifies S3 object exists<br>• Creates InspectionImages row<br>• Returns imageId |
| **list_images_db.py** | • Returns images for inspection/room<br>• Signs CloudFront URLs when requested<br>• Handles missing images gracefully |
| **delete_image_db.py** | • Deletes image metadata row<br>• Returns deleted imageId |
| **delete_s3_by_db_entry.py** | • Resolves s3Key from DB<br>• Deletes S3 object<br>• Handles missing object |

### 2.2 Utility Module Tests

| Module | Test Cases |
|--------|------------|
| **save_inspection/metadata.py** | • `read_inspection_metadata()` tries both key names<br>• `update_inspection_metadata()` applies expression |
| **save_inspection/summary.py** | • `handle_get_inspection_summary()` aggregates items<br>• Returns totals and byRoom |
| **id_utils.py** | • `validate_id()` accepts valid format<br>• `validate_id()` rejects invalid prefix |
| **db.py** | • `validate_inspection_metadata()` schema validation |

---

## 3. API Integration Tests

**Location:** `src/__tests__/integration/` (frontend) and `lambda/tests/integration/` (backend)

### 3.1 Frontend → API Integration

| Test Suite | Test Cases |
|------------|------------|
| **Inspection Flow** | • Create inspection via `API.inspectionsCreate`<br>• Save items via `API.inspections`<br>• Get inspections via `API.inspections` (list_inspections)<br>• Delete inspection via `API.inspectionsDelete` |
| **Venue Flow** | • Create venue via `API.venuesCreate`<br>• Get venues via `API.venuesQuery`<br>• Update venue via `API.venuesCreate` (update_venue)<br>• Delete venue via `API.venuesCreate` (delete_venue) |
| **Image Flow** | • Get presigned upload URL via `API.signUpload`<br>• Register uploaded image via `API.registerImage`<br>• List images via `API.listImagesDb`<br>• Delete image via `API.deleteImageDb` and `API.deleteS3ByDbEntry` |
| **Dashboard Flow** | • Get dashboard metrics via `API.dashboard` |

### 3.2 Backend Integration Tests (with moto or localstack)

| Test Suite | Test Cases |
|------------|------------|
| **DynamoDB Integration** | • All tables created with correct schemas<br>• CRUD operations work across tables<br>• GSI queries work correctly<br>• Batch operations succeed |
| **S3 Integration** | • Presigned POST works<br>• Object upload/download works<br>• CloudFront signed URLs generated |
| **Cross-Lambda** | • create_inspection → save_inspection → completeness check<br>• delete_venue cascades to inspections → items → images |

---

## 4. End-to-End Tests (Playwright)

**Location:** `e2e/`

### 4.1 Critical User Journeys

| Journey | Test Steps |
|---------|------------|
| **Login Flow** | 1. Navigate to app<br>2. Enter demo credentials<br>3. Click Sign In<br>4. Verify InspectorHome displays |
| **Complete Inspection Flow** | 1. Login<br>2. Click "New Inspection"<br>3. Select venue<br>4. Confirm inspection start<br>5. Select room<br>6. Mark all items PASS<br>7. Navigate back to home<br>8. Verify inspection shows as completed |
| **Failed Inspection Flow** | 1. Login<br>2. Create inspection<br>3. Mark some items FAIL with photos<br>4. Add notes<br>5. Navigate back<br>6. Verify inspection shows as in-progress<br>7. Verify totals show fails |
| **Resume Inspection** | 1. Login with existing in-progress inspection<br>2. Click Resume<br>3. Verify previous item states restored<br>4. Complete remaining items<br>5. Verify completion |
| **Venue Management** | 1. Login<br>2. Navigate to Manage Venues<br>3. Create new venue with rooms/items<br>4. Edit venue name<br>5. Delete venue<br>6. Verify cascade (inspections deleted) |
| **Dashboard Analytics** | 1. Login<br>2. Create and complete multiple inspections<br>3. Navigate to Dashboard<br>4. Verify metrics reflect inspections<br>5. Verify charts render |
| **Photo Upload Flow** | 1. Start inspection<br>2. Select item<br>3. Add photo<br>4. Verify preview displays<br>5. Complete inspection<br>6. View history → verify photo persisted |
| **Read-Only Completed Inspection** | 1. Complete an inspection<br>2. Click to view completed inspection<br>3. Verify all inputs disabled<br>4. Verify no edit/save buttons |

### 4.2 Error Handling E2E

| Test | Steps |
|------|-------|
| **Network Failure Recovery** | • Simulate offline → verify graceful error<br>• Reconnect → verify retry works |
| **Invalid Session** | • Clear localStorage → verify redirect to login |
| **Concurrent Edit** | • Two tabs editing same inspection → verify conflict handling |

---

## 5. Visual Regression Tests

**Tool:** Playwright + Percy or Chromatic

| Page/Component | Breakpoints |
|----------------|-------------|
| Login page | Mobile (375px), Tablet (768px), Desktop (1280px) |
| InspectorHome | Mobile, Tablet, Desktop |
| InspectionForm | Mobile, Tablet |
| Dashboard | Tablet, Desktop |
| VenueForm | Mobile, Desktop |

---

## 6. Performance Tests

### 6.1 Frontend Performance

| Metric | Target | Tool |
|--------|--------|------|
| First Contentful Paint | < 1.5s | Lighthouse CI |
| Time to Interactive | < 3s | Lighthouse CI |
| Bundle size | < 500KB gzipped | webpack-bundle-analyzer |
| Image lazy loading | Verified | Lighthouse |

### 6.2 Backend Performance

| Test | Criteria |
|------|----------|
| List inspections (100 records) | < 500ms |
| Save inspection (20 items) | < 1s |
| Dashboard metrics | < 2s |
| Presigned URL generation | < 300ms |

---

## 7. Security Tests

| Category | Tests |
|----------|-------|
| **Input Validation** | • SQL injection attempts rejected<br>• XSS payloads sanitized<br>• ID format validation enforced |
| **Authorization** | • API rejects requests without auth token (when enabled)<br>• Completed inspections cannot be modified |
| **Data Protection** | • CloudFront URLs properly signed<br>• S3 bucket not publicly accessible<br>• Secrets Manager keys not exposed |

---

## 8. Test Infrastructure

### 8.1 Configuration Files Needed

```
testapp2/
├── vitest.config.ts          ✅ Exists
├── playwright.config.ts      ❌ Create
├── test/
│   ├── vitest.setup.ts       ✅ Exists
│   ├── fixtures/             ❌ Create
│   │   ├── inspection.ts     # Mock inspection data
│   │   ├── venue.ts          # Mock venue data
│   │   └── user.ts           # Mock user data
│   └── mocks/
│       ├── api.ts            # MSW handlers
│       └── handlers.ts
├── lambda/
│   ├── tests/
│   │   ├── conftest.py       # pytest fixtures
│   │   ├── test_*.py         # Unit tests
│   │   └── integration/
│   │       └── test_*.py     # Integration tests
│   └── pytest.ini            ❌ Create
└── e2e/
    ├── tests/
    │   └── *.spec.ts         # Playwright specs
    └── fixtures/
```

### 8.2 Mock Strategy

**Frontend (MSW - Mock Service Worker)**
```typescript
// test/mocks/handlers.ts
import { rest } from 'msw';
import { API } from '../../src/config/api';

export const handlers = [
  rest.post(API.inspections, (req, res, ctx) => {
    const { action } = req.body;
    if (action === 'list_inspections') {
      return res(ctx.json({ inspections: mockInspections }));
    }
    // ... other actions
  }),
  // ... other endpoints
];
```

**Backend (moto for AWS services)**
```python
# lambda/tests/conftest.py
import pytest
from moto import mock_dynamodb, mock_s3

@pytest.fixture
def aws_credentials():
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_REGION'] = 'ap-southeast-1'

@pytest.fixture
def dynamodb(aws_credentials):
    with mock_dynamodb():
        # Create tables
        yield boto3.resource('dynamodb')
```

### 8.3 CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit        # Vitest
      - run: npm run test:integration # Component integration
      
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r lambda/requirements-dev.txt
      - run: pytest lambda/tests --cov
      
  e2e-tests:
    runs-on: ubuntu-latest
    needs: [frontend-tests, backend-tests]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

---

## 9. Coverage Goals

| Layer | Target | Tool |
|-------|--------|------|
| Frontend Components | 80% | Vitest + @vitest/coverage-v8 |
| Frontend Hooks/Utils | 90% | Vitest |
| Backend Lambdas | 85% | pytest-cov |
| E2E Critical Paths | 100% | Playwright |

---

## 10. Implementation Priority

### Phase 1 (Week 1-2) - Foundation
1. ✅ Configure Vitest (done)
2. Complete remaining component unit tests (Login, InspectorHome, InspectionForm)
3. Add hook tests (useNavigation, useInspections, useVenues)
4. Add context tests (AuthContext, InspectionContext)

### Phase 2 (Week 3-4) - Backend Coverage
1. Set up pytest with moto
2. Lambda unit tests for all handlers
3. Completeness logic tests
4. Cascade delete tests

### Phase 3 (Week 5-6) - Integration
1. API integration tests with MSW
2. Backend integration tests with mocked DynamoDB/S3
3. Cross-service tests

### Phase 4 (Week 7-8) - E2E & Polish
1. Set up Playwright
2. Critical journey tests
3. Visual regression baseline
4. CI/CD pipeline integration

---

## 11. Test Commands

```bash
# Frontend
npm run test              # Run all Vitest tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run test:ui           # Vitest UI

# Backend  
cd lambda && pytest                    # All tests
cd lambda && pytest tests/ -v          # Verbose
cd lambda && pytest --cov=. --cov-report=html

# E2E
npm run test:e2e          # Headless
npm run test:e2e:ui       # With Playwright UI
npm run test:e2e:debug    # Debug mode
```

---

This comprehensive test plan ensures coverage of all application layers, from individual React components and Python Lambda handlers to full end-to-end user journeys. The phased implementation approach allows incremental progress while maintaining development velocity.