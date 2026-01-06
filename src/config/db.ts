/**
 * Central DynamoDB table and key configuration
 * -------------------------------------------------
 * Purpose: Provide a single source of truth for table names, key attribute
 * names, SK prefix patterns, and small helper builders for SK values.
 *
 * Notes:
 * - We intentionally keep names and patterns small and documented so all
 *   lambdas and frontend helpers can import these constants rather than
 *   re-encoding literal strings around the repo.
 * - This file follows the multi-table design we've chosen for clarity.
 */

export const TABLES = {
  InspectionMetadata: "InspectionMetadata",
  InspectionItems: "InspectionItems",
  InspectionImages: "InspectionImages",
  VenueRooms: "VenueRooms",
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/**
 * Key attribute names used across the tables (camelCase everywhere).
 * For multi-table design we generally use explicit attribute names like
 * `inspectionId`, `roomId`, and `venueId`.
 */
export const KEYS = {
  inspectionId: "inspectionId",
  roomId: "roomId",
  itemId: "itemId",
  imageId: "imageId",
  venueId: "venueId",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

/**
 * Sort-key (SK) prefix helpers and patterns used for constructing SKs.
 * Keep the SKs human-friendly and deterministic so you can scan/seek
 * predictable ranges such as `roomId#itemId`.
 */
export const SK = {
  roomItem: (roomId: string, itemId: string) => `${roomId}#${itemId}`,
  roomItemImage: (roomId: string, itemId: string, imageId: string) =>
    `${roomId}#${itemId}#${imageId}`,
  room: (roomId: string) => `${roomId}`,
};

/**
 * Example record shapes (for documentation purposes). Use these as
 * references when writing Zod/pydantic schemas and tests.
 */
export const EXAMPLE = {
  inspectionMetadata: {
    pk: "INSPECTION#<inspectionId>",
    sk: "METADATA#<inspectionId>",
    entityType: "metadata",
    inspectionId: "<inspectionId>",
    venueId: "<venueId>",
    inspectorId: "<inspectorId>",
    status: "in_progress",
    createdAt: "2026-01-01T12:00:00Z",
    updatedAt: "2026-01-01T12:05:00Z",
  },
  itemRecord: {
    pk: "INSPECTION#<inspectionId>",
    sk: "<roomId>#<itemId>",
    entityType: "item",
    inspectionId: "<inspectionId>",
    roomId: "<roomId>",
    itemId: "<itemId>",
    name: "Fire extinguisher",
    status: "ok",
    notes: "",
    createdAt: "2026-01-01T12:00:00Z",
  },
  imageRecord: {
    pk: "INSPECTION#<inspectionId>",
    sk: "<roomId>#<itemId>#<imageId>",
    entityType: "image",
    inspectionId: "<inspectionId>",
    roomId: "<roomId>",
    itemId: "<itemId>",
    imageId: "<imageId>",
    s3Key: "venue-123/inspections/abc123/img-01.jpg",
    uploadedAt: "2026-01-01T12:01:00Z",
  },
};

/**
 * Recommended GSIs (documented here so teams agree on names & keys):
 * - GSI_byVenue: partition key = `venueId`, sort key = `createdAt` (lists inspections for a venue)
 * - GSI_byInspector: partition key = `inspectorId`, sort key = `updatedAt` (list inspections by inspector)
 */
export const GSIS = {
  GSI_BY_VENUE: "GSI_byVenue",
  GSI_BY_INSPECTOR: "GSI_byInspector",
} as const;

/**
 * Small helper: build a consistent Partition Key for a multi-entity
 * inspection partition (used in single-table designs and useful for
 * human-readable items even in multi-table designs).
 */
export function inspectionPk(inspectionId: string) {
  return `INSPECTION#${inspectionId}`;
}

/**
 * Developer note:
 * - Add unit tests that assert these helper functions produce expected
 *   strings and that any changes here are backward compatible.
 * - Use `src/types/db.ts` and `src/schemas/db/*` (Zod) to keep record
 *   shapes validated at runtime across frontend and lambdas.
 */
