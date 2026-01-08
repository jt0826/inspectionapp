import { API } from '../config/api';

export async function getInspectionSummary(inspectionId: string) {
  if (!inspectionId) return null;
  // Consolidated inspections query endpoint — expect JSON response with body containing summary

  try {
    const res = await fetch(API.inspectionsQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_inspection_summary', inspection_id: inspectionId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('getInspectionSummary non-ok', res.status, text, API.inspectionsQuery);
      return null;
    }

    // Parse and return the canonical body payload
    const data = await res.json();
    const body = data?.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    // Validate/normalize server response into canonical camelCase Inspection shape
    try {
      const { parseInspection } = await import('../schemas/inspection');
      const parsed = parseInspection(body);
      return parsed || body || null;
    } catch (e) {
      console.warn('getInspectionSummary validation failed', e);
      return body || null;
    }
  } catch (e) {
    console.warn('getInspectionSummary failed', e);
    return null;
  }
}



/**
 * Deprecated: do NOT call `checkInspectionComplete` from the client to determine or assert
 * that an inspection is complete. Completion is server-authoritative and is set only by
 * the `save_inspection` handler as part of a full save operation. This client helper is now
 * a no-op and will return null. Keep the server-side helper in the Lambda packages where
 * it may still be used internally for diagnostic purposes.
 */
export async function checkInspectionComplete(inspectionId: string, venueId: string) {
  console.warn('checkInspectionComplete() is deprecated on the client. Do not rely on client-side completeness checks.');
  return null;
}

export async function deleteInspection(inspectionId: string, opts?: { cascade?: boolean }, token?: string) {
  if (!inspectionId) return null;
  // Use the consolidated inspections-delete endpoint
  try {
    console.log('[API] deleteInspection ->', API.inspectionsDelete, inspectionId, 'cascade=', !!opts?.cascade);
    const res = await fetch(API.inspectionsDelete, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: 'delete_inspection', inspection_id: inspectionId, cascade: !!opts?.cascade }),
    });
    const text = await res.text().catch(() => '');
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

    // Detect if we've hit the wrong handler which returns the inspections list
    if (data && data.inspections) {
      console.warn('deleteInspection hit inspections-list handler (wrong action endpoint)', data);
      // Do not attempt client-side cascading here — return error so server-side failure is surfaced
      return { ok: false, status: res.status, data, reason: 'wrong-handler' };
    }

    if (!res.ok) {
      console.warn('deleteInspection non-ok', res.status, data, API.inspectionsDelete);
      return { ok: false, status: res.status, data };
    }

    // Parse body summary if included
    const parsed = data && data.summary ? data.summary : (data && data.body && data.body.summary ? data.body.summary : null);

    // NOTE: Historically this helper dispatched a global `inspectionSaved` DOM event so
    // that unrelated UI components could refresh themselves. That pattern has been retired
    // in favor of the `InspectionContext` refresh mechanism.
    // - This function now returns the HTTP result; callers (components or hooks) are
    //   responsible for calling `triggerRefresh()` from `useInspectionContext()` after
    //   they verify the delete succeeded. This separation keeps the API layer pure and
    //   avoids implicit global side effects that are hard to test.
    // (No-op here.)

    return { ok: true, status: res.status, data, summary: parsed };
  } catch (e) {
    console.warn('deleteInspection failed', e);
    return { ok: false, error: e };
  }
}

// --- Image helpers for cascading deletes ---
export async function listImagesForInspection(inspectionId: string) {
  if (!inspectionId) return [];
  try {
    // First, fetch inspection items to derive room ids
    const items = await getInspectionItems(inspectionId);
    if (!items || !Array.isArray(items) || items.length === 0) return [];

    const roomIds = Array.from(new Set(items.map((it: any) => String(it.roomId || it.room_id || it.room || '')).filter(Boolean)));
    if (roomIds.length === 0) return [];

    // Query list-images-db for each room in parallel and aggregate
    const fetches = roomIds.map(async (roomId) => {
      try {
        const resp = await fetch(API.listImagesDb, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionId, roomId, signed: true }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          console.warn('listImagesForInspection non-ok for room', roomId, resp.status, text);
          return [];
        }
        const data = await resp.json();
        try {
          const { parseInspectionImagesArray } = await import('../schemas/db');
          const parsed = parseInspectionImagesArray(data.images || []);
          return parsed || (data.images || []);
        } catch (e) {
          console.warn('listImagesForInspection validation failed', e);
          return data.images || [];
        }
      } catch (e) {
        console.warn('listImagesForInspection query failed for room', roomId, e);
        return [];
      }
    });

    const results = await Promise.all(fetches);
    const all = results.flat();

    // Deduplicate images by imageId or s3Key
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const img of all) {
      const key = String(img.imageId || img.s3Key || JSON.stringify(img));
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(img);
      }
    }

    return deduped;
  } catch (e) {
    console.warn('listImagesForInspection failed', e);
    return [];
  }
}

