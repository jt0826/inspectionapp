import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInspectionItems, getInspectionItemsForRoom } from '../inspectionApi';

describe('inspectionApi', () => {
  let globalFetch: any;

  beforeEach(() => {
    globalFetch = (global as any).fetch;
    (global as any).fetch = vi.fn();
  });

  afterEach(() => {
    (global as any).fetch = globalFetch;
    vi.resetAllMocks();
  });

  it('getInspectionItems returns parsed items', async () => {
    const body = { items: [{ itemId: 'a', roomId: 'r1' }, { itemId: 'b', roomId: 'r2' }] };
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ body }) });
    const items = await getInspectionItems('insp1');
    expect(items).toEqual(body.items);
  });

  it('getInspectionItemsForRoom filters by room', async () => {
    const body = { items: [{ itemId: 'a', roomId: 'r1' }, { itemId: 'b', roomId: 'r2' }] };
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ body }) });
    const items = await getInspectionItemsForRoom('insp1', 'r1');
    expect(items).toEqual([{ itemId: 'a', roomId: 'r1' }]);
  });
});