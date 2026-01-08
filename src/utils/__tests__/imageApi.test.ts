import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listImages, signUpload, registerImage } from '../imageApi';

describe('imageApi', () => {
  let globalFetch: any;

  beforeEach(() => {
    globalFetch = (global as any).fetch;
    (global as any).fetch = vi.fn();
  });

  afterEach(() => {
    (global as any).fetch = globalFetch;
    vi.resetAllMocks();
  });

  it('listImages returns empty array when inspectionId or roomId missing', async () => {
    expect(await listImages({ inspectionId: '', roomId: '' })).toEqual([]);
    expect(await listImages({ inspectionId: 'x', roomId: '' })).toEqual([]);
  });

  it('listImages returns images on success', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ images: [{ imageId: 'i1' }] }) });
    const res = await listImages({ inspectionId: 'insp1', roomId: 'room1', signed: true });
    expect(res).toEqual([{ imageId: 'i1' }]);
  });

  it('signUpload throws on non-ok response and returns data on success', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: false, text: async () => 'err' });
    await expect(signUpload({ inspectionId: 'i', venueId: 'v', roomId: 'r', itemId: 'it', filename: 'f' })).rejects.toThrow();

    const payload = { key: 'k' };
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const data = await signUpload({ inspectionId: 'i', venueId: 'v', roomId: 'r', itemId: 'it', filename: 'f' });
    expect(data).toEqual(payload);
  });

  it('registerImage throws on non-ok response and returns data on success', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: false, text: async () => 'err' });
    await expect(registerImage({ key: 'k', inspectionId: 'i', venueId: 'v', roomId: 'r', itemId: 'it', filename: 'f' })).rejects.toThrow();

    const payload = { imageId: 'img1' };
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const data = await registerImage({ key: 'k', inspectionId: 'i', venueId: 'v', roomId: 'r', itemId: 'it', filename: 'f' });
    expect(data).toEqual(payload);
  });
});