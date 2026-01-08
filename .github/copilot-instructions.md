# Copilot Instructions for Facility Inspector

## Architecture Overview

This is a **Next.js 16 + React 19** frontend with **AWS Lambda (Python)** backend. The app follows a **server-authoritative** model where inspection completion status is determined server-side based on venue definitions.

### Key Data Flow
```
Frontend (TypeScript) → API Gateway → Lambda (Python) → DynamoDB
                                    ↘ S3 (images via presigned POST)
```

### Documentation References (Very Important. Please do not skip these and make sure to update them as needed)
- [Architecture Diagram](./architecture_diagram.md) - Visual overview of components and data flow
- [Refactor Plan](./refactor_plan.md) - Rationale and steps for recent codebase improvements
- [API info](./src/config/api.ts) - Centralized API endpoint definitions - comments are inlined
- As needed, refer to individual file comments and docstrings for implementation details.
- [VERY IMPORTANT - PLEASE READ] Before and after writing any code, please refer to the above documents to ensure alignment with architecture and conventions. If working on the refactor plan, please follow the outlined steps closely, and update which sections have been completed. If there are any significant changes to architechture, please update the architecture diagram as well. Please clarify if there are any ambiguities.

### DynamoDB Tables
- `InspectionMetadata` - inspection headers (PK: `inspectionId`)
- `InspectionItems` - per-item records (PK: `inspectionId`, SK: `roomId#itemId`)
- `InspectionImages` - image metadata (PK: `inspectionId`, SK: `roomId#itemId#imageId`)
- `VenueRooms` - venue definitions with rooms/items (PK: `venueId`)

## Project Conventions


### ID Generation
Use centralized ID generators from [src/utils/id.ts](src/utils/id.ts):
```typescript
import { generateInspectionId, generateVenueId, generateItemId, generatePhotoId } from './utils/id';
```
Format: `{prefix}_{uuid}` (e.g., `inspection_abc123def456`)

### API Configuration
All endpoints defined in [src/config/api.ts](src/config/api.ts). **Never hardcode URLs**:
```typescript
import { API } from '../config/api';
fetch(API.inspections, { method: 'POST', body: JSON.stringify({ action: 'save_inspection', ... }) });
```

### Data Normalization
Backend uses `snake_case`, frontend uses `camelCase`. Always normalize API responses using [src/utils/normalizers.ts](src/utils/normalizers.ts):
```typescript
import { normalizeInspection, normalizeVenue } from '../utils/normalizers';
const inspection = normalizeInspection(apiResponse);
```

### Type Definitions
Canonical types in [src/types/](src/types/):
- `Inspection`, `InspectionItem`, `Photo` → [src/types/inspection.ts](src/types/inspection.ts)
- `Venue`, `Room`, `RoomItem` → [src/types/venue.ts](src/types/venue.ts)

### State Management Hooks
Custom hooks extract state logic from App.tsx:
- [src/hooks/useNavigation.ts](src/hooks/useNavigation.ts) - client-side view navigation (no URL routing)
- [src/hooks/useInspections.ts](src/hooks/useInspections.ts) - inspection CRUD operations
- [src/hooks/useVenues.ts](src/hooks/useVenues.ts) - venue fetching and selection

### Lambda Action Pattern
Most Lambda endpoints use an `action` field in POST body:
```python
# Backend expects:
{ "action": "save_inspection", "inspection": {...} }
{ "action": "create_venue", "venue": {...} }
{ "action": "delete_venue", "venueId": "..." }
```

## Development Commands
```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build (outputs to ./out for static hosting)
npm run deploy   # Build + sync to S3 bucket
```

## Critical Patterns

### Server-Authoritative Completion
**Never set `status: 'completed'` client-side.** The backend auto-completes inspections when all items pass. See [lambda/save_inspection/completeness.py](lambda/save_inspection/completeness.py).

### Image Upload Flow
1. Call `API.signUpload` to get presigned POST
2. Upload to S3 using returned form fields
3. Call `API.registerImage` to create DB record
4. Images are served via CloudFront signed URLs

### Window Events (Legacy)
Some components use `window.dispatchEvent('inspectionSaved')` for cross-component refresh. Prefer React context/props for new code.

## File Organization
- `src/components/` - React components (major: `InspectionForm.tsx`, `InspectorHome.tsx`, `Dashboard.tsx`)
- `src/utils/` - API helpers, normalizers, ID generation
- `src/schemas/` - Zod-like validation schemas (see [src/schemas/inspection.ts](src/schemas/inspection.ts))
- `lambda/` - Python Lambda handlers (one file per endpoint)
- `lambda/save_inspection/` - Consolidated save logic with helper modules

## Testing Credentials (Mock Auth)
```
admin@facility.com / password
inspector@facility.com / password
dev@facility.com / dev
```
