export async function getInspectionSummary(inspectionId: string) {
  if (!inspectionId) return null;
  // Consolidated inspections query endpoint — expect JSON response with body containing summary
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_inspection_summary', inspection_id: inspectionId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('getInspectionSummary non-ok', res.status, text, API_BASE);
      return null;
    }

    // Parse and return the canonical body payload
    const data = await res.json();
    const body = data?.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    return body || null;
  } catch (e) {
    console.warn('getInspectionSummary failed', e);
    return null;
  }
}



export async function checkInspectionComplete(inspectionId: string, venueId: string) {
  if (!inspectionId || !venueId) return null;
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_inspection_complete', inspection_id: inspectionId, venueId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('checkInspectionComplete non-ok', res.status, text, API_BASE);
      return null;
    }
    const data = await res.json();
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    return body;
  } catch (e) {
    console.warn('checkInspectionComplete failed', e);
    return null;
  }
}

export async function deleteInspection(inspectionId: string, opts?: { cascade?: boolean }, token?: string) {
  if (!inspectionId) return null;
  // Use the consolidated inspections-delete endpoint
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-delete';
  try {
    console.log('[API] deleteInspection ->', API_BASE, inspectionId, 'cascade=', !!opts?.cascade);
    const res = await fetch(API_BASE, {
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
      console.warn('deleteInspection non-ok', res.status, data, API_BASE);
      return { ok: false, status: res.status, data };
    }

    // Parse body summary if included
    const parsed = data && data.summary ? data.summary : (data && data.body && data.body.summary ? data.body.summary : null);

    // Notify UI listeners that an inspection changed (deleted)
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('inspectionSaved', { detail: { inspectionId } }));
      }
    } catch (e) {
      // ignore
    }

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
        const resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/list-images-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionId, roomId }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          console.warn('listImagesForInspection non-ok for room', roomId, resp.status, text);
          return [];
        }
        const data = await resp.json();
        return data.images || [];
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
    const deleteS3Resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/delete-s3-by-db-entry', {
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
    const delDbResp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/delete-image-db', {
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
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_inspections' }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('getInspections non-ok', res.status, txt, API_BASE);
      return [];
    }

    const data = await res.json();
    const body = data?.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    const items: any[] = Array.isArray(body?.inspections) ? body.inspections : [];
    return items;
  } catch (e) {
    console.warn('getInspections failed', e);
    return [];
  }
}

// New helper: return the parsed body from list_inspections including any server-provided partitions like 'completed'/'ongoing'
export async function getInspectionsPartitioned(opts?: { completedLimit?: number | null }) {
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const bodyPayload: any = { action: 'list_inspections' };
    if (opts && typeof opts.completedLimit !== 'undefined') bodyPayload.completed_limit = opts.completedLimit;
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('getInspectionsPartitioned non-ok', res.status, text, API_BASE);
      return null;
    }

    const data = await res.json();
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    // body may contain: inspections, completed, ongoing
    return body;
  } catch (e) {
    console.warn('getInspectionsPartitioned failed', e);
    return null;
  }
}

// Small helper to retrieve server-side dashboard metrics (authoritative)
export async function getDashboardMetrics(days?: number) {
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/dashboard';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: days || 7 }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('getDashboardMetrics non-ok', res.status, txt, API_BASE);
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
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_inspection', inspection_id: inspectionId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('getInspectionItems non-ok', res.status, text, API_BASE);
      return null;
    }

    const data = await res.json();
    console.log('[API][getInspectionItems] raw data:', data);
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    console.log('[API][getInspectionItems] parsed body:', body);
    const items = body.items || [];
    console.log('[API][getInspectionItems] items:', items);
    return items;
  } catch (e) {
    console.warn('getInspectionItems failed', e);
    return null;
  }
}