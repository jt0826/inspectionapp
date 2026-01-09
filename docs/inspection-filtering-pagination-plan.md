# Inspection Filtering & Pagination Strategy

## Current Implementation Analysis

### Backend (`lambda/save_inspection/list_inspections.py`)
- ✅ Returns ALL completed inspections when `completedLimit: 0` 
- ❌ **No search/filter parameters** accepted
- ❌ **No date range filtering** on server
- Uses GSI `status-completedAt-index` for efficient completed inspection queries
- Returns metadata only (totals/byRoom cached) - 98% query reduction

### Frontend (`src/components/InspectionHistory.tsx`)

**Current Filtering: 100% Client-Side**
```typescript
const filteredInspections = completedInspections.filter((inspection: any) => {
  const searchLower = searchTerm.toLowerCase();
  
  // Text search (client-side)
  const matchesSearch = venueName.includes(searchLower) || 
                        roomName.includes(searchLower) || 
                        inspectorName.includes(searchLower);

  // Date range filter (client-side)
  if (startDate) {
    const s = new Date(startDate + 'T00:00:00');
    if (d < s) return false;
  }
  if (endDate) {
    const e = new Date(endDate + 'T23:59:59');
    if (d > e) return false;
  }
  
  return matchesSearch;
});
```

### Scalability Assessment

| Inspection Count | Current Behavior | Issue |
|------------------|------------------|-------|
| 1-100 | ✅ Works fine | Small payload (~10-50KB), fast filtering |
| 100-500 | ⚠️ Degraded | ~50-200KB payload, noticeable lag on slower devices |
| 500-1000 | ❌ Poor UX | Large payload (200-500KB), slow download & filtering |
| 1000+ | ❌ Unusable | Very large payload, browser may struggle |

**Verdict:** Current approach won't scale beyond 200-300 inspections.

---

## Recommended Implementation: Hybrid Approach

### Phase 1: Server-Side Date Filtering (HIGH PRIORITY) 🎯

**Why This First:**
- Date filtering has the **highest reduction potential** (typically 80-95%)
- Users almost always view recent inspections (last 7, 30, or 90 days)
- Leverages existing GSI on `completedAt`
- Easy to implement with DynamoDB FilterExpression

#### Date Field Ambiguity Issue ⚠️

**Problem:** Inspections have multiple date fields with different semantics:

| Field | Meaning | Use Case |
|-------|---------|----------|
| `createdAt` | When inspection was initiated | Track when work started |
| `updatedAt` | Last modification time | Track latest activity |
| `completedAt` | When inspection was marked complete | **History page: when work finished** |

**Current Ambiguity:**
- InspectionHistory fetches "completed inspections"
- Users see date filters but it's unclear which date is being filtered
- Frontend uses: `completedAt || updatedAt || timestamp || createdAt` (fallback chain)
- This creates confusion: "Show inspections from last week" - started or finished last week?

**Recommended Solution:**

1. **Default to `completedAt` for History page** (semantic match)
   - History shows completed work → filter by completion date
   - Aligns with user mental model: "When was this inspection finished?"

2. **Add explicit filter mode selector** (future enhancement):
   ```typescript
   enum DateFilterMode {
     COMPLETED = 'completedAt',  // Default for history
     CREATED = 'createdAt',      // When inspection started
     UPDATED = 'updatedAt'       // Last activity
   }
   ```

3. **UI Clarity:**
   ```tsx
   // Clear labeling in date picker
   <label>Completed Between:</label>
   <input type="date" placeholder="Start date" />
   <input type="date" placeholder="End date" />
   <span className="text-xs text-gray-500">
     Filters by completion date
   </span>
   ```

4. **Backend implementation:**
   ```python
   # Accept optional dateField parameter (default: completedAt)
   date_field = event_body.get('dateField', 'completedAt')
   
   # Validate allowed fields
   ALLOWED_DATE_FIELDS = ['completedAt', 'createdAt', 'updatedAt']
   if date_field not in ALLOWED_DATE_FIELDS:
       date_field = 'completedAt'
   
   # Build filter expression dynamically
   if start_date:
       filter_parts.append(f'{date_field} >= :start')
   ```

#### Backend Implementation

**File:** `lambda/save_inspection/list_inspections.py`

