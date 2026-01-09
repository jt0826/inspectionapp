# Role-Based Access Control (RBAC) Implementation Plan

**Status:** 📋 Planned (Not Started)  
**Priority:** Medium (Post-MVP enhancement)  
**Estimated Effort:** 2-4 hours (Quick) or 1-2 days (Secure)  
**Date Created:** 2026-01-09

---

## 🎯 Objectives

Implement granular permissions system to control what users can do based on their role:

1. **Developer/Admin privileges:**
   - Edit completed inspections (bypass immutability)
   - Delete completed inspections
   - Edit venue definitions (rooms, items)
   - Delete venues
   - Access audit logs

2. **Inspector privileges:**
   - Create and edit ongoing inspections only
   - Cannot modify completed inspections
   - Cannot edit venue definitions (read-only)
   - Cannot delete any data

3. **Future extensibility:**
   - Manager role (approve completions, view reports)
   - Auditor role (read-only everything, export data)
   - Custom permissions per organization

---

## 🔍 Current State Analysis

### Authentication System
- **Location:** `src/contexts/AuthContext.tsx`
- **Type:** Mock authentication (localStorage-based)
- **Roles defined:** "Senior Inspector", "Inspector", "Developer"
- **Security:** None (client-side only, easily spoofed)

### Current Protection Mechanisms
- **Completed inspection immutability:** `lambda/save_inspection/handler.py` line 20-22
  - Hard-coded 403 block for all users
  - No role checking
  - No override mechanism

### What's Missing
- ❌ No role information passed from frontend to backend
- ❌ No backend role validation
- ❌ No permissions matrix
- ❌ No audit logging for privileged actions
- ❌ No frontend UI conditional rendering based on permissions

---

## 📋 Implementation Options

### Option A: Quick & Simple (Client-Side Headers)

**Timeline:** 30-60 minutes  
**Security Level:** Low (development/internal use only)  
**Use Case:** You're the only user, need quick developer tools

#### How It Works
1. Frontend reads role from `AuthContext`
2. Adds `X-User-Role` header to all API requests
3. Backend checks header and bypasses protections for "Developer"/"Admin"
4. Frontend shows/hides UI elements based on role

#### Pros
- ✅ Fast implementation
- ✅ Works immediately
- ✅ Easy to test and iterate
- ✅ No infrastructure changes needed

#### Cons
- ❌ **Not secure** - anyone can fake the header in browser DevTools
- ❌ No real authentication
- ❌ Not production-ready for multi-user scenarios

#### Implementation Steps

1. **Create auth utility** (`src/utils/auth.ts`):
   ```typescript
   export function getUserRole(): string | null;
   export function isDeveloper(): boolean;
   export function canEditCompletedInspections(): boolean;
   export function canEditVenues(): boolean;
   export function canDeleteData(): boolean;
   ```

2. **Update API calls** (`src/utils/inspectionApi.ts`, `venueApi.ts`):
   - Add `X-User-Role` header to fetch requests
   - Add `X-User-Email` header for audit trail

3. **Update Lambda handlers**:
   - `lambda/save_inspection/handler.py`: Check role before 403
   - `lambda/delete_inspection.py`: Check role before allowing delete
   - `lambda/create_venue.py`: Check role before allowing venue edits

4. **Update frontend components**:
   - `InspectionCard.tsx`: Show edit/delete for completed if developer
   - `VenueForm.tsx`: Disable fields if not developer
   - Add visual indicators (badges, warnings) for privileged actions

---

### Option B: Secure JWT Implementation

**Timeline:** 4-8 hours  
**Security Level:** High (production-ready)  
**Use Case:** Multiple users, real authentication needed

#### How It Works
1. User logs in → Backend issues JWT with role claims
2. Frontend stores JWT in httpOnly cookie or localStorage
3. All API requests include `Authorization: Bearer <token>` header
4. Backend validates JWT signature and extracts role claims
5. Backend enforces permissions based on verified role

#### Architecture
```
┌─────────────┐                  ┌──────────────┐
│   Frontend  │─── Login ──────→ │  Auth Lambda │
│             │                  │   (Cognito)  │
└─────────────┘                  └──────────────┘
      │                                  │
      │                                  ▼
      │                          ┌──────────────┐
      │                          │ Generate JWT │
      │                          │ w/ role claim│
      │                          └──────────────┘
      │                                  │
      │◄─────── JWT Token ───────────────┘
      │
      │
      ▼
┌─────────────┐
│ API Request │
│ + Bearer    │───────────────→  Lambda validates JWT
│   Token     │                  Extracts role from claims
└─────────────┘                  Enforces permissions
```

