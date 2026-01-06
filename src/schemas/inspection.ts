import { z } from 'zod';
import { toCamelCaseKeys } from '../utils/case';

export const PhotoSchema = z.object({
  id: z.string(),
  imageId: z.string().optional(),
  s3Key: z.string().optional(),
  preview: z.string().optional(),
  filename: z.string().optional(),
  contentType: z.string().optional(),
  filesize: z.number().optional(),
  uploadedAt: z.string().optional(),
  uploadedBy: z.string().optional(),
  status: z.enum(['pending', 'uploading', 'uploaded']).optional(),
});

export const InspectionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.union([z.enum(['pass', 'fail', 'na', 'pending']), z.null()]).optional(),
  notes: z.string().optional(),
  photos: z.array(PhotoSchema).optional(),
});

export const InspectionTotalsSchema = z.object({
  pass: z.number(),
  fail: z.number(),
  na: z.number(),
  pending: z.number(),
  total: z.number(),
});

export const InspectionSchema = z.object({
  id: z.string(),
  venueId: z.string().optional(),
  venueName: z.string().optional(),
  roomId: z.string().optional(),
  roomName: z.string().optional(),
  inspectorName: z.string().optional(),
  status: z.enum(['draft', 'in-progress', 'completed']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  completedAt: z.string().optional(),
  items: z.array(InspectionItemSchema).optional(),
  totals: InspectionTotalsSchema.optional(),
  byRoom: z.record(z.string(), InspectionTotalsSchema).optional(),
});

export const InspectionsArraySchema = z.array(InspectionSchema);

function normalizeInspection(raw: any) {
  const t: any = toCamelCaseKeys(raw) || {};

  // Map legacy id fields to canonical `id`
  if (!t.id) {
    if (t.inspectionId) t.id = t.inspectionId;
    else if (t.inspection_id) t.id = t.inspection_id;
  }

  // Normalize nullable strings to be undefined (Zod treats null as invalid for string)
  if (t.roomId === null) delete t.roomId;
  if (t.roomName === null) delete t.roomName;
  if (t.updatedAt === null) delete t.updatedAt;
  if (t.completedAt === null) delete t.completedAt;

  // Normalize items
  if (Array.isArray(t.items)) {
    t.items = t.items.map((it: any) => {
      const I: any = toCamelCaseKeys(it) || {};
      if (!I.id) {
        if (I.itemId) I.id = I.itemId;
        else if (I.item_id) I.id = I.item_id;
      }
      if (I.name === null) delete I.name;
      if (I.status === null) delete I.status;

      if (Array.isArray(I.photos)) {
        I.photos = I.photos.map((p: any) => {
          const P: any = toCamelCaseKeys(p) || {};
          if (!P.id) {
            if (P.imageId) P.id = P.imageId;
            else if (P.image_id) P.id = P.image_id;
          }
          if (P.uploadedAt === null) delete P.uploadedAt;
          return P;
        });
      }

      return I;
    });
  }

  // Normalize byRoom: ensure keys are strings and values are normalized totals
  if (t.byRoom && typeof t.byRoom === 'object') {
    const normalizedByRoom: Record<string, any> = {};
    for (const [k, v] of Object.entries(t.byRoom as any)) {
      try {
        const vv: any = v as any;
        const counts = {
          pass: Number(vv?.pass || 0),
          fail: Number(vv?.fail || 0),
          na: Number(vv?.na || 0),
          pending: Number(vv?.pending || 0),
          total: Number(vv?.total || 0),
        };
        normalizedByRoom[String(k)] = counts;
      } catch (e) {
        // ignore malformed room counts
      }
    }
    t.byRoom = normalizedByRoom;
  }

  return t;
}

export function parseInspection(raw: any) {
  try {
    const normalized = normalizeInspection(raw);
    return InspectionSchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspection failed', e, raw);
    return null;
  }
}

export function parseInspectionsArray(raw: any) {
  try {
    const arr = Array.isArray(raw) ? raw : (raw && raw.Items) ? raw.Items : [];
    const normalized = arr.map(normalizeInspection);
    return InspectionsArraySchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspectionsArray failed', e, raw);
    return null;
  }
}
