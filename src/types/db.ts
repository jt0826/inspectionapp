export interface InspectionMetadata {
  inspectionId: string;
  venueId?: string | null;
  venueName?: string | null;
  inspectorId?: string | null;
  inspectorName?: string | null;
  status?: 'draft' | 'in-progress' | 'completed' | string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  // other small metadata fields
  [k: string]: any;
}

export interface InspectionItemDB {
  inspectionId: string;
  roomId: string;
  itemId: string;
  name?: string;
  status?: 'pass' | 'fail' | 'na' | 'pending' | string | null;
  notes?: string;
  comments?: string;
  createdAt?: string;
  updatedAt?: string;
  // minimal denormalized fields only
  [k: string]: any;
}

export interface InspectionImageDB {
  inspectionId: string;
  roomId: string;
  itemId: string;
  imageId: string;
  s3Key: string;
  filename?: string;
  contentType?: string;
  filesize?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  url?: string; // computed at read time, not written
  [k: string]: any;
}

export interface VenueRoomDB {
  venueId: string;
  roomId: string;
  name?: string;
  description?: string;
  // prefer per-item rows for large venues; small itemList is acceptable if bounded
  itemList?: Array<{ itemId: string; name?: string }>; 
  createdAt?: string;
  updatedAt?: string;
}
