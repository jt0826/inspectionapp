/*
  API configuration + documentation

  This file exposes the runtime API endpoints used by the frontend and includes
  detailed notes about which Lambda function implements each endpoint in
  `/lambda` and important behavioral details you should know when calling them.

  Notes:
  - Use `NEXT_PUBLIC_API_BASE` to override the base URL in different environments.
  - The lambdas live in `/lambda` and are referenced below by filename.
  - Many lambdas accept an `action` in the POST body (consolidated endpoints).

  Purpose: Provide a single authoritative place for endpoints and their docs.
*/

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';

/**
 * inspectionsQuery (GET/POST) -> lambda: `get _inspections.py`
 * - Primary job: list inspections (metadata) for the UI (home/history).
 * - Expected call: POST { action: 'list_inspections' } or simple GET.
 * - Behavior: Scans `InspectionData` table and enriches results by querying `Inspection`
 *   (detailed item rows) to compute `totals` and `byRoom` structures.
 * - Response: array of inspections with fields like `inspection_id`, `totals`, `byRoom`,
 *   `completedAt`, `status`, `venueId`, `venueName`. Includes server-side partitioning
 *   `completed`/`ongoing` when available.
 * - Important: This endpoint is optimized for the Home/History pages (MAX_HOME_COMPLETED limit).
 */

/**
 * inspectionsCreate (POST) -> lambda: `create_inspection.py`
 * - Purpose: Create a new inspection meta row.
 * - Expected call: POST { action: 'create_inspection', inspection: { inspection_id (required), venueId?, venueName?, createdBy? } }  // inspection_id must be client-supplied and well-formed
 * - Behavior: Writes a meta item to `Inspection` and `InspectionData` and returns the created item
 *   (inspectionData) so the UI can continue with the new inspection id.
 */

/**
 * inspectionsDelete (POST) -> lambda: `delete_inspection.py`
 * - Purpose: Delete an inspection record (and optionally cascade delete images).
 * - Expected call: POST { inspection_id, cascade?: true }
 * - Behavior when `cascade: true`: lists images for inspection, deletes S3 objects in batches,
 *   deletes `InspectionImages` rows, then deletes `InspectionData` meta row. Returns summary with
 *   `deletedImages`,`imageFailures`, and `inspectionDeleted`.
 */

/**
 * inspections (POST) -> lambda: `inspections.py`
 * - Purpose: The consolidated interface for saving inspections and items.
 * - Actions supported in body:
 *    - { action: 'save_inspection', inspection: {...} }  // saves meta or batch of items
 *    - { action: 'save_item', inspection: {...} }        // upsert a single item
 *    - check_inspection_complete helper (internal)
 * - Important behaviors:
 *    - Uses `Inspection` table for item rows and `InspectionData` for summary rows.
 *    - Auto-merges meta rows, writes timestamps in local timezone (UTC+8).
 *    - When a save results in all items PASS, it marks meta as `completed`.
 */

/**
 * venuesQuery (GET/POST) -> lambda: `get_venues.py` (also supported by `create_venue.py` action 'get_venues')
 * - Purpose: Return list of venues (VenueRoomData / Venues table).
 * - Expected call: GET or POST { action: 'get_venues' }
 * - Response: { venues: [...] }
 */

/**
 * venuesCreate (POST) -> lambda: `create_venue.py`
 * - Purpose: Create/update/delete venues.
 * - Supported actions:
 *    - { action: 'create_venue', venue: {...} } or direct create payload
 *    - { action: 'update_venue', venue: {...} }  // upsert
 *    - { action: 'delete_venue', venueId }       // deletes venue and cascades to remove related inspections
 * - Notes: delete_venue attempts cascading deletes of related Inspection & InspectionData rows.
 */

/**
 * listImagesDb (GET/POST) -> lambda: `list_images_db.py`
 * - Purpose: List image metadata for an inspection + room (and optionally sign URLs via CloudFront).
 * - Expected call: POST { inspectionId, roomId, itemId? , signed?: true/false }
 * - Response: { images: [{ s3Key, filename, contentType, filesize, uploadedBy, uploadedAt, itemId, imageId, publicUrl, signedUrl, cloudfrontSignedUrl }], ... }
 * - Important:
 *    - If `signed` is true (default), the lambda attempts to sign CloudFront URLs using a private key
 *      stored in Secrets Manager (secret name `/cloudfront/signing/inspectionapp` by default).
 *    - The signer depends on `rsa` and `botocore.signers.CloudFrontSigner` in the runtime; when
 *      unavailable the signed URL will be omitted.
 *    - Supports `showS3Keys` for debugging and `checkSigned` when `ENABLE_DEBUG` is true.
 */