#### Pros
- ✅ **Production-secure** - cryptographically signed tokens
- ✅ Proper authentication
- ✅ Industry standard (OAuth 2.0 / OpenID Connect)
- ✅ Scalable to many users
- ✅ Built-in expiration and refresh

#### Cons
- ⏱️ More setup time (JWT library, Cognito/Auth0 integration)
- 💰 May require paid auth service (Cognito, Auth0)
- 🔧 More complex debugging
- 📚 Steeper learning curve

#### Implementation Steps

1. **Choose auth provider:**
   - AWS Cognito (recommended for AWS stack)
   - Auth0 (easier setup, better DX)
   - Self-hosted (Keycloak, OAuth server)

2. **Backend setup:**
   - Install JWT validation library: `pip install PyJWT cryptography`
   - Create auth middleware to verify tokens
   - Extract role from JWT claims (`user.role`, `custom:permissions`)

3. **Frontend setup:**
   - Replace mock auth with real auth provider SDK
   - Store JWT tokens securely
   - Refresh tokens before expiration

4. **Lambda authorizer:**
   - Create custom Lambda authorizer for API Gateway
   - Validate JWT on every request
   - Return IAM policy based on role

5. **DynamoDB permissions table** (optional):
   - Store fine-grained permissions per user/role
   - Check permissions in Lambda before operations

---

### Option C: Hybrid Approach (Recommended Long-term)

**Timeline:** 2-3 hours  
**Security Level:** Medium-High  
**Use Case:** Start simple, upgrade to secure incrementally

#### Phase 1: Client-Side Headers (Week 1)
- Implement Option A for immediate developer tools
- Document security limitations
- Use only internally

#### Phase 2: Backend Validation (Week 2-3)
- Add simple API key validation
- Store developer API key in Lambda environment variables
- Require `X-API-Key` header for privileged operations

#### Phase 3: JWT Migration (Month 2)
- Integrate Cognito or Auth0
- Migrate existing mock users to real auth
- Replace API keys with JWT tokens

---

## 🎨 Permissions Matrix

Define what each role can do:

| Action | Inspector | Senior Inspector | Developer | Admin | Auditor |
|--------|-----------|------------------|-----------|-------|---------|
| **Inspections** |
| Create inspection | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit ongoing inspection | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit completed inspection | ❌ | ❌ | ✅ | ✅ | ❌ |
| Delete ongoing inspection | ❌ | ✅ | ✅ | ✅ | ❌ |
| Delete completed inspection | ❌ | ❌ | ✅ | ✅ | ❌ |
| View all inspections | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Venues** |
| View venues | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create venue | ❌ | ✅ | ✅ | ✅ | ❌ |
| Edit venue metadata | ❌ | ✅ | ✅ | ✅ | ❌ |
| Edit venue rooms/items | ❌ | ❌ | ✅ | ✅ | ❌ |
| Delete venue | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Images** |
| Upload images | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete own images | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete others' images | ❌ | ✅ | ✅ | ✅ | ❌ |
| **System** |
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| View audit logs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Export data | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 🔧 Technical Implementation Details

### 1. Frontend Permission Checks

**Create centralized permissions module:**

```typescript
// src/utils/permissions.ts

export type Permission = 
  | 'inspection:create'
  | 'inspection:edit:ongoing'
  | 'inspection:edit:completed'
  | 'inspection:delete:ongoing'
  | 'inspection:delete:completed'
  | 'venue:create'
  | 'venue:edit:metadata'
  | 'venue:edit:structure'
  | 'venue:delete'
  | 'image:delete:own'
  | 'image:delete:any'
  | 'audit:view';

export type Role = 'Inspector' | 'Senior Inspector' | 'Developer' | 'Admin' | 'Auditor';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  'Inspector': [
    'inspection:create',
    'inspection:edit:ongoing',
    'image:delete:own',
  ],
  'Senior Inspector': [
    'inspection:create',
    'inspection:edit:ongoing',
    'inspection:delete:ongoing',
    'venue:create',
    'venue:edit:metadata',
    'image:delete:any',
  ],
  'Developer': [
    'inspection:create',
    'inspection:edit:ongoing',
    'inspection:edit:completed',
    'inspection:delete:ongoing',
    'inspection:delete:completed',
    'venue:create',
    'venue:edit:metadata',
    'venue:edit:structure',
    'venue:delete',
    'image:delete:any',
    'audit:view',
  ],
  'Admin': [/* all permissions */],
  'Auditor': ['audit:view'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

// Convenience helpers
export function canEditCompletedInspection(role: Role): boolean {
  return hasPermission(role, 'inspection:edit:completed');
}

export function canEditVenueStructure(role: Role): boolean {
  return hasPermission(role, 'venue:edit:structure');
}
```

