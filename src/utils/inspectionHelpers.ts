export function computeTotalsFromInspection(inspection: any) {
  const rawItems = (inspection && inspection.items) || [];
  const items = (Array.isArray(rawItems) ? rawItems : []).filter((it: any) => it && (it.itemId || it.id || it.item || it.ItemId));
  const passedItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'pass').length;
  const failedItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'fail').length;
  const naItems = items.filter((i: any) => String(i?.status || '').toLowerCase() === 'na').length;
  const totalItems = items.length;
  return { pass: passedItems, fail: failedItems, na: naItems, total: totalItems };
}
