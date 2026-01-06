import { z } from 'zod';
import { toCamelCaseKeys } from '../../utils/case';
import type { InspectionMetadata } from '../../types/db';

export const InspectionMetadataSchema = z.object({
  inspectionId: z.string(),
  venueId: z.string().optional(),
  venueName: z.string().optional(),
  inspectorId: z.string().optional(),
  inspectorName: z.string().optional(),
  status: z.enum(['draft', 'in-progress', 'completed']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export function parseInspectionMetadata(raw: any): InspectionMetadata | null {
  try {
    const normalized = toCamelCaseKeys(raw);
    return InspectionMetadataSchema.parse(normalized);
  } catch (e) {
    console.warn('parseInspectionMetadata failed', e, raw);
    return null;
  }
}
