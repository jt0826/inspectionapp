import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Save, Camera, X } from 'lucide-react';
import { Venue, Room, InspectionItem, Inspection } from '../App';
import { useAuth } from '../contexts/AuthContext';
import { getInspectionItems } from '../utils/inspectionApi';
import { useToast } from './ToastProvider';

interface InspectionFormProps {
  venue: Venue;
  room: Room;
  onBack: () => void;
  onSubmit: (inspection: Inspection) => void;
  existingInspection?: Inspection | null;
  inspectionId?: string;
  readOnly?: boolean;
}

const defaultInspectionItems: Omit<InspectionItem, 'status' | 'notes' | 'photos'>[] = [
  { id: '1', item: 'Fire extinguisher present and accessible' },
  { id: '2', item: 'Emergency exit signs illuminated' },
  { id: '3', item: 'Exit paths clear and unobstructed' },
  { id: '4', item: 'First aid kit available' },
  { id: '5', item: 'Floors clean and free of debris' },
  { id: '6', item: 'Walls and surfaces clean' },
  { id: '7', item: 'No signs of pests or infestation' },
  { id: '8', item: 'Lighting functional' },
  { id: '9', item: 'HVAC system operational' },
  { id: '10', item: 'Doors and locks functioning properly' },
  { id: '11', item: 'Windows intact and clean' },
  { id: '12', item: 'Furniture in good condition' },
  { id: '13', item: 'Electrical outlets functional' },
  { id: '14', item: 'ADA accessibility requirements met' },
  { id: '15', item: 'Required signage posted' },
 ];

const makePhotoId = () => 'ph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9);

// Ensure any incoming item-like object is normalized to the InspectionItem shape
const normalizeItem = (it: any): InspectionItem => ({
  id: it.id || it.itemId || it.ItemId || ('item_' + Math.random().toString(36).substr(2, 9)),
  item: it.itemName || it.item || it.ItemName || it.name || '',
  status: (it.status || 'pending').toString().toLowerCase() as any,
  photos: it.photos || [],
  notes: it.comments || it.notes || ''
});