**Usage in components:**

```typescript
import { useAuth } from '../contexts/AuthContext';
import { canEditCompletedInspection } from '../utils/permissions';

function InspectionCard({ inspection }) {
  const { user } = useAuth();
  const canEdit = inspection.status === 'completed' 
    ? canEditCompletedInspection(user.role)
    : true;

  return (
    <div>
      {canEdit && <button onClick={handleEdit}>Edit</button>}
      {/* ... */}
    </div>
  );
}
```

---

### 2. Backend Permission Enforcement

**Update Lambda handlers to check roles:**

```python
# lambda/save_inspection/handler.py

PRIVILEGED_ROLES = ['Developer', 'Admin']

def handle_save_inspection(event_body: dict, debug, user_role: str = None):
    ins = event_body.get('inspection') or event_body
    inspection_id = ins.get('inspection_id') or ins.get('id')
    
    # ... existing code ...
    
    # Server-side protection: prevent modification of completed inspections
    # UNLESS user has privileged role
    k, existing_meta = read_inspection_metadata(inspection_id)
    if existing_meta:
        existing_status = (existing_meta.get('status') or '').lower()
        has_completed_at = existing_meta.get('completedAt') or existing_meta.get('completed_at')
        
        if existing_status == 'completed' or has_completed_at:
            # Check if user has override permission
            if user_role not in PRIVILEGED_ROLES:
                debug(f'save_inspection: rejected attempt to modify completed inspection={inspection_id} by role={user_role}')
                return build_response(403, {
                    'message': 'Cannot modify completed inspection',
                    'inspection_id': inspection_id,
                    'hint': 'Only Developers/Admins can edit completed inspections'
                })
            else:
                debug(f'save_inspection: OVERRIDE - allowing privileged role={user_role} to modify completed inspection={inspection_id}')
                # Log to audit trail (optional)
                # audit_log('inspection_edit_override', user_role, inspection_id)
    
    # ... rest of existing code ...
```

**Extract role from headers:**

```python
# lambda/save_inspection/lambda_function.py

def lambda_handler(event, context):
    debug_messages = []
    
    try:
        # Extract user role from headers (if present)
        headers = event.get('headers') or {}
        user_role = headers.get('X-User-Role') or headers.get('x-user-role')
        user_email = headers.get('X-User-Email') or headers.get('x-user-email')
        
        if user_role:
            debug_messages.append(f'lambda_function: authenticated as role={user_role}, email={user_email}')
        
        # Parse body
        body = event.get('body')
        if isinstance(body, str):
            body = json.loads(body)
        
        action = body.get('action')
        
        # Pass user_role to handlers
        if action == 'save_inspection':
            result = handle_save_inspection(body, debug_messages.append, user_role=user_role)
        # ... other actions ...
        
    except Exception as e:
        debug_messages.append(f'lambda_function: error={str(e)}')
        return build_response(500, {'message': 'Internal server error'})
```

---

### 3. API Client Updates

**Add role header to all requests:**

```typescript
// src/utils/apiClient.ts (new utility)

import { getUserRole, getUserEmail } from './auth';

export async function apiRequest(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  const role = getUserRole();
  const email = getUserEmail();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  
  // Add role headers if authenticated
  if (role) {
    headers['X-User-Role'] = role;
  }
  if (email) {
    headers['X-User-Email'] = email;
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}
```

**Update existing API calls:**

```typescript
// src/utils/inspectionApi.ts

import { apiRequest } from './apiClient';

export async function saveInspection(inspection: Inspection) {
  const res = await apiRequest(API.inspections, {
    method: 'POST',
    body: JSON.stringify({
      action: 'save_inspection',
      inspection,
    }),
  });
  
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('You do not have permission to edit completed inspections');
    }
    throw new Error('Failed to save inspection');
  }
  
  return res.json();
}
```

---

## 🎨 UI/UX Considerations

### Visual Indicators for Privileged Actions

1. **Developer Badge:**
   ```tsx
   {user.role === 'Developer' && (
     <span className="badge badge-warning">
       ⚙️ Developer Mode
     </span>
   )}
   ```

2. **Confirmation Modals:**
   ```tsx
   function EditCompletedInspectionModal() {
     return (
       <Modal>
         <h2>⚠️ Edit Completed Inspection</h2>
         <p>
           You are about to edit a completed inspection. This action will be logged.
         </p>
         <input placeholder="Reason for edit (optional)" />
         <button>Confirm Edit</button>
       </Modal>
     );
   }
   ```

