export async function getInspectionSummary(inspectionId: string) {
  if (!inspectionId) return null;
  // Primary summary endpoint (may not be supported by all deployments)
  // New consolidated inspections query endpoint
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_inspection_summary', inspection_id: inspectionId }),
    });

    const text = await res.text().catch(() => '');
    console.log('[API][getInspectionSummary] rawText:', text);


    if (!res.ok) {
      // If the endpoint explicitly does not support this action, fallback to computing the summary from raw items
      try {
        const parsed = text ? JSON.parse(text) : null;
        if (parsed && typeof parsed.message === 'string' && parsed.message.toLowerCase().includes('unsupported action')) {
          const items = await getInspectionItems(inspectionId);
          if (!items) return null;
          return computeSummaryFromItems(items);
        }
      } catch (e) {
        // ignore parse errors and fall through to logging
      }

      console.warn('getInspectionSummary non-ok', res.status, text, API_BASE);
      return null;
    }

    // Parse body if possible
    let data: any = null;
    try { data = text ? JSON.parse(text) : await res.json(); } catch (e) { try { data = await res.json(); } catch (_) { data = null; } }
    const body = data?.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    console.log('[API][getInspectionSummary] parsedData:', data);
    console.log('[API][getInspectionSummary] body:', body);


    // If service did not return a usable summary, compute it from raw items as a fallback
    if (!body || (!body.totals && !body.byRoom)) {
      const items = await getInspectionItems(inspectionId);
      console.log('[API][getInspectionSummary] fallback items:', items);
      if (items && Array.isArray(items)) {
        const summary = computeSummaryFromItems(items);
        console.log('[API][getInspectionSummary] computed summary from items:', summary);
        return { ...(body || {}), ...summary } as any;
      }
    }

    return body;
  } catch (e) {
    console.warn('getInspectionSummary failed', e);
    return null;
  }
}

function computeSummaryFromItems(items: any[]) {
  console.log('[computeSummaryFromItems] items:', items);
  const totals: any = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
  const byRoom: Record<string, any> = {};
  let latestTs: string | null = null;
  let latestBy: string | null = null;

  for (const it of items as any[]) {
    // Ignore meta rows (rows without an item identifier)
    const itemId = it?.itemId || it?.item || it?.ItemId || it?.id || null;
    if (!itemId) continue;

    const status = String(it?.status || it?.state || 'pending').toLowerCase();
    totals.total += 1;
    if (status === 'pass') totals.pass++;
    else if (status === 'fail') totals.fail++;
    else if (status === 'na') totals.na++;
    else totals.pending++;

    // By room breakdown
    const rid = String(it?.roomId || it?.room_id || it?.room || '');
    const br = byRoom[rid] || (byRoom[rid] = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 });
    br.total += 1;
    if (status === 'pass') br.pass++;
    else if (status === 'fail') br.fail++;
    else if (status === 'na') br.na++;
    else br.pending++;

    const tsRaw = it?.updatedAt || it?.updated_at || it?.createdAt || it?.created_at;
    const ts = tsRaw ? String(tsRaw) : null;
    if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) {
      latestTs = ts;
      latestBy = it?.inspectorName || it?.createdBy || it?.inspector_name || it?.created_by || null;
    }
  }

  console.log('[computeSummaryFromItems] totals:', totals, 'byRoom:', byRoom, 'updatedAt:', latestTs, 'updatedBy:', latestBy);
  return { totals, byRoom, updatedAt: latestTs, updatedBy: latestBy };
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

    const text = await res.text().catch(() => '');
    console.log('[API][getInspections] rawText:', text);
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { try { data = await res.json(); } catch (e) { data = null; } }
    console.log('[API][getInspections] parsedData:', data);

    let items: any[] = [];
    if (Array.isArray(data?.inspections)) items = data.inspections;
    else if (Array.isArray(data)) items = data;
    else if (data?.body) {
      try {
        const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
        items = parsed.inspections || parsed.Items || [];
      } catch (e) {
        console.warn('Failed to parse list_inspections.body', e);
      }
    }

    console.log('[API][getInspections] items:', items);
    return items;
  } catch (e) {
    console.warn('getInspections failed', e);
    return [];
  }
}

// New helper: return the parsed body from list_inspections including any server-provided partitions like 'completed'/'ongoing'
export async function getInspectionsPartitioned() {
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_inspections' }),
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