export function InspectionForm({ venue, room, onBack, onSubmit, existingInspection, inspectionId, readOnly = false }: InspectionFormProps) {
  const { user } = useAuth();

  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>(() => {
    // If editing an existing inspection, use its items (normalized to ensure stable ids)
    if (existingInspection && existingInspection.items.length > 0) {
      return existingInspection.items.map((it: any) => normalizeItem(it));
    }

    // Prefer room items from the venue (coming from DB). Fall back to default list if none.
    if (room && Array.isArray((room as any).items) && (room as any).items.length > 0) {
      return (room as any).items.map((it: any) => ({
        id: it.itemId || it.id || ('item_' + Math.random().toString(36).substr(2, 9)),
        item: it.name || it.item || '',
        status: 'pending' as const,
        photos: [],
        notes: '',
      }));
    }

    return defaultInspectionItems.map((item) => ({
      ...item,
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      status: 'pending' as const,
      photos: [],
      notes: '',
    }));
  });



  const updateItem = (
    id: string,
    updates: Partial<Pick<InspectionItem, 'status' | 'notes' | 'photos'>>
  ) => {
    if (readOnly) return; // no-op in read-only mode
    setInspectionItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, ...updates } : item));
      return updated;
    });
  };

  const [saving, setSaving] = useState(false);
  const { show, confirm } = useToast();

  // Load saved items when resuming an inspection or when an existingInspection prop is provided
  useEffect(() => {
    const mapDbItem = (it: any): InspectionItem => ({
      id: it.itemId || it.item || it.ItemId || ('item_' + Math.random().toString(36).substr(2,9)),
      item: it.itemName || it.item || it.ItemName || it.name || '',
      // Normalize status from backend to lower-case and default to 'pending'
      status: (it.status || 'pending').toString().toLowerCase(),
      photos: it.photos || [],
      notes: it.comments || it.notes || ''
    });

    // If an existing inspection object is provided by parent, use it (normalize to ensure stable ids)
    if (existingInspection && Array.isArray(existingInspection.items) && existingInspection.items.length > 0) {
      setInspectionItems(existingInspection.items.map((it: any) => normalizeItem(it)) as InspectionItem[]);
      return;
    }

    // Otherwise, if an inspectionId exists (resuming), fetch saved items for this inspection + room
    const loadSaved = async () => {
      if (!inspectionId) return;
      try {
        let items = await getInspectionItems(inspectionId);
        if (!items) return;
        items = (items as any[]).filter((it) => String(it.roomId || it.room_id || it.room || '') === String(room.id));
        // Filter out meta rows / non-item rows that lack an identifier
        items = items.filter((it: any) => (it.itemId || it.item || it.ItemId || it.id));
        if (items && items.length > 0) {
          const mapped = items.map((it: any) => mapDbItem(it));
          setInspectionItems(mapped);

          // Also fetch registered images metadata for this inspection + room from the DB
          (async () => {
            try {
              const resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/list-images-db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inspectionId: inspectionId, roomId: room.id })
              });
              if (!resp.ok) {
                console.warn('Failed to fetch images from DB:', resp.status);
                return;
              }
              const data = await resp.json();
              const images: any[] = data.images || [];
              if (images.length === 0) return;

              // Merge images into corresponding items by itemId
              setInspectionItems((prev) => {
                return prev.map((it) => {
                  const existing = it.photos || [];
                  const imgsForItem = images.filter((img) => String(img.itemId) === String(it.id));
                  const newPhotos = imgsForItem.map((img) => ({
                    id: 's3_' + ((img.s3Key || img.publicUrl || img.filename) || '').replace(/[^a-zA-Z0-9_-]/g, '_'),
                    imageId: img.imageId || null,
                    s3Key: img.s3Key,
                    preview: img.publicUrl, // public S3 URL
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
    };

    loadSaved();
  }, [existingInspection, inspectionId, room.id]);

  const handleSubmit = async () => {
    const inspId = inspectionId || existingInspection?.id || 'insp_' + Date.now();

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
              const signResp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/sign-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  inspectionId: inspId,
                  venueId: venue.id,
                  roomId: room.id,
                  itemId: it.id,
                  filename: p.filename,
                  contentType: p.contentType,
                  fileSize: p.filesize,
                  uploadedBy: (user && user.name) || 'unknown'
                })
              });
              if (!signResp.ok) throw new Error('Failed to obtain signed URL');
              const signData = await signResp.json();
              const uploadUrl = signData.uploadUrl;
              const key = signData.key;

              // upload to s3
              const putResp = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': p.contentType }, body: p.file });
              if (!putResp.ok) throw new Error('Failed to upload to S3');
              await new Promise(resolve => setTimeout(resolve, 500)); // slight delay to ensure S3 consistency

              // register metadata
              const registerResp = await fetch(`https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/register-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  key,
                  inspectionId: inspId,
                  venueId: venue.id,
                  roomId: room.id,
                  itemId: it.id,
                  filename: p.filename,
                  contentType: p.contentType,
                  filesize: p.filesize,
                  uploadedBy: (user && user.name) || 'unknown',
                  uploadedAt: new Date().toISOString()
                })
              });
              if (!registerResp.ok) throw new Error('Failed to register image');
              const reg = await registerResp.json();

              // replace photo entry with registered metadata
              updatedPhotos[pi] = {
                id: p.id,
                imageId: reg.imageId || reg.item?.imageId || null,
                s3Key: reg.item?.s3Key || key,
                preview: reg.previewUrl || null,
                filename: p.filename,
                contentType: p.contentType,
                filesize: p.filesize,
                uploadedAt: new Date().toISOString(),
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
      // Abort save flow
      return;
    }

    const inspectionToSubmit: Inspection = {
      id: inspId,
      venueId: venue.id,
      venueName: venue.name,
      roomId: room.id,
      roomName: room.name,
      timestamp: new Date().toISOString(),
      inspectorName: user?.name || 'Unknown',
      items: inspectionItems,
      status: 'completed',
    };

    // send to backend (no photos)
    try {
      setSaving(true);
      // Use the consolidated inspections mutation endpoint
      const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections'; // single endpoint placeholder for saves

      const payload = {
        action: 'save_inspection',
        inspection: {
          id: inspectionToSubmit.id,
          inspection_id: inspectionToSubmit.id,
          venueId: inspectionToSubmit.venueId,
          venueName: inspectionToSubmit.venueName,
          roomId: inspectionToSubmit.roomId,
          roomName: inspectionToSubmit.roomName,
          timestamp: inspectionToSubmit.timestamp,
          inspectorName: inspectionToSubmit.inspectorName,
          items: inspectionToSubmit.items.map((it: any) => ({ itemId: it.id, status: it.status, notes: it.notes, itemName: it.item, order: it.order, images: (it.photos || []).filter((p: any) => p.imageId).map((p: any) => ({ imageId: p.imageId, s3Key: p.s3Key, filename: p.filename })) }))
        }
      };

      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to save inspection:', res.status, text);
        alert('Failed to save inspection. See console.');
      } else {
        const data = await res.json();
        console.log('save_inspection response', data);
        // do not navigate away on Save; show brief confirmation instead (global toast)
        show('Saved', { variant: 'success' });
        // Notify listeners so the home view can refresh counts/summary on any successful save
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('inspectionSaved', { detail: { inspectionId: inspectionToSubmit.id } }));
          }
        } catch (e) {
          /* ignore */
        }
      }
    } catch (err) {
      console.error('Error saving inspection:', err);
      alert('Error saving inspection. See console.');
    } finally {
      setSaving(false);
    }
  };

  const completedCount = inspectionItems.filter((item) => item.status !== 'pending').length;
  const passCount = inspectionItems.filter((item) => item.status === 'pass').length;
  const failCount = inspectionItems.filter((item) => item.status === 'fail').length;

  // Items no longer have categories; render a flat list

  const handlePhotoUpload = (id: string, file: File) => {
    if (readOnly) return; // No uploads in read-only mode
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
      const resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/list-images-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId: inspectionId, roomId: room.id, itemId })
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
        preview: img.publicUrl,
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
    if (readOnly) return; // No deletes in read-only mode
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
        const deleteS3Resp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/delete-s3-by-db-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionId: effectiveInspectionId, roomId: room.id, itemId: id, imageId: toRemove.imageId, s3Key: toRemove.s3Key })
        });
        if (!deleteS3Resp.ok) throw new Error('Failed to delete object from S3');

        // Now delete the metadata record
        const delDbResp = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/delete-image-db', {
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8 pb-8 lg:pb-10 sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Rooms</span>
          </button>
          <h1 className="mb-1">{room.name}</h1>
          <p className="text-blue-100 text-sm">
            {venue.name} • {room.items?.length || 0} items
          </p>
          {existingInspection && (
            <p className="text-blue-200 text-sm mt-1">
              {existingInspection.items.every(i => i.status === null || defaultInspectionItems.find(t => t.id === i.id)?.item !== i.item)
                ? 'Re-inspection (Failed Items Only)'
                : 'Editing existing inspection'}
            </p>
          )}
        </div>

        {/* Progress Stats */}
        <div className="p-4 bg-gray-50 border-b sticky top-0 lg:top-[140px] z-10">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-700">Progress</span>
            <span className="text-gray-900">
              {completedCount} / {inspectionItems.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${(completedCount / inspectionItems.length) * 100}%` }}
            />
          </div>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-gray-700">Pass: {passCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-gray-700">Fail: {failCount}</span>
            </div>
          </div>
        </div>

        {/* Inspection Items */}
        <div className="p-4">
          {inspectionItems.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4 mb-4">
                      <p className="text-gray-900 mb-3">{item.item}</p>

                      {/* Status Buttons */}
                      <div className="flex gap-2 mb-3">
                        <button
                        onClick={() => { if (!readOnly) updateItem(item.id, { status: 'pass' }); }}
                        disabled={readOnly}
                        className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                          item.status === 'pass'
                            ? 'bg-green-500 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                        } ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Pass</span>
                        </button>
                        <button
                          onClick={() => { if (!readOnly) updateItem(item.id, { status: 'fail' }); }}
                          disabled={readOnly}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                            item.status === 'fail'
                              ? 'bg-red-500 text-white border-red-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-red-500'
                          } ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Fail</span>
                        </button>
                        <button
                          onClick={() => { if (!readOnly) updateItem(item.id, { status: 'na' }); }}
                          disabled={readOnly}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                            item.status === 'na'
                              ? 'bg-gray-500 text-white border-gray-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                          } ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <MinusCircle className="w-4 h-4" />
                          <span>N/A</span>
                        </button>
                      </div>

                      {/* Notes */}
                      <textarea
                        value={item.notes}
                        onChange={(e) => { if (!readOnly) updateItem(item.id, { notes: e.target.value }); }}
                        placeholder="Add notes (optional)"
                        className={`w-full p-2 border border-gray-300 rounded text-sm resize-none ${readOnly ? 'bg-gray-100 text-gray-600' : 'focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900'}`}
                        rows={2}
                        readOnly={readOnly}
                      />

                      {/* Photo Upload */}
                      <div className="mt-3">
                        <label className="flex items-center gap-2 text-gray-700 text-sm mb-2">
                          <Camera className="w-4 h-4" />
                          <span>Add Photos</span>
                        </label>
                        
                        {/* Photo Grid */}
                        {item.photos.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            {item.photos.map((photo: any, photoIndex: number) => {
                              const src = typeof photo === 'string' ? photo : (photo.preview || photo.previewUrl || '');
                              return (
                                <div key={photo.id ?? photoIndex} className="relative group">
                                  <img
                                    src={src}
                                    alt={`Evidence ${photoIndex + 1}`}
                                    width={80}
                                    height={80}
                                    className="w-full h-20 object-cover rounded border border-gray-300"
                                  />
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      aria-label="Remove photo"
                                      onClick={() => removePhoto(item.id, photoIndex)}
                                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 shadow-md focus:outline-none touch-manipulation"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Upload Button (hidden in read-only) */}
                        {!readOnly && (
                          <div className="flex items-center gap-2">
                            {/* Take Photo (camera capture) */}
                            <label className="flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer text-sm text-gray-600">
                              <Camera className="w-4 h-4" />
                              <span>Take Photo</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handlePhotoUpload(item.id, file);
                                    e.target.value = '';
                                  }
                                }}
                                className="hidden"
                                aria-label={`Take photo for ${item.item}`}
                              />
                            </label>

                            {/* Choose existing photo from library */}
                            <label className="flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer text-sm text-gray-600">
                              <Camera className="w-4 h-4" />
                              <span>Choose from Library</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handlePhotoUpload(item.id, file);
                                    e.target.value = '';
                                  }
                                }}
                                className="hidden"
                                aria-label={`Choose photo for ${item.item}`}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
        </div>

        {/* Fixed Bottom Button (hidden in read-only) */}
        {!readOnly && (
          <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t max-w-md mx-auto">
            <button
              onClick={handleSubmit}
              disabled={completedCount === 0 || saving}
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
    </div>
  );
}