export async function deleteImageByDbEntry({ inspectionId, roomId, itemId, imageId, s3Key }: { inspectionId: string, roomId?: string, itemId?: string, imageId?: string, s3Key?: string }) {
  try {
    // Attempt S3 deletion via DB-authoritative endpoint
    const deleteS3Resp = await fetch(API.deleteS3ByDbEntry, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId, roomId, itemId, imageId, s3Key }),
    });
    if (!deleteS3Resp.ok) {
      const txt = await deleteS3Resp.text().catch(() => '');
      console.warn('deleteImageByDbEntry: delete-s3 failed', deleteS3Resp.status, txt);
      // Continue to attempt metadata delete even if S3 delete fails
    }

    // Now delete metadata record
    const delDbResp = await fetch(API.deleteImageDb, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId, roomId, itemId, imageId, s3Key }),
    });
    if (!delDbResp.ok) {
      const txt = await delDbResp.text().catch(() => '');
      console.warn('deleteImageByDbEntry: delete-image-db failed', delDbResp.status, txt);
      return { ok: false, reason: 'db-delete-failed' };
    }

    return { ok: true };
  } catch (e) {
    console.warn('deleteImageByDbEntry failed', e);
    return { ok: false, error: e };
  }
}



export async function getInspections() {
  try {
    const res = await fetch(API.inspectionsQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_inspections' }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('getInspections non-ok', res.status, txt, API.inspectionsQuery);
      return [];
    }

    const data = await res.json();
    const body = data?.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;

    // Support both legacy { inspections: [...] } and partitioned { ongoing: [...], completed: [...] }
    let items: any[] = [];
    if (Array.isArray(body?.inspections)) {
      items = body.inspections;
    } else if (Array.isArray(body?.ongoing) || Array.isArray(body?.completed)) {
      items = ((body.ongoing || []) as any[]).concat((body.completed || []) as any[]);
    }

    try {
      const { parseInspectionsArray } = await import('../schemas/inspection');
      const parsed = parseInspectionsArray(items);
      return parsed || items;
    } catch (e) {
      console.warn('getInspections: parsing inspections failed', e);
      return items;
    }
  } catch (e) {
    console.warn('getInspections failed', e);
    return [];
  }
}

// New helper: return the parsed body from list_inspections including any server-provided partitions like 'completed'/'ongoing'
export async function getInspectionsPartitioned(opts?: { completedLimit?: number | null }) {
  try {
    const bodyPayload: any = { action: 'list_inspections' };
    if (opts && typeof opts.completedLimit !== 'undefined') bodyPayload.completed_limit = opts.completedLimit;
    const res = await fetch(API.inspectionsQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('getInspectionsPartitioned non-ok', res.status, text, API.inspectionsQuery);
      return null;
    }

    const data = await res.json();
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    // body may contain: inspections, completed, ongoing
    // Normalize inspections array if present
    try {
      const { parseInspectionsArray } = await import('../schemas/inspection');
      if (body && Array.isArray(body.inspections)) {
        const parsed = parseInspectionsArray(body.inspections);
        if (parsed) body.inspections = parsed;
      }
    } catch (e) {
      console.warn('getInspectionsPartitioned validation failed', e);
    }
    return body;
  } catch (e) {
    console.warn('getInspectionsPartitioned failed', e);
    return null;
  }
}

// Small helper to retrieve server-side dashboard metrics (authoritative)
export async function getDashboardMetrics(days?: number) {
  try {
    const res = await fetch(API.dashboard, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: days || 7 }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('getDashboardMetrics non-ok', res.status, txt, API.dashboard);
      return null;
    }
    const data = await res.json();
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    return body;
  } catch (e) {
    console.warn('getDashboardMetrics failed', e);
    return null;
  }
} 

export async function getInspectionItems(inspectionId: string) {
  if (!inspectionId) return null;
  // Use consolidated inspections query endpoint to fetch inspection items
  try {
    const res = await fetch(API.inspectionsQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_inspection', inspection_id: inspectionId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('getInspectionItems non-ok', res.status, text, API.inspectionsQuery);
      return null;
    }

    const data = await res.json();
    console.log('[API][getInspectionItems] raw data:', data);
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    console.log('[API][getInspectionItems] parsed body:', body);
    const items = body.items || [];
    console.log('[API][getInspectionItems] items:', items);
    try {
      const { parseInspectionItemsArray } = await import('../schemas/db');
      const parsed = parseInspectionItemsArray(items);
      return parsed || items;
    } catch (e) {
      console.warn('getInspectionItems validation failed', e);
      return items;
    }
  } catch (e) {
    console.warn('getInspectionItems failed', e);
    return null;
  }
}

export async function getInspectionItemsForRoom(inspectionId: string, roomId?: string) {
  try {
    const items = await getInspectionItems(inspectionId);
    if (!items || !Array.isArray(items)) return [];
    if (roomId) {
      return (items as any[]).filter((it) => String(it.roomId || it.room_id || it.room || '') === String(roomId));
    }
    return items;
  } catch (e) {
    console.warn('getInspectionItemsForRoom failed', e);
    return [];
  }
}