3. **Disabled State with Tooltip:**
   ```tsx
   <button 
     disabled={!canEdit}
     title={!canEdit ? "Only developers can edit completed inspections" : ""}
   >
     Edit
   </button>
   ```

4. **Audit Trail Display:**
   - Show "Last edited by Developer on 2026-01-09" for overridden records
   - Add "View Edit History" link

---

## 🔐 Security Considerations

### Option A (Headers) Security Notes

**Vulnerabilities:**
- Headers can be spoofed using browser DevTools or curl
- No cryptographic verification
- No session management

**Mitigation:**
- Use **ONLY in internal/development environments**
- Never expose to public internet
- Add IP whitelist for developer actions
- Require VPN for admin operations

**Example Attack:**
```bash
# Anyone can fake being a developer
curl -X POST https://your-api.com/inspections \
  -H "X-User-Role: Developer" \
  -d '{"action":"save_inspection", ...}'
```

### Option B (JWT) Security Notes

**Best Practices:**
- Store JWT in httpOnly cookies (prevents XSS attacks)
- Use short expiration (15 min) with refresh tokens
- Validate JWT signature on EVERY request
- Check token revocation list for logout
- Use HTTPS only

---

## 📊 Audit Logging

Track all privileged actions for compliance and debugging:

### Audit Log Schema (DynamoDB)

```typescript
interface AuditLog {
  logId: string;              // audit_log_<uuid>
  timestamp: string;          // ISO 8601
  userId: string;             // user_1
  userEmail: string;          // dev@facility.com
  userRole: string;           // Developer
  action: string;             // edit_completed_inspection
  resourceType: string;       // inspection
  resourceId: string;         // inspection_abc123
  reason?: string;            // "Correcting data entry error"
  metadata: {
    previousStatus?: string;
    newStatus?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}
```

### Lambda Audit Helper

```python
# lambda/utils/audit.py

import boto3
from datetime import datetime
import uuid

dynamodb = boto3.resource('dynamodb')
audit_table = dynamodb.Table('AuditLogs')

def log_audit(
    user_email: str,
    user_role: str,
    action: str,
    resource_type: str,
    resource_id: str,
    reason: str = None,
    metadata: dict = None
):
    """Log a privileged action to audit trail."""
    log_entry = {
        'logId': f'audit_log_{uuid.uuid4().hex}',
        'timestamp': datetime.utcnow().isoformat(),
        'userEmail': user_email,
        'userRole': user_role,
        'action': action,
        'resourceType': resource_type,
        'resourceId': resource_id,
    }
    
    if reason:
        log_entry['reason'] = reason
    if metadata:
        log_entry['metadata'] = metadata
    
    audit_table.put_item(Item=log_entry)
    
    return log_entry
```

### Usage in Lambda

```python
from utils.audit import log_audit

if user_role in PRIVILEGED_ROLES and existing_status == 'completed':
    # Log the override
    log_audit(
        user_email=user_email,
        user_role=user_role,
        action='edit_completed_inspection',
        resource_type='inspection',
        resource_id=inspection_id,
        reason=ins.get('editReason'),
        metadata={
            'previousStatus': existing_status,
            'itemsModified': len(items)
        }
    )
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// src/utils/__tests__/permissions.test.ts

describe('permissions', () => {
  it('allows Developer to edit completed inspections', () => {
    expect(canEditCompletedInspection('Developer')).toBe(true);
  });
  
  it('blocks Inspector from editing completed inspections', () => {
    expect(canEditCompletedInspection('Inspector')).toBe(false);
  });
  
  it('allows Developer to edit venue structure', () => {
    expect(canEditVenueStructure('Developer')).toBe(true);
  });
  
  it('blocks Senior Inspector from editing venue structure', () => {
    expect(canEditVenueStructure('Senior Inspector')).toBe(false);
  });
});
```

### Integration Tests

```python
# lambda/tests/test_rbac.py

def test_developer_can_edit_completed_inspection():
    """Developer role should bypass completed inspection protection."""
    event = {
        'headers': {
            'X-User-Role': 'Developer',
            'X-User-Email': 'dev@facility.com'
        },
        'body': json.dumps({
            'action': 'save_inspection',
            'inspection': {
                'id': 'completed_inspection_123',
                'items': [...]
            }
        })
    }
    
    response = lambda_handler(event, None)
    assert response['statusCode'] == 200

def test_inspector_cannot_edit_completed_inspection():
    """Inspector role should be blocked from editing completed inspection."""
    event = {
        'headers': {
            'X-User-Role': 'Inspector',
            'X-User-Email': 'inspector@facility.com'
        },
        'body': json.dumps({
            'action': 'save_inspection',
            'inspection': {
                'id': 'completed_inspection_123',
                'items': [...]
            }
        })
    }
    
    response = lambda_handler(event, None)
    assert response['statusCode'] == 403
    assert 'Cannot modify completed inspection' in response['body']
```

