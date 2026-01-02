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
