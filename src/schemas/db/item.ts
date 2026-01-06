import { z } from 'zod';
import { toCamelCaseKeys } from '../../utils/case';
import type { InspectionItemDB } from '../../types/db';

export const InspectionItemDbSchema = z.object({
  inspectionId: z.string(),
  roomId: z.string(),
  itemId: z.string(),
  name: z.string().optional(),
  status: z.union([z.enum(['pass', 'fail', 'na', 'pending']), z.string(), z.null()]).optional().nullable(),
  notes: z.string().optional(),
  comments: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const InspectionItemsArraySchema = z.array(InspectionItemDbSchema);

export function parseInspectionItem(raw: any): InspectionItemDB | null {
  try {
    const normalized = toCamelCaseKeys(raw);
    return InspectionItemDbSchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspectionItem failed', e, raw);
    return null;
  }
}

export function parseInspectionItemsArray(raw: any): InspectionItemDB[] | null {
  try {
    const normalized = Array.isArray(raw) ? raw.map(toCamelCaseKeys) : raw;
    return InspectionItemsArraySchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspectionItemsArray failed', e, raw);
    return null;
  }
}