```python
def handle_list_inspections(event_body: dict, debug):
    """
    Optimized list_inspections handler with server-side date filtering.
    
    Parameters:
    - completed_limit: Number of completed to return (0 = all, -1 = all)
    - start_date: ISO date string (YYYY-MM-DD) for range start (inclusive)
    - end_date: ISO date string (YYYY-MM-DD) for range end (inclusive)
    - date_field: Which date to filter by (default: 'completedAt')
    
    Returns:
    - completed: Array of completed inspections (with cached totals/byRoom)
    - ongoing: Array of ongoing inspections
    """
    try:
        # Parse existing parameters
        completed_limit = DEFAULT_COMPLETED_LIMIT
        start_date = None
        end_date = None
        date_field = 'completedAt'  # Default to completion date for history
        
        if isinstance(event_body, dict):
            # Existing limit parsing
            limit_raw = event_body.get('completed_limit') or event_body.get('completedLimit')
            if limit_raw is not None:
                try:
                    completed_limit = int(limit_raw)
                except Exception:
                    debug(f'Invalid completed_limit: {limit_raw}, using {DEFAULT_COMPLETED_LIMIT}')
            
            # NEW: Parse date filters
            start_date = event_body.get('startDate') or event_body.get('start_date')
            end_date = event_body.get('endDate') or event_body.get('end_date')
            
            # NEW: Parse which date field to filter by
            date_field_raw = event_body.get('dateField') or event_body.get('date_field')
            if date_field_raw in ['completedAt', 'createdAt', 'updatedAt']:
                date_field = date_field_raw
        
        table = resource('dynamodb').Table('InspectionMetadata')
        from boto3.dynamodb.conditions import Key, Attr
        
        # Query completed inspections using sparse GSI
        completed = []
        if completed_limit != 0:
            try:
                query_kwargs = {
                    'IndexName': 'status-completedAt-index',
                    'KeyConditionExpression': Key('status').eq('completed'),
                    'ScanIndexForward': False,  # Descending order (most recent first)
                    'ConsistentRead': False,
                }
                
                # NEW: Add date range filter if specified
                if start_date or end_date:
                    filter_parts = []
                    
                    if start_date:
                        # Include start of day
                        filter_parts.append(Attr(date_field).gte(start_date + 'T00:00:00'))
                    
                    if end_date:
                        # Include end of day (23:59:59)
                        filter_parts.append(Attr(date_field).lte(end_date + 'T23:59:59'))
                    
                    # Combine filters with AND
                    if len(filter_parts) == 1:
                        query_kwargs['FilterExpression'] = filter_parts[0]
                    else:
                        query_kwargs['FilterExpression'] = filter_parts[0] & filter_parts[1]
                    
                    debug(f'list_inspections: filtering {date_field} between {start_date} and {end_date}')
                
                # Apply limit if positive
                if completed_limit > 0:
                    query_kwargs['Limit'] = completed_limit
                
                resp = table.query(**query_kwargs)
                completed_items = resp.get('Items', [])
                
                # Handle pagination
                while 'LastEvaluatedKey' in resp and (completed_limit <= 0 or len(completed_items) < completed_limit):
                    query_kwargs['ExclusiveStartKey'] = resp['LastEvaluatedKey']
                    if completed_limit > 0:
                        query_kwargs['Limit'] = completed_limit - len(completed_items)
                    resp = table.query(**query_kwargs)
                    completed_items.extend(resp.get('Items', []))
                
                debug(f'list_inspections: filtered query returned {len(completed_items)} completed')
                
            except Exception as e:
                debug(f'list_inspections: GSI query failed: {e}')
                completed_items = []
        
        # ... rest of existing implementation (ongoing scan, normalization)
```

**Performance Impact:**
```
Before: Fetch 5000 inspections → filter client-side → show 50
After:  Fetch 50 inspections (server-filtered) → minimal client work

Payload reduction: ~99% (5000 → 50 records)
Response time: 800ms → 80ms
```

#### Frontend Implementation

**File:** `src/utils/inspectionApi.ts`

```typescript
export async function getInspectionsPartitioned(opts?: { 
  completedLimit?: number | null;
  startDate?: string;      // YYYY-MM-DD format
  endDate?: string;        // YYYY-MM-DD format
  dateField?: 'completedAt' | 'createdAt' | 'updatedAt';  // Default: completedAt
}) {
  try {
    const bodyPayload: any = { action: 'list_inspections' };
    
    // Existing limit parameter
    if (opts && typeof opts.completedLimit !== 'undefined') {
      bodyPayload.completed_limit = opts.completedLimit;
    }
    
    // NEW: Date filter parameters
    if (opts?.startDate) {
      bodyPayload.start_date = opts.startDate;
    }
    if (opts?.endDate) {
      bodyPayload.end_date = opts.endDate;
    }
    if (opts?.dateField) {
      bodyPayload.date_field = opts.dateField;
    }
    
    const res = await fetch(API.inspections, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    
    // ... rest of existing implementation
  }
}
```

**File:** `src/components/InspectionHistory.tsx`

