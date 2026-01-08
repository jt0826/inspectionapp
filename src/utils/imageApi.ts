import { API } from '../config/api';

export async function listImages({ inspectionId, roomId, signed = true }: { inspectionId: string; roomId: string; signed?: boolean }) {
  if (!inspectionId || !roomId) return [];
  try {
    const resp = await fetch(API.listImagesDb, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId, roomId, signed }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.warn('imageApi.listImages non-ok', resp.status, txt);
      return [];
    }
    const data = await resp.json();
    return data.images || [];
  } catch (e) {
    console.warn('imageApi.listImages failed', e);
    return [];
  }
}

export async function signUpload(params: {
  inspectionId: string;
  venueId: string;
  roomId: string;
  itemId: string;
  filename: string;
  contentType?: string;
  fileSize?: number;
  uploadedBy?: string;
}) {
  try {
    const resp = await fetch(API.signUpload, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`signUpload non-ok: ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    return data;
  } catch (e) {
    console.warn('imageApi.signUpload failed', e);
    throw e;
  }
}

export async function registerImage(params: {
  key: string;
  imageId?: string;
  inspectionId: string;
  venueId: string;
  roomId: string;
  itemId: string;
  filename: string;
  contentType?: string;
  filesize?: number;
  uploadedBy?: string;
}) {
  try {
    const resp = await fetch(API.registerImage, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`registerImage non-ok: ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    return data;
  } catch (e) {
    console.warn('imageApi.registerImage failed', e);
    throw e;
  }
}
