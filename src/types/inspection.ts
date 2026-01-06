// Canonical types - use these everywhere in frontend
// Prefer camelCase across the wire and in code

export interface Inspection {
  id: string;
  venueId: string;
  venueName: string;
  roomId: string;
  roomName: string;
  inspectorName: string;
  status: 'draft' | 'in-progress' | 'completed';
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  items: InspectionItem[];
  totals?: InspectionTotals;
}

export interface InspectionTotals {
  pass: number;
  fail: number;
  na: number;
  pending: number;
  total: number;
}

export interface InspectionItem {
  id: string;
  name: string; // renamed from 'item' for clarity
  status: 'pass' | 'fail' | 'na' | 'pending' | null;
  notes: string;
  photos: Photo[];
}

export interface Photo {
  id: string;
  imageId?: string;
  s3Key?: string;
  preview?: string;
  filename?: string;
  contentType?: string;
  filesize?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  status?: 'pending' | 'uploading' | 'uploaded' | string;
}