---

## 📅 Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Create permissions utility (`src/utils/permissions.ts`)
- [ ] Create auth utility (`src/utils/auth.ts`)
- [ ] Create API client wrapper (`src/utils/apiClient.ts`)
- [ ] Update API calls to include role headers
- [ ] Document permissions matrix

### Phase 2: Backend Enforcement (Week 2)
- [ ] Update `handler.py` to check roles
- [ ] Update `delete_inspection.py` to check roles
- [ ] Update venue Lambda functions to check roles
- [ ] Add audit logging utility
- [ ] Create AuditLogs DynamoDB table

### Phase 3: Frontend UI (Week 3)
- [ ] Conditionally render edit/delete buttons based on permissions
- [ ] Add developer badge indicator
- [ ] Add confirmation modals for privileged actions
- [ ] Add tooltips for disabled actions
- [ ] Show edit history in inspection details

### Phase 4: Testing & Documentation (Week 4)
- [ ] Write unit tests for permissions
- [ ] Write integration tests for RBAC
- [ ] Test all permission combinations
- [ ] Update user documentation
- [ ] Create admin guide for managing roles

### Phase 5: Security Upgrade (Month 2 - Optional)
- [ ] Integrate AWS Cognito or Auth0
- [ ] Replace mock auth with real authentication
- [ ] Migrate to JWT tokens
- [ ] Add Lambda authorizer
- [ ] Audit security with penetration testing

---

## 🚨 Migration Path (From Current → Full RBAC)

### Step 1: Preserve Existing Behavior
Before implementing RBAC, ensure existing functionality works:
- All inspections currently follow "block completed" rule
- No breaking changes for existing users

### Step 2: Add Role Headers (Non-Breaking)
- Add headers to API calls
- Backend ignores headers if not present (backward compatible)
- Developer mode is opt-in

### Step 3: Gradual Rollout
1. Enable for "Developer" role only
2. Test thoroughly in dev environment
3. Add "Senior Inspector" permissions
4. Add "Inspector" permissions (should match current behavior)

### Step 4: Deprecate Old Behavior
- Once RBAC is stable, remove hard-coded blocks
- All authorization flows through permission checks

---

## 📖 Related Documentation

- [Architecture Diagram](../architecture_diagram.md) - Update with auth flow
- [Refactor Plan](../refactor_plan.md) - Add RBAC as Phase 8
- [API Documentation](../lambda/api_info.md) - Document role headers
- [AuthContext](../src/contexts/AuthContext.tsx) - Current auth implementation

---

## ❓ Open Questions

1. **Do we need organization-level permissions?**
   - Multi-tenant support
   - Each org has different role definitions

2. **Should we add IP-based restrictions?**
   - Only allow developer actions from specific IPs
   - Use AWS WAF or Lambda environment checks

3. **Do we need time-based permissions?**
   - "Can only edit within 24 hours of completion"
   - Emergency override with approval

4. **Should roles be hierarchical?**
   - Admin inherits all Developer permissions
   - Developer inherits Senior Inspector permissions

5. **Do we need per-inspection permissions?**
   - "Locked by inspector until review complete"
   - "Only creator can edit"

---

## 🎯 Success Criteria

**Must Have:**
- ✅ Developer can edit/delete completed inspections
- ✅ Inspector cannot edit completed inspections (current behavior preserved)
- ✅ Frontend shows/hides UI based on permissions
- ✅ Backend enforces permissions (no bypass via API)
- ✅ No breaking changes to existing functionality

**Nice to Have:**
- ✅ Audit logging for all privileged actions
- ✅ Visual indicators for developer mode
- ✅ Confirmation modals for destructive actions
- ✅ Comprehensive test coverage

**Future:**
- 🔄 JWT-based authentication
- 🔄 Multi-tenant support
- 🔄 Granular per-resource permissions
- 🔄 Admin UI for role management

---

**Next Steps:**
1. Review this plan and decide on Option A vs B
2. Prioritize which permissions to implement first
3. Create feature branch: `feature/rbac-implementation`
4. Start with Phase 1 (Foundation) when ready
