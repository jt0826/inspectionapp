import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, X, Search, ChevronLeft, ChevronRight, Clock, Save } from 'lucide-react';
// Split components (Phase 5.2)
import InspectionHeader from './inspection/InspectionHeader';
import InspectionProgress from './inspection/InspectionProgress';
import InspectionItemCard from './inspection/InspectionItemCard';
import Lightbox from './inspection/Lightbox';
import NumberFlow from '@number-flow/react';
import type { Venue, Room } from '../types/venue';
import type { Inspection, InspectionItem } from '../types/inspection';
import { useAuth, useDisplayName } from '../contexts/AuthContext';
import { getInspectionItems, getInspections } from '../utils/inspectionApi';
import { API } from '../config/api';
import { listImages, signUpload, registerImage } from '../utils/imageApi';
import { generatePhotoId, generateItemId, generateInspectionId } from '../utils/id';
import { useToast } from './ToastProvider';
import LoadingOverlay from './LoadingOverlay';
import { useInspectionContext } from '../contexts/InspectionContext';

interface InspectionFormProps {
  venue: Venue;
  room: Room;
  onBack: () => void;
  onSubmit: (inspection: Inspection) => void;
  existingInspection?: Inspection | null;
  inspectionId?: string;
  readOnly?: boolean;
}

import { defaultInspectionItems } from '../config/defaults';

const makePhotoId = () => generatePhotoId();

// Raw item shape returned by some APIs or venue definitions
type RawInspectionItem = {
  id?: string;
  itemId?: string;
  ItemId?: string;
  itemName?: string;
  item?: string;
  ItemName?: string;
  name?: string;
  status?: string;
  photos?: any[];
  comments?: string;
  notes?: string;
  [k: string]: any;
};

// Ensure any incoming item-like object is normalized to the InspectionItem shape
const normalizeItem = (it: RawInspectionItem): InspectionItem => ({
  id: it.id || it.itemId || it.ItemId || generateItemId(),
  name: it.itemName || it.item || it.ItemName || it.name || '',
  status: (it.status || 'pending') as any,
  photos: it.photos || [],
  notes: it.comments || it.notes || ''
});

