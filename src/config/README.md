# DB Environment Variables

This file documents the environment variables you should set for AWS Lambda deployments. Keep a copy of this locally so you know which environment variables to upload when deploying.

Suggested variables:

- TABLE_INSPECTION_METADATA - table that stores inspection metadata (InspectionMetadata)
- TABLE_INSPECTION_ITEMS - table that stores inspection item rows (InspectionItems)
- TABLE_INSPECTION_IMAGES - table that stores inspection image metadata (InspectionImages)
- TABLE_VENUE_ROOMS - table that stores venue room/layout data (VenueRooms)
- TABLE_INSPECTION_DATA - alias for inspection metadata table (can be same as TABLE_INSPECTION_METADATA)

Example `db.env.example.json` is included with recommended defaults.