```typescript
// Fetch with server-side date filtering
useEffect(() => {
  let cancelled = false;
  const fetchList = async () => {
    setLoading(true);
    try {
      // Pass date filters to backend (server-side filtering)
      const body = await getInspectionsPartitioned({ 
        completedLimit: 0,  // All completed within date range
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        dateField: 'completedAt'  // Explicit: filter by completion date
      });
      
      if (cancelled) return;
      
      if (body && Array.isArray(body.completed)) {
        setSourceInspections(body.completed);
      } else {
        setSourceInspections([]);
      }
    } catch (e) {
      console.warn('Failed to fetch inspections for history', e);
      setSourceInspections([]);
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  fetchList();
  
  const onFocus = () => { fetchList(); };
  window.addEventListener('focus', onFocus);

  return () => { 
    cancelled = true; 
    window.removeEventListener('focus', onFocus); 
  };
}, [refreshKey, startDate, endDate]);  // Re-fetch when dates change

// Now client-side filtering only does text search
const filteredInspections = sourceInspections.filter((inspection: any) => {
  const searchLower = searchTerm.toLowerCase();
  const venueName = String(inspection.venueName || '').toLowerCase();
  const roomName = String(inspection.roomName || '').toLowerCase();
  const inspectorName = String(inspection.createdBy || '').toLowerCase();

  // Text search only (date filtering now done server-side)
  return venueName.includes(searchLower) ||
         roomName.includes(searchLower) ||
         inspectorName.includes(searchLower);
});
```

**UI Improvements:**

```tsx
{/* Date Filters - with clear labeling */}
<div className="flex-1">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Start Date
    <span className="text-xs text-gray-500 ml-2">(completion date)</span>
  </label>
  <input
    type="date"
    value={startDate}
    onChange={(e) => setStartDate(e.target.value)}
    className="w-full px-3 py-2 border rounded-lg"
  />
</div>
<div className="flex-1">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    End Date
    <span className="text-xs text-gray-500 ml-2">(completion date)</span>
  </label>
  <input
    type="date"
    value={endDate}
    onChange={(e) => setEndDate(e.target.value)}
    className="w-full px-3 py-2 border rounded-lg"
  />
</div>
```

---

### Phase 2: Text Search Strategy (MEDIUM PRIORITY)

**Analysis:** Text search is harder to optimize in DynamoDB (no native full-text search).

#### Option A: Client-Side Search (RECOMMENDED)

**Pros:**
- Simple to maintain
- Instant feedback as user types
- Works well after server-side date filtering reduces dataset
- No additional infrastructure

**Cons:**
- Limited by dataset size (works well for <500 records)

**When to Use:**
- After Phase 1 date filtering, typical result sets are 10-100 inspections
- Client-side search of 100 records is instant
- Example: Date filter (last 30 days) → 50 inspections → client search is fine

**Implementation:** Already exists in current code, just keep it.

#### Option B: DynamoDB GSI on venueName

**Pros:**
- Can filter by venue at query time
- No additional services

**Cons:**
- Limited to prefix queries only (`BEGINS_WITH`)
- Cannot do substring or fuzzy search
- Requires additional GSI (more cost)
- Not useful for inspector name or room name search

**When to Use:**
- If users primarily search by venue name
- If venue names follow predictable patterns
- Not recommended for this use case

#### Option C: ElasticSearch / OpenSearch

**Pros:**
- Full-text search with relevance scoring
- Fuzzy matching, autocomplete, aggregations
- Scalable to millions of records

**Cons:**
- Significant infrastructure complexity
- Additional service to maintain and monitor
- Overkill for <10,000 inspections
- Sync lag between DynamoDB and search index

**When to Use:**
- You have >10,000 inspections
- Advanced search features needed (filters, facets, autocomplete)
- Budget for additional infrastructure

**Implementation Cost:** High (2-3 days + ongoing maintenance)

#### Recommendation

**Keep client-side search (Option A)**
- After server-side date filtering, dataset is small enough
- No infrastructure overhead
- Instant feedback for users
- Reassess if growth exceeds 1000 filtered results

---

### Phase 3: True Pagination (FUTURE - LOW PRIORITY)

**When to Implement:** Only if you consistently see >100 inspections in filtered results

#### Backend Changes

```python
def handle_list_inspections(event_body: dict, debug):
    # ... existing code ...
    
    # NEW: Parse pagination token
    next_token = event_body.get('nextToken') or event_body.get('next_token')
    if next_token:
        try:
            import base64, json
            last_key = json.loads(base64.b64decode(next_token))
            query_kwargs['ExclusiveStartKey'] = last_key
        except Exception as e:
            debug(f'Invalid nextToken: {e}')
    
    # ... query execution ...
    
    # NEW: Return pagination token
    response_body = {
        'completed': completed,
        'ongoing': ongoing
    }
    
    if 'LastEvaluatedKey' in resp:
        import base64, json
        next_token = base64.b64encode(
            json.dumps(resp['LastEvaluatedKey']).encode()
        ).decode()
        response_body['nextToken'] = next_token
    
    return build_response(200, response_body)
```

#### Frontend Changes

