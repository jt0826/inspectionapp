import { z } from 'zod';
import { toCamelCaseKeys } from '../../utils/case';
import type { InspectionImageDB } from '../../types/db';

export const InspectionImageDbSchema = z.object({
  inspectionId: z.string(),
  roomId: z.string(),
  itemId: z.string(),
  imageId: z.string(),
  s3Key: z.string(),
  filename: z.string().optional(),
  contentType: z.string().optional(),
  filesize: z.number().optional(),
  uploadedBy: z.string().optional(),
  uploadedAt: z.string().optional(),
});

export const InspectionImagesArraySchema = z.array(InspectionImageDbSchema);

export function parseInspectionImage(raw: any): InspectionImageDB | null {
  try {
    const normalized = toCamelCaseKeys(raw);
    return InspectionImageDbSchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspectionImage failed', e, raw);
    return null;
  }
}

export function parseInspectionImagesArray(raw: any): InspectionImageDB[] | null {
  try {
    const normalized = Array.isArray(raw) ? raw.map(toCamelCaseKeys) : raw;
    return InspectionImagesArraySchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspectionImagesArray failed', e, raw);
    return null;
  }
}
