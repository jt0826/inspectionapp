export async function getInspectionSummary(inspectionId: string) {
  if (!inspectionId) return null;
  // Primary summary endpoint (may not be supported by all deployments)
  const API_BASE = 'https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_inspection_summary', inspection_id: inspectionId }),
    });

    const text = await res.text().catch(() => '');

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

    // If service did not return a usable summary, compute it from raw items as a fallback
    if (!body || (!body.totals && !body.byRoom)) {
      const items = await getInspectionItems(inspectionId);
      if (items && Array.isArray(items)) {
        const summary = computeSummaryFromItems(items);
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

  return { totals, byRoom, lastUpdated: latestTs, lastUpdatedBy: latestBy };
}

export async function checkInspectionComplete(inspectionId: string, venueId: string) {
  if (!inspectionId || !venueId) return null;
  const API_BASE = 'https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev';
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

export async function deleteInspection(inspectionId: string, token?: string) {
  if (!inspectionId) return null;
  // Use the lh3 endpoint which contains the inspections handler
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';
  try {
    console.log('[API] deleteInspection ->', API_BASE, inspectionId);
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: 'delete_inspection', inspection_id: inspectionId }),
    });
    const text = await res.text().catch(() => '');
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

    // Detect if we've hit the wrong handler which returns the inspections list
    if (data && data.inspections) {
      console.warn('deleteInspection hit inspections-list handler (wrong action endpoint)', data);
      return { ok: false, status: res.status, data, reason: 'wrong-handler' };
    }

    if (!res.ok) {
      console.warn('deleteInspection non-ok', res.status, data, API_BASE);
      return { ok: false, status: res.status, data };
    }

    return { ok: true, status: res.status, data };
  } catch (e) {
    console.warn('deleteInspection failed', e);
    return { ok: false, error: e };
  }
}

export async function getInspections() {
  const API_BASE = 'https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev';
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_inspections' }),
    });

    const text = await res.text().catch(() => '');
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { try { data = await res.json(); } catch (_) { data = null; } }

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

    return items;
  } catch (e) {
    console.warn('getInspections failed', e);
    return [];
  }
}

export async function getInspectionItems(inspectionId: string) {
  if (!inspectionId) return null;
  const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';
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
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    const items = body.items || [];
    return items;
  } catch (e) {
    console.warn('getInspectionItems failed', e);
    return null;
  }
}