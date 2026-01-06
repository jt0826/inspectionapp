# save_inspection — Lambda package

Overview

- Purpose: a modular replacement for the previous `inspections.py` monolith. This package implements all inspection-related actions (save inspection, save item, create inspection, list, query, summary, completeness check, and delete) as individual modules and exposes a single entrypoint `lambda_function.lambda_handler`.
- Handler to configure in API / Lambda: `save_inspection.lambda_function.lambda_handler` (e.g., use this value in API Gateway / Lambda configuration for the inspections endpoint).
- Responses include a `debug` array in bodies (useful in dev to trace internal log messages).

Actions / endpoints (via POST body `action`):

- `save_inspection` — Full save (meta + items). Behavior:
  - If `inspection.items` is empty: upserts canonical metadata into `InspectionMetadata`.
  - Otherwise: upserts provided items into `InspectionItems`,            then runs `check_inspection_complete` (server-authoritative) and, if result `complete: true`, updates `InspectionMetadata` to `status = 'completed'` and sets `completedAt`.
  - Returns: { message, written, complete, inspectionData, debug }

- `create_inspection` — Create metadata (draft) record.
  - Returns: { message: 'Created', inspection_id, inspectionData, debug }

- `list_inspections` — Scan items table and return meta rows (compatibility for UI listing).
  - Returns: { inspections: [...], debug }

- `get_inspection` — Query `InspectionItems` for a given inspection_id (optional room filter).
  - Returns: { items: [...] }

- `get_inspection_summary` — Aggregate totals and `byRoom` counts for an inspection.
  - Returns: { inspection_id, totals, byRoom }

- `check_inspection_complete` — Server-side completeness check (compares actual PASS items with venue-prescribed items).
  - Returns: { complete: bool, missing?: [...], total_expected, completed_count, debug }

- `delete_inspection` — Deletes all items and metadata for an inspection (best-effort; includes scan fallback and returns a summary).
  - Returns summary object with counts and debug.

Module map

- `lambda_function.py` — dispatcher, collects debug logs, returns bodies with `debug` appended.
- `handler.py` — main save_inspection flow (previously the largest block in `inspections.py`).
- `create_inspection.py` — metadata-only create handler.
- `list_inspections.py` — listing helper.
- `get_inspection.py` — query handler for inspection items.
- `summary.py` — computes totals and byRoom breakdown.
- `completeness.py` — `check_inspection_complete` helper (reads venue definition and compares PASS items to expected items).
- `metadata.py` — robust read/update helpers for `InspectionMetadata` (handles `inspectionId` / `inspection_id` keys and reserved attribute names like `#s`).
- `utils.py` — small helpers (`_now_local_iso`, `build_response`, `dynamodb` reference).

Debugging & tracing

- This package collects debug messages via a `debug(msg)` function and appends the messages to the response as a `debug` array. Use these messages to trace where errors occurred and what internal decisions were made (e.g., completeness check results, update attempts, attribute name mappings).
- Common debug lines:
  - `lambda_function: received action=...` — dispatch entry
  - `check_inspection_complete: ...` — completeness findings
  - `update_inspection_metadata: ...` — update attempts / failures
  - `save_inspection: completeness result ...` — final decision

Troubleshooting tips

- If metadata fails to update (ValidationException referencing `#s`), confirm the handler is using `ExpressionAttributeNames` mapping `#s -> status` (this logic exists in `metadata.update_inspection_metadata`).
- Ensure the Lambda role has permissions: `dynamodb:GetItem/Query/UpdateItem/PutItem/Scan/DeleteItem`, and any S3 permissions required by delete cascades or image handlers.
- If an action returns incomplete or unexpected results, reproduce with a full POST body and include the returned `debug` array when filing an issue.

Example payload (save_inspection full save, all PASS):

```json
{
  "action": "save_inspection",
  "inspection": {
    "inspection_id": "inspection_abc123",
    "venueId": "venue_xyz",
    "inspectorName": "Alice",
    "items": [
      { "itemId": "item1", "status": "pass", "roomId": "roomA" },
      { "itemId": "item2", "status": "pass", "roomId": "roomA" }
    ]
  }
}
```

Curl example (replace URL):

```bash
curl -X POST https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections \
  -H 'Content-Type: application/json' \
  -d '{"action":"save_inspection","inspection":{...}}'
```

Migration notes

- `inspections.py` has been superseded by this package. If you plan to delete it, update your API Gateway/Lambda configuration to point the inspections API at `save_inspection.lambda_function.lambda_handler` first and test thoroughly in staging.

Tests & next steps

- Recommended: add unit tests for `completeness.check_inspection_complete`, `metadata.update_inspection_metadata` (simulate ExpressionAttributeNames), and integration tests for full save flows.

---

If you want, I can now:
- Add unit tests for the key functions, or
- Update `inspections.py` to delegate all actions to this package and then remove it, or
- Run a local test payload and show the response with debug messages.

Which would you like next?