import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Save, Camera, X } from 'lucide-react';
import { Venue, Room, InspectionItem, Inspection } from '../App';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastProvider';

interface InspectionFormProps {
  venue: Venue;
  room: Room;
  onBack: () => void;
  onSubmit: (inspection: Inspection) => void;
  existingInspection?: Inspection | null;
  inspectionId?: string;
}

const defaultInspectionItems: Omit<InspectionItem, 'status' | 'notes' | 'photos'>[] = [
  { id: '1', category: 'Safety', item: 'Fire extinguisher present and accessible' },
  { id: '2', category: 'Safety', item: 'Emergency exit signs illuminated' },
  { id: '3', category: 'Safety', item: 'Exit paths clear and unobstructed' },
  { id: '4', category: 'Safety', item: 'First aid kit available' },
  { id: '5', category: 'Cleanliness', item: 'Floors clean and free of debris' },
  { id: '6', category: 'Cleanliness', item: 'Walls and surfaces clean' },
  { id: '7', category: 'Cleanliness', item: 'No signs of pests or infestation' },
  { id: '8', category: 'Maintenance', item: 'Lighting functional' },
  { id: '9', category: 'Maintenance', item: 'HVAC system operational' },
  { id: '10', category: 'Maintenance', item: 'Doors and locks functioning properly' },
  { id: '11', category: 'Maintenance', item: 'Windows intact and clean' },
  { id: '12', category: 'Equipment', item: 'Furniture in good condition' },
  { id: '13', category: 'Equipment', item: 'Electrical outlets functional' },
  { id: '14', category: 'Compliance', item: 'ADA accessibility requirements met' },
  { id: '15', category: 'Compliance', item: 'Required signage posted' },
];

export function InspectionForm({ venue, room, onBack, onSubmit, existingInspection, inspectionId }: InspectionFormProps) {
  const { user } = useAuth();

  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>(() => {
    // If editing an existing inspection, use its items
    if (existingInspection && existingInspection.items.length > 0) {
      return existingInspection.items;
    }

    // Prefer room items from the venue (coming from DB). Fall back to default list if none.
    if (room && Array.isArray((room as any).items) && (room as any).items.length > 0) {
      return (room as any).items.map((it: any) => ({
        id: it.itemId || it.id || ('item_' + Math.random().toString(36).substr(2, 9)),
        category: it.category || 'General',
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
    setInspectionItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, ...updates } : item));
      return updated;
    });
  };

  const [saving, setSaving] = useState(false);
  const { show } = useToast();

  // Load saved items when resuming an inspection or when an existingInspection prop is provided
  useEffect(() => {
    const mapDbItem = (it: any): InspectionItem => ({
      id: it.itemId || it.item || it.ItemId || ('item_' + Math.random().toString(36).substr(2,9)),
      category: it.category || 'General',
      item: it.itemName || it.item || it.ItemName || it.name || '',
      // Normalize status from backend to lower-case and default to 'pending'
      status: (it.status || 'pending').toString().toLowerCase(),
      photos: it.photos || [],
      notes: it.comments || it.notes || ''
    });

    // If an existing inspection object is provided by parent, use it
    if (existingInspection && Array.isArray(existingInspection.items) && existingInspection.items.length > 0) {
      setInspectionItems(existingInspection.items as InspectionItem[]);
      return;
    }

    // Otherwise, if an inspectionId exists (resuming), fetch saved items for this inspection + room
    const loadSaved = async () => {
      if (!inspectionId) return;
      const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev';
      try {
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_inspection', inspection_id: inspectionId, roomId: room.id }),
        });
        if (!res.ok) return;
        const data = await res.json();
        let items = data.items || (data.body ? (JSON.parse(data.body).items || []) : []);
        if (items && items.length > 0) {
          const mapped = items.map(mapDbItem);
          setInspectionItems(mapped);
        }
      } catch (e) {
        console.warn('Failed to load saved inspection items:', e);
      }
    };

    loadSaved();
  }, [existingInspection, inspectionId, room.id]);

  const handleSubmit = async () => {
    const inspId = inspectionId || existingInspection?.id || 'insp_' + Date.now();
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
      const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev'; // single endpoint placeholder

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
          items: inspectionToSubmit.items.map((it) => ({ itemId: it.id, status: it.status, notes: it.notes, itemName: it.item }))
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
        // If backend reports it's fully complete (all PASS), notify listeners so the home view can refresh
        try {
          const isComplete = data && (data === true || data.complete === true || (typeof data.complete === 'object' && data.complete && data.complete.complete === true));
          if (isComplete) {
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

  const categories = Array.from(new Set(inspectionItems.map((item) => item.category)));

  const handlePhotoUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      updateItem(id, { photos: [...inspectionItems.find(i => i.id === id)?.photos || [], reader.result as string] });
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (id: string, index: number) => {
    const currentPhotos = inspectionItems.find(i => i.id === id)?.photos || [];
    updateItem(id, { photos: currentPhotos.filter((_, i) => i !== index) });
  };

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
        <div className="p-4 bg-gray-50 border-b sticky top-[140px] z-10">
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
          {categories.map((category) => (
            <div key={category} className="mb-6">
              <h2 className="text-gray-700 uppercase tracking-wide text-sm mb-3">{category}</h2>
              <div className="space-y-4">
                {inspectionItems
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <p className="text-gray-900 mb-3">{item.item}</p>

                      {/* Status Buttons */}
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => updateItem(item.id, { status: 'pass' })}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                            item.status === 'pass'
                              ? 'bg-green-500 text-white border-green-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Pass</span>
                        </button>
                        <button
                          onClick={() => updateItem(item.id, { status: 'fail' })}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                            item.status === 'fail'
                              ? 'bg-red-500 text-white border-red-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-red-500'
                          }`}
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Fail</span>
                        </button>
                        <button
                          onClick={() => updateItem(item.id, { status: 'na' })}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                            item.status === 'na'
                              ? 'bg-gray-500 text-white border-gray-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <MinusCircle className="w-4 h-4" />
                          <span>N/A</span>
                        </button>
                      </div>

                      {/* Notes */}
                      <textarea
                        value={item.notes}
                        onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                        placeholder="Add notes (optional)"
                        className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        rows={2}
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
                            {item.photos.map((photo, photoIndex) => (
                              <div key={photoIndex} className="relative group">
                                <img
                                  src={photo}
                                  alt={`Evidence ${photoIndex + 1}`}
                                  className="w-full h-20 object-cover rounded border border-gray-300"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePhoto(item.id, photoIndex)}
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Upload Button */}
                        <label className="flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer text-sm text-gray-600">
                          <Camera className="w-4 h-4" />
                          <span>Take Photo / Upload</span>
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
                          />
                        </label>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Fixed Bottom Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t max-w-md mx-auto">
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


      </div>
    </div>
  );
}