// Enforce the room-defined item order on a list of items.
const enforceRoomOrder = (items: InspectionItem[], room: Room) => {
  if (!room || !Array.isArray((room as any).items) || (room as any).items.length === 0) return items;
  // Build ordered lookup from room definition
  const order: { ids: string[]; names: string[] }[] = (room as any).items.map((ri: any) => ({
    ids: [ri.itemId, ri.id].filter(Boolean).map((v: any) => String(v)),
    names: [ri.name, ri.item].filter(Boolean).map((v: any) => String(v).toLowerCase())
  }));

  return items.slice().sort((a, b) => {
    const aKey = String(a.id || '');
    const bKey = String(b.id || '');
    const aName = String(a.name || '').toLowerCase();
    const bName = String(b.name || '').toLowerCase();

    const aIndex = order.findIndex((ok: { ids: string[]; names: string[] }) => ok.ids.includes(aKey) || (aName && ok.names.includes(aName)));
    const bIndex = order.findIndex((ok: { ids: string[]; names: string[] }) => ok.ids.includes(bKey) || (bName && ok.names.includes(bName)));

    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
};

export function InspectionForm({ venue, room, onBack, onSubmit, existingInspection, inspectionId, readOnly = false }: InspectionFormProps) {
  const { user } = useAuth();
  const displayName = useDisplayName();

  // Server-driven read-only state (for inspectionId-only flows)
  const [serverReadOnly, setServerReadOnly] = useState<boolean>(false);

  // Read-only when explicitly requested OR when the inspection is already completed
  const isReadOnly = Boolean(readOnly || (existingInspection && ((existingInspection.status && String(existingInspection.status).toLowerCase() === 'completed') || (existingInspection as any).completedAt)) || serverReadOnly);

  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>(() => {
    // If editing an existing inspection, use its items (normalized to ensure stable ids)
    if (existingInspection && existingInspection.items.length > 0) {
      return existingInspection.items.map((it: any) => normalizeItem(it));
    }

    // Prefer room items from the venue (coming from DB). Fall back to default list if none.
    if (room && Array.isArray((room as any).items) && (room as any).items.length > 0) {
      return (room as any).items.map((it: any) => ({
        id: it.itemId || it.id || generateItemId(),
        name: it.name || it.item || '',
        status: 'pending' as const,
        photos: [],
        notes: '',
      }));
    }

    return defaultInspectionItems.map((item) => ({
      ...item,
      id: generateItemId(),
      status: 'pending' as const,
      photos: [],
      notes: '',
    }));
  });



  const updateItem = (
    id: string,
    updates: Partial<Pick<InspectionItem, 'status' | 'notes' | 'photos'>>
  ) => {
    if (isReadOnly || saving || loadingSaved) return; // no-op in read-only or while busy
    setInspectionItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, ...updates } : item));
      return updated;
    });
  };

  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false); // true while we fetch saved inspection data
  const { show, confirm } = useToast();
  const { triggerRefresh } = useInspectionContext();

  // Search/filter UI
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Lightbox state for viewing full-size images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  const openLightbox = (images: string[], idx: number) => {
    setLightboxImages(images || []);
    setLightboxIndex(idx || 0);
    setLightboxOpen(true);
  };
  const closeLightbox = () => {
    setLightboxOpen(false);
    // keep images in memory briefly in case of animation (not implemented)
  };
  const nextLightbox = () => setLightboxIndex(i => (lightboxImages.length ? (i + 1) % lightboxImages.length : i));
  const prevLightbox = () => setLightboxIndex(i => (lightboxImages.length ? (i - 1 + lightboxImages.length) % lightboxImages.length : i));

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextLightbox();
      if (e.key === 'ArrowLeft') prevLightbox();
    };
    window.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = prevOverflow; };
  }, [lightboxOpen, lightboxImages.length]);

  const filteredItems = useMemo(() => {
    if (!debouncedQuery) return inspectionItems;
    const q = debouncedQuery.toLowerCase();
    return inspectionItems.filter(it => (it.name || '').toLowerCase().includes(q));
  }, [inspectionItems, debouncedQuery]);

  const highlightMatch = (text: string, q: string) => {
    if (!q) return text;
    const qi = q.toLowerCase();
    const ti = text.toLowerCase();
    const idx = ti.indexOf(qi);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}<mark className="bg-yellow-100">{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}
      </>
    );
  };

  // Load saved items when resuming an inspection or when an existingInspection prop is provided
  useEffect(() => {
    const mapDbItem = (it: any): InspectionItem => ({
      id: it.itemId || it.item || it.ItemId || generateItemId(),
      name: it.itemName || it.item || it.ItemName || it.name || '',
      // Normalize status from backend and default to 'pending'
      status: (it.status || 'pending') as any,
      photos: it.photos || [],
      notes: it.comments || it.notes || ''
    });

    // If an existing inspection object is provided by parent, use it (normalize to ensure stable ids)
    if (existingInspection && Array.isArray(existingInspection.items) && existingInspection.items.length > 0) {
      let mapped = existingInspection.items.map((it: any) => normalizeItem(it)) as InspectionItem[];
      // Enforce room item order when available
      mapped = enforceRoomOrder(mapped, room);
      setInspectionItems(mapped);
      return;
    }

    // Otherwise, if an inspectionId exists (resuming), fetch saved items for this inspection + room
    const loadSaved = async () => {
      if (!inspectionId) return;
      setLoadingSaved(true);
      try {
        // Also check the inspection metadata from the server to derive read-only status
        try {
          const list = await getInspections();
          if (Array.isArray(list)) {
            const found = list.find((i: any) => (i.inspection_id || i.id) === inspectionId || i.id === inspectionId);
            if (found) {
              const s = (found.status || '') as string;
              if (s && s.toString().toLowerCase() === 'completed') {
                setServerReadOnly(true);
              } else if ((found as any).completedAt || (found as any).completed_at) {
                setServerReadOnly(true);
              }
            }
          }
        } catch (e) {
          // ignore failures to fetch metadata - fallback behavior remains
          // console.warn('Failed to fetch inspections metadata for read-only check', e);
        }

        try {
          let items = await getInspectionItems(inspectionId);
          if (!items) return;
          items = (items as any[]).filter((it) => String(it.roomId || it.room_id || it.room || '') === String(room.id));
          // Filter out meta rows / non-item rows that lack an identifier
          items = items.filter((it: any) => (it.itemId || it.id || it.item || it.ItemId));
          if (items && items.length > 0) {
            let mapped = items.map((it: any) => mapDbItem(it));
            // enforce venue room item order when available
            mapped = enforceRoomOrder(mapped, room);
            setInspectionItems(mapped);
            (async () => {
              try {
                const images: any[] = await listImages({ inspectionId: inspectionId, roomId: room.id, signed: true });
                if (!images || images.length === 0) return;

                // Merge images into corresponding items by itemId
                setInspectionItems((prev) => {
                  return prev.map((it) => {
                    const existing = it.photos || [];
                    const imgsForItem = images.filter((img) => String(img.itemId) === String(it.id));
                    const newPhotos = imgsForItem.map((img) => ({
                      id: 's3_' + ((img.s3Key || img.filename) || '').replace(/[^a-zA-Z0-9_-]/g, '_'),
                      imageId: img.imageId || null,
                      s3Key: img.s3Key,
                      // Only allow retrieval via CloudFront signed URL
                      preview: img.cloudfrontSignedUrl || null,
                      filename: img.filename,
                      contentType: img.contentType,
                      filesize: img.filesize,
                      uploadedAt: img.uploadedAt,
                      uploadedBy: img.uploadedBy,
                      status: 'uploaded'
                    }));

                    const existingKeys = new Set(existing.map((p: any) => p.s3Key || p.preview || p.filename));
                    const deduped = newPhotos.filter((p) => !existingKeys.has(p.s3Key || p.preview || p.filename));

                    return { ...it, photos: [...existing, ...deduped] };
                  });
                });
              } catch (e) {
                console.warn('Error fetching images from DB:', e);
              }
            })();
          }
        } catch (e) {
          console.warn('Failed to load saved inspection items:', e);
        }
      } finally {
        setLoadingSaved(false);
      }
    };

    loadSaved();
  }, [existingInspection, inspectionId, room.id]);

  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    // Prevent double-submit via synchronous ref check
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);

    const inspId = inspectionId || existingInspection?.id || generateInspectionId();

    // Upload pending photos (if any) before saving the inspection
    const uploadPendingPhotos = async () => {
      for (const it of inspectionItems) {
        const itemPhotos: any[] = (it.photos || []) as any[];
        if (!itemPhotos || itemPhotos.length === 0) continue;
        const updatedPhotos = [...itemPhotos];
        let changed = false;
        for (let pi = 0; pi < itemPhotos.length; pi++) {
          const p = itemPhotos[pi] as any;
          if (p && p.file) {
            // upload this file
            try {
              // mark as uploading
              updatedPhotos[pi] = { ...p, status: 'uploading' };
              updateItem(it.id, { photos: updatedPhotos });

              // request signed url
              const signData = await signUpload({
                inspectionId: inspId,
                venueId: venue.id,
                roomId: room.id,
                itemId: it.id,
                filename: p.filename,
                contentType: p.contentType,
                fileSize: p.filesize,
                uploadedBy: (user && user.name) || 'unknown'
              });
              const key = signData.key;

              // POST using presigned form if provided (avoids preflight)
              if (signData.post && signData.post.url && signData.post.fields) {
                const form = new FormData();
                Object.entries(signData.post.fields).forEach(([k, v]) => {
                  form.append(k, v as any);
                });
                form.append('file', p.file as Blob);

                const postResp = await fetch(signData.post.url, { method: 'POST', body: form });
                if (!(postResp.ok || postResp.status === 204 || postResp.status === 201)) throw new Error('Failed to upload to S3 via POST');

                // slight delay for consistency
                await new Promise(resolve => setTimeout(resolve, 500));
              } else if (signData.uploadUrl) {
                // fallback to old PUT flow if backend returns uploadUrl
                const uploadUrl = signData.uploadUrl;
                const putResp = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': p.contentType }, body: p.file });
                if (!putResp.ok) throw new Error('Failed to upload to S3');
                await new Promise(resolve => setTimeout(resolve, 500));
              } else {
                throw new Error('Signing response missing upload instructions');
              }
              await new Promise(resolve => setTimeout(resolve, 500)); // slight delay to ensure S3 consistency

              // register metadata
              const reg = await registerImage({
                key,
                imageId: p.id,
                inspectionId: inspId,
                venueId: venue.id,
                roomId: room.id,
                itemId: it.id,
                filename: p.filename,
                contentType: p.contentType,
                filesize: p.filesize,
                uploadedBy: (user && user.name) || 'unknown'
              });

              // replace photo entry with registered metadata
              // Preserve local blob preview (p.preview) when server does not return a preview URL
              updatedPhotos[pi] = {
                id: p.id,
                imageId: reg.imageId || reg.item?.imageId || null,
                s3Key: reg.item?.s3Key || key,
                preview: reg.previewUrl || p.preview || null,
                filename: p.filename,
                contentType: p.contentType,
                filesize: p.filesize,
                uploadedBy: (user && user.name) || 'unknown',
                status: 'uploaded'
              };

              updateItem(it.id, { photos: updatedPhotos });
              changed = true;
            } catch (e) {
              console.error('Failed to upload/register photo for item', it.id, e);
              alert('Failed to upload one or more photos. Save aborted. See console.');
              throw e;
            }
          }
        }
        if (changed) {
          // ensure state updated (already updated inside loop)
        }
      }
    };

    try {
      // First, upload any pending photos
      await uploadPendingPhotos();
    } catch (err) {
      console.error('Failed to upload pending photos:', err);
      alert('Failed to upload photos. Save aborted. See console.');
      // Abort save flow: clear saving and submission lock
      setSaving(false);
      submittingRef.current = false;
      return;
    }

    // Send 'in-progress' as the client-declared status. The server will authoritative mark
    // the inspection as completed only after verifying all venue-prescribed items are PASS.
    const inspectionToSubmit: Inspection = {
      id: inspId,
      venueId: venue.id,
      venueName: venue.name,
      roomId: room.id,
      roomName: room.name,
      updatedBy: displayName,
      items: inspectionItems,
      status: 'in-progress' as any,
    };

    // send to backend (no photos)
    try {
      // Use the consolidated inspections mutation endpoint
      const payload = {
        action: 'save_inspection',
        inspection: {
          id: inspectionToSubmit.id,
          venueId: inspectionToSubmit.venueId,
          venueName: inspectionToSubmit.venueName,
          roomId: inspectionToSubmit.roomId,
          roomName: inspectionToSubmit.roomName,
          updatedBy: inspectionToSubmit.updatedBy,
          items: inspectionToSubmit.items.map((it: any) => ({ itemId: it.id, status: it.status, notes: it.notes, itemName: it.name, order: it.order, images: (it.photos || []).filter((p: any) => p.imageId).map((p: any) => ({ imageId: p.imageId, s3Key: p.s3Key, filename: p.filename })) }))
        }
      };

      const res = await fetch(API.inspections, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to save inspection:', res.status, text);
        alert('Failed to save inspection. See console.');
      } else {
        // Some browsers (notably iOS WebKit) may reject `res.json()` for empty or otherwise inaccessible bodies
        // and throw a TypeError. Be resilient: read text and parse JSON if possible, otherwise proceed.
        let data: any = null;
        try {
          const text = await res.text();
          if (text) {
            try { data = JSON.parse(text); } catch (e) { console.warn('Non-JSON save_inspection response, returning raw text', e, text); data = text; }
          } else {
            data = {};
          }
        } catch (e) {
          console.warn('Failed to read save_inspection response body', e);
          data = null;
        }

        console.log('save_inspection response', data);
        // do not navigate away on Save; show brief confirmation instead (global toast)
        show('Saved', { variant: 'success' });
        // Use the context-based refresh to notify interested views (Home, History, RoomList)
        // that server-side state changed. We call `triggerRefresh()` here instead of a global
        // DOM event so that refresh intent remains explicit and testable.
        try {
          triggerRefresh?.();
        } catch (e) {
          /* ignore */
        }
      }
    } catch (err) {
      console.error('Error saving inspection:', err);
      alert('Error saving inspection. See console.');
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const completedCount = inspectionItems.filter((item) => item.status !== 'pending').length;
  const passCount = inspectionItems.filter((item) => item.status === 'pass').length;
  const failCount = inspectionItems.filter((item) => item.status === 'fail').length;
  const naCount = inspectionItems.filter((item) => item.status === 'na').length;
  const pendingCount = inspectionItems.filter((item) => item.status === 'pending').length;

  const isBusy = saving || loadingSaved;

  // Items no longer have categories; render a flat list

  const handlePhotoUpload = (id: string, file: File) => {
    if (isReadOnly || saving || loadingSaved) return; // No uploads in read-only or while busy
    // Accept file and create a preview; actual upload will occur on Save
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_BYTES) {
      alert('File too large (max 5 MB)');
      return;
    }

    const preview = URL.createObjectURL(file);
    const photoObj = { id: makePhotoId(), file, preview, status: 'pending', filename: file.name, contentType: file.type, filesize: file.size } as any;

    const currentPhotos = inspectionItems.find(i => i.id === id)?.photos || [];
    updateItem(id, { photos: [...currentPhotos, photoObj] });
  };

  const fetchItemImages = async (itemId: string) => {
    try {
      const resp = await fetch(API.listImagesDb, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId: inspectionId, roomId: room.id, signed: true })
      });
      if (!resp.ok) {
        console.warn('Failed to fetch images for item:', resp.status);
        return;
      }
      const data = await resp.json();
      const images: any[] = data.images || [];
      const mapped = images.map((img) => ({
        id: 's3_' + ((img.s3Key || img.publicUrl || img.filename) || '').replace(/[^a-zA-Z0-9_-]/g, '_'),
        imageId: img.imageId,
        s3Key: img.s3Key,
        preview: img.cloudfrontSignedUrl || null,
        filename: img.filename,
        contentType: img.contentType,
        filesize: img.filesize,
        uploadedAt: img.uploadedAt,
        uploadedBy: img.uploadedBy,
        status: 'uploaded'
      }));

      setInspectionItems((prev) => prev.map((it) => it.id === itemId ? { ...it, photos: [ ...(it.photos || []).filter((p: any) => p.file), ...mapped ] } : it ));
    } catch (e) {
      console.warn('Error fetching images for item:', e);
    }
  };

  const removePhoto = async (id: string, index: number) => {
    if (isReadOnly) return; // No deletes in read-only mode
    const currentPhotos = inspectionItems.find(i => i.id === id)?.photos || [];
    const toRemove = currentPhotos[index];

    // If this photo has been uploaded (persisted), perform delete flow: delete from S3 then remove DB metadata
    if (toRemove && typeof toRemove !== 'string' && (toRemove.s3Key || toRemove.imageId)) {
      // Do not remove locally until server confirms — show modal confirm first
      const confirmed = await confirm({ title: 'Delete image', message: 'Delete this image? This will remove it permanently.', confirmLabel: 'Delete', cancelLabel: 'Cancel' });
      if (!confirmed) return;

      const effectiveInspectionId = inspectionId || existingInspection?.id;
      if (!effectiveInspectionId) {
        alert('Cannot delete image: missing inspection id');
        return;
      }

      try {
        // Prefer calling delete-by-db-entry which will find the s3Key then delete the object
        const deleteS3Resp = await fetch(API.deleteS3ByDbEntry, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionId: effectiveInspectionId, roomId: room.id, itemId: id, imageId: toRemove.imageId, s3Key: toRemove.s3Key })
        });
        if (!deleteS3Resp.ok) throw new Error('Failed to delete object from S3');

        // Now delete the metadata record
        const delDbResp = await fetch(API.deleteImageDb, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionId: effectiveInspectionId, roomId: room.id, itemId: id, imageId: toRemove.imageId, s3Key: toRemove.s3Key })
        });
        if (!delDbResp.ok) throw new Error('Failed to delete image metadata');

        // On success, refresh images for this item from DB and keep any pending local photos
        await fetchItemImages(id);
        show('Image deleted', { variant: 'success' });
      } catch (e) {
        console.error('Failed to delete image:', e);
        alert('Failed to delete image. See console.');
      }
      return;
    }

    // Local-only photo (not uploaded) — just remove and revoke preview
    if (toRemove && typeof toRemove !== 'string' && toRemove.preview && typeof toRemove.preview === 'string' && toRemove.preview.startsWith('blob:')) {
      try { URL.revokeObjectURL(toRemove.preview); } catch (e) { /* ignore */ }
    }

    updateItem(id, { photos: currentPhotos.filter((_, i) => i !== index) });
  };

  useEffect(() => {
    return () => {
      inspectionItems.forEach(it => {
        (it.photos || []).forEach((p: any) => {
          if (p && p.preview && typeof p.preview === 'string' && p.preview.startsWith('blob:')) {
            try { URL.revokeObjectURL(p.preview); } catch (e) { /* ignore */ }
          }
        });
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-white pb-24 lg:pb-32">
      <LoadingOverlay visible={saving || loadingSaved} message={loadingSaved ? 'Loading…' : 'Saving…'} />
      <div className="max-w-5xl mx-auto">
        <InspectionHeader
          roomName={room.name}
          venueName={venue.name}
          itemsCount={room.items?.length || 0}
          existingInspection={existingInspection}
          isReadOnly={isReadOnly}
          onBack={onBack}
        />

        <InspectionProgress
          completedCount={completedCount}
          totalCount={inspectionItems.length}
          passCount={passCount}
          failCount={failCount}
          naCount={naCount}
          pendingCount={pendingCount}
        />

        {/* Inspection Items */}
        <div className="p-4">
          {/* Search bar */}
          <div className="mb-4">
            <label htmlFor="item-search" className="sr-only">Search items</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                id="item-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items…"
                className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                aria-label="Search inspection items"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1"><NumberFlow value={filteredItems.length ?? null} className="inline-block" /> of <NumberFlow value={inspectionItems.length ?? null} className="inline-block" /> items</div>
          </div>

          {filteredItems.map((item) => (
            <InspectionItemCard
              key={item.id}
              item={item}
              debouncedQuery={debouncedQuery}
              highlightMatch={highlightMatch}
              isReadOnly={isReadOnly}
              isBusy={isBusy}
              updateItem={updateItem}
              removePhoto={removePhoto}
              handlePhotoUpload={handlePhotoUpload}
              openLightbox={openLightbox}
            />
          ))}
        </div>

        {/* Fixed Bottom Button (hidden in read-only) */}
        {!isReadOnly && (
          <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t max-w-md mx-auto">
            <button
              onClick={handleSubmit}
              disabled={completedCount === 0 || isBusy}
              className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                completedCount === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Save className="w-5 h-5" />
              <span>{existingInspection ? 'Update Inspection' : 'Save Inspection'}</span>
            </button>
          </div>
        )}


      </div>

      <Lightbox open={lightboxOpen} images={lightboxImages} index={lightboxIndex} onClose={closeLightbox} onPrev={prevLightbox} onNext={nextLightbox} />
    </div>
  );
}