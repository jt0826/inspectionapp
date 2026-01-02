export async function getInspectionSummary(inspectionId: string) {
  if (!inspectionId) return null;
  // Use the same inspections endpoint as list_inspections in InspectorHome
  const API_BASE = 'https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev';
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
    const data = await res.json();
    const body = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data;
    return body;
  } catch (e) {
    console.warn('getInspectionSummary failed', e);
    return null;
  }
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