/**
 * signUpload (POST) -> lambda: `sign_s3_upload.py`
 * - Purpose: Generates a presigned POST (form) for S3 uploads to avoid CORS preflight.
 * - Expected call: POST { inspectionId, venueId, roomId, itemId, filename, contentType, fileSize }
 * - Response: { post: { url, fields }, key, expiresIn }
 * - Notes: Enforces MAX_FILE_SIZE (5 MB) and uses an ISO timestamp + uuid to generate a stable key
 *   like `images/{inspectionId}/{venueId}/{roomId}/{itemId}/{ts}-{suffix}.{ext}`.
 */

/**
 * registerImage (POST) -> lambda: `register_image.py`
 * - Purpose: After a successful upload to S3, register the image metadata in DynamoDB.
 * - Expected call: POST { key, imageId, inspectionId, venueId, roomId, itemId, filename, contentType, filesize, uploadedBy }  // imageId required (client-supplied)
 * - Behavior: Verifies object exists in S3 via head_object, writes a row to `InspectionImages` and returns `imageId`.
 * - Notes: Frontend should call this after the S3 upload completes to create the authoritative DB record.
 */

/**
 * deleteS3ByDbEntry (POST) -> lambda: `delete_s3_by_db_entry.py`
 * - Purpose: Delete the S3 object referenced by a DB row (or delete by s3Key directly).
 * - Expected call: POST { inspectionId, roomId, itemId, imageId? or s3Key? }
 * - Behavior: If `imageId` provided, resolves DB record and deletes the S3 object. Returns s3Key and sortKey.
 */

/**
 * deleteImageDb (POST) -> lambda: `delete_image_db.py`
 * - Purpose: Delete image metadata row(s) in InspectionImages without touching S3.
 * - Expected call: POST { inspectionId, roomId, itemId, imageId? or s3Key? }
 */

/**
 * dashboard (GET/POST) -> lambda: `dashboard.py`
 * - Purpose: Server-side metrics for dashboard (total inspections, ongoing/completed, recent counts, venue risk, inspector performance).
 * - Expected call: GET or POST { days?: number } (default 7)
 * - Response: { metrics: {...}, recentCompleted: [...], venueAnalytics: [...], inspectorPerformance: [...] }
 * - Notes: Uses `InspectionData`, `Inspection`, and `VenueRoomData` tables to compute metrics.
 */

export const API = {
  // Inspections
  inspectionsQuery: `${API_BASE}/inspections-query`, // -> lambda: get _inspections.py (list_inspections)
  inspectionsCreate: `${API_BASE}/inspections-create`, // -> lambda: create_inspection.py (create_inspection)
  inspectionsDelete: `${API_BASE}/inspections-delete`, // -> lambda: delete_inspection.py (cascade delete supported)
  inspections: `${API_BASE}/inspections`, // -> lambda: inspections.py (save_inspection, save_item)

  // Venues
  venuesQuery: `${API_BASE}/venues-query`, // -> lambda: get_venues.py (get_venues)
  venuesCreate: `${API_BASE}/venues-create`, // -> lambda: create_venue.py (create_venue, update_venue, delete_venue)

  // Images
  listImagesDb: `${API_BASE}/list-images-db`, // -> lambda: list_images_db.py (returns signed/unsigned URLs and image metadata)
  registerImage: `${API_BASE}/register-image`, // -> lambda: register_image.py (verifies S3 then writes InspectionImages row)
  signUpload: `${API_BASE}/sign-upload`, // -> lambda: sign_s3_upload.py (generates presigned POST + key)
  deleteS3ByDbEntry: `${API_BASE}/delete-s3-by-db-entry`, // -> lambda: delete_s3_by_db_entry.py
  deleteImageDb: `${API_BASE}/delete-image-db`, // -> lambda: delete_image_db.py

  // Dashboard
  dashboard: `${API_BASE}/dashboard`, // -> lambda: dashboard.py (server-side metrics)
};
