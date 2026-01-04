export function computeExpectedTotalsFromVenue(v?: any) {
  const totals = { pass: 0, fail: 0, na: 0, pending: 0, total: 0 };
  if (!v) return totals;
  for (const r of v.rooms || []) {
    const n = (r.items || []).length || 0;
    totals.pending += n;
    totals.total += n;
  }
  return totals;
}

export function computeExpectedByRoomFromVenue(v?: any) {
  const map: Record<string, { pass: number; fail: number; na: number; pending: number; total: number }> = {};
  if (!v) return map;
  for (const r of v.rooms || []) {
    const n = (r.items || []).length || 0;
    map[r.id] = { pass: 0, fail: 0, na: 0, pending: n, total: n };
  }
  return map;
}

export function computeTotalsFromInspection(inspection: any) {
  const rawItems = (inspection && inspection.items) || [];
  const items = (Array.isArray(rawItems) ? rawItems : []).filter((it: any) => it && (it.itemId || it.id || it.item || it.ItemId));
  const passedItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'pass').length;
  const failedItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'fail').length;
  const naItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'na').length;
  const totalItems = items.length;
  return { pass: passedItems, fail: failedItems, na: naItems, total: totalItems };
}