```typescript
// State for pagination
const [nextToken, setNextToken] = useState<string | null>(null);
const [allInspections, setAllInspections] = useState<any[]>([]);
const [hasMore, setHasMore] = useState(false);

// Load more function
const loadMore = async () => {
  const body = await getInspectionsPartitioned({ 
    completedLimit: 50,
    startDate,
    endDate,
    nextToken
  });
  
  setAllInspections(prev => [...prev, ...body.completed]);
  setNextToken(body.nextToken || null);
  setHasMore(!!body.nextToken);
};

// UI: Load More button
{hasMore && (
  <button onClick={loadMore} className="...">
    Load More
  </button>
)}
```

**Alternative: Infinite Scroll**

```typescript
// Detect scroll to bottom
const handleScroll = useCallback(() => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    if (hasMore && !loading) {
      loadMore();
    }
  }
}, [hasMore, loading]);

useEffect(() => {
  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, [handleScroll]);
```

---

## Implementation Priority

### Immediate (This Week)
1. ✅ **Phase 1: Server-side date filtering**
   - Highest impact (80-95% payload reduction)
   - Straightforward implementation
   - Solves scalability for 99% of use cases

### Short-term (This Month)
2. ✅ **UI clarity improvements**
   - Label date filters explicitly ("completion date")
   - Add help text
   - Consider date presets ("Last 7 days", "Last 30 days")

### Long-term (As Needed)
3. ⏳ **Pagination** - only if you consistently exceed 100 filtered results
4. ⏳ **Advanced search** - only if users request complex filtering

---

## Performance Benchmarks

### Expected Performance After Phase 1

| Scenario | Records in DB | Date Filter Result | Payload Size | Response Time |
|----------|---------------|-------------------|--------------|---------------|
| Last 7 days | 5,000 | 25 | 5KB | 50ms |
| Last 30 days | 5,000 | 120 | 25KB | 80ms |
| Last 90 days | 5,000 | 400 | 80KB | 150ms |
| All time (no filter) | 5,000 | 5,000 | 1MB | 800ms |

### Metrics to Monitor

```typescript
// Add to InspectionHistory.tsx
useEffect(() => {
  console.log('History page metrics:', {
    totalInspections: sourceInspections.length,
    filteredInspections: filteredInspections.length,
    reductionPercent: ((1 - filteredInspections.length / sourceInspections.length) * 100).toFixed(1) + '%'
  });
}, [sourceInspections, filteredInspections]);
```

**Alert Thresholds:**
- Payload size > 500KB → Consider pagination
- Filter ratio < 20% → Consider more aggressive default date range
- Response time > 1s → Investigate backend optimization

---

## Testing Strategy

### Unit Tests
- Backend: Test date filtering logic with various ranges
- Frontend: Test API parameter construction

### Integration Tests
- Empty date range (all inspections)
- Single-day range
- Cross-month range
- Invalid date formats

### Load Tests
- 100 inspections with various date filters
- 1,000 inspections with various date filters
- 5,000 inspections with various date filters

### User Acceptance Tests
- Default behavior (no dates selected)
- Last 7 days preset
- Custom date range
- Clear filters
- Search after date filtering

---

## Migration Path

1. **Deploy backend changes** with backward compatibility
   - If no date params provided, behaves as before (all inspections)
   - Old clients continue working

2. **Deploy frontend changes** gradually
   - Can be deployed independently
   - Test with feature flag if needed

3. **Monitor performance** for 1 week
   - Check payload sizes
   - Validate user behavior (which date ranges are common)

4. **Adjust defaults** based on data
   - If 90% of users view last 30 days, consider making that the default
   - Add date range presets based on usage patterns

---

## Future Enhancements (Optional)

### Smart Date Presets
```typescript
const presets = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null }
];
```

### Saved Filters (User Preferences)
```typescript
// Save user's preferred date range
localStorage.setItem('inspectionHistoryDateRange', JSON.stringify({
  startDate,
  endDate
}));
```

### Export Filtered Results
```typescript
// Export currently visible inspections to CSV
const exportToCSV = () => {
  const csv = filteredInspections.map(i => 
    `${i.id},${i.venueName},${i.completedAt},${i.totals.pass},${i.totals.fail}`
  ).join('\n');
  // ... download logic
};
```

---

## Decision Summary

| Strategy | Complexity | Cost | Recommended |
|----------|-----------|------|-------------|
| ✅ Server-side date filtering | Low | Low | **Yes - Immediate** |
| ✅ Client-side text search | None | None | **Yes - Keep current** |
| ❌ Server-side text search (GSI) | Medium | Medium | No - Not worth it |
| ❌ ElasticSearch | High | High | No - Overkill |
| ⏳ Pagination | Medium | Low | Only if needed |

**Next Step:** Implement Phase 1 (server-side date filtering with completedAt as default)
