import { useState } from 'react';
import { useToast } from './ToastProvider';
import { ArrowLeft, Building2, Plus, Trash2, Save, Minus } from 'lucide-react';
import { Venue, Room } from '../App';
import { localIso } from '../utils/time';

const API_BASE = 'https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-create'; // consolidated venues-create endpoint

interface VenueFormProps {
  venue: Venue | null;
  onSave: (venue: Venue, isEdit?: boolean) => void;
  onBack: () => void;
  isEdit: boolean;
}

export function VenueForm({ venue, onSave, onBack, isEdit }: VenueFormProps) {
  const [name, setName] = useState(venue?.name || '');
  const [address, setAddress] = useState(venue?.address || '');
  // Rooms now include items: { id, name }
  const [rooms, setRooms] = useState<any[]>(
    venue?.rooms?.map((r: any) => ({ ...r, items: r.items || [] })) || [{ id: generateId('r'), name: '', items: [] }]
  );

  function generateId(prefix: string) {
    // Use crypto.randomUUID when available
    try {
      const u = (crypto as any).randomUUID ? (crypto as any).randomUUID().replace(/-/g, '') : Math.random().toString(36).substr(2, 16);
      return `${prefix}-${u.slice(0, 8)}`;
    } catch (e) {
      return `${prefix}-${Math.random().toString(36).substr(2, 8)}`;
    }
  }

  const handleAddRoom = () => {
    setRooms([...rooms, { id: generateId('r'), name: '', items: [] }]);
  }; 

  const handleRemoveRoom = (index: number) => {
    if (rooms.length > 1) {
      setRooms(rooms.filter((_, i) => i !== index));
    }
  };

  const handleRoomChange = (index: number, value: string) => {
    setRooms(
      rooms.map((room, i) => (i === index ? { ...room, name: value } : room))
    );
  }; 

  // Items within a room
  const handleAddItem = (roomIndex: number) => {
    setRooms(
      rooms.map((room, i) =>
        i === roomIndex
          ? { ...room, items: [...(room.items || []), { id: generateId('i'), name: '' }] }
          : room
      )
    );
  };

  const handleRemoveItem = (roomIndex: number, itemIndex: number) => {
    setRooms(
      rooms.map((room, i) =>
        i === roomIndex
          ? { ...room, items: room.items.filter((_: any, idx: number) => idx !== itemIndex) }
          : room
      )
    );
  };

  const handleItemChange = (roomIndex: number, itemIndex: number, value: string) => {
    setRooms(
      rooms.map((room, i) =>
        i === roomIndex
          ? { ...room, items: room.items.map((it: any, idx: number) => (idx === itemIndex ? { ...it, name: value } : it)) }
          : room
      )
    );
  };

  const [saving, setSaving] = useState(false);
  const { show, confirm } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !address.trim()) {
      alert('Please fill in venue name and address');
      return;
    }

    const hasEmptyRooms = rooms.some((room) => !room.name.trim());
    if (hasEmptyRooms) {
      alert('Please fill in all room details');
      return;
    }

    // Confirm on edit
    if (isEdit) {
      const confirmed = await confirm({
        title: 'Save changes',
        message: `Save changes to ${name}?`,
        confirmLabel: 'Save changes',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
    }

    // Prepare payload for backend
    const venueId = venue?.id || generateId('v');
    const payload = {
      venueId,
      name: name.trim(),
      address: address.trim(),
      createdAt: venue?.createdAt || localIso(),
      updatedAt: localIso(),
      createdBy: venue?.createdBy || 'Current User',
      rooms: rooms.map((room) => ({
        roomId: room.id || generateId('r'),
        name: room.name.trim(),
        items: (room.items || []).length > 0 ? (room.items || []).map((it: any) => ({ itemId: it.id || generateId('i'), name: it.name.trim() })) : [{ itemId: generateId('i'), name: 'General check' }]
      })),

    };

    try {
      setSaving(true);
      // Single endpoint: send action in body and always POST to API_BASE
      const action = isEdit ? 'update_venue' : 'create_venue';
      // Debug log payload
      console.log('Sending create/update payload', { action, venue: payload });

      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, venue: payload }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to save venue:', res.status, text);
        alert('Failed to save venue. See console.');
        return;
      }

      const data = await res.json();
      // data may be proxy { body }
      const saved = data.venue || (data.body ? JSON.parse(data.body).venue : null) || payload;

      // Call parent handler with saved venue
      const savedVenue = {
        id: saved.venueId || payload.venueId,
        name: saved.name,
        address: saved.address,
        rooms: (saved.rooms || []).map((r: any) => ({ id: r.roomId, name: r.name, items: (r.items || []).map((it: any) => ({ id: it.itemId || it.id, name: it.name })) })),
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        createdBy: saved.createdBy,
      };

      onSave(savedVenue, isEdit);

      // Show toast only when backend explicitly indicates an update
      let messageText: string | null = null;
      if (data && data.message) messageText = String(data.message);
      else if (data && data.body) {
        try {
          const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          if (parsed && parsed.message) messageText = String(parsed.message);
        } catch (e) {
          // ignore parse error
        }
      }

      if (isEdit && messageText && messageText.toLowerCase().includes('updated')) {
        show('Venue updated', { variant: 'success' });
      } else if (!isEdit) {
        try { show('Venue saved', { variant: 'success' }); } catch (e) { /* ignore */ }
      }

    } catch (err) {
      console.error('Error saving venue:', err);
      alert('Error saving venue. See console.');
    } finally {
      setSaving(false);
    }
  };



  return (
    <div className="max-w-md mx-auto min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="bg-blue-600 text-white p-6 pb-8 sticky top-0 z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 lg:w-10 lg:h-10" />
          <h1 className="text-xl lg:text-3xl">{isEdit ? 'Edit Facility' : 'Add New Facility'}</h1>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 lg:p-6 space-y-6 lg:space-y-8">
        {/* Venue Details */}
        <div>
          <h2 className="text-gray-700 uppercase tracking-wide text-sm mb-3">Facility Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-700 mb-2">Facility Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Downtown Office Complex"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2">Address *</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g., 123 Main Street"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                required
              />
            </div>
          </div>
        </div>

        {/* Rooms */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-700 uppercase tracking-wide text-sm">Rooms</h2>
            <button
              type="button"
              onClick={handleAddRoom}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Room</span>
            </button>
          </div>
          <div className="space-y-3">
            {rooms.map((room, index) => (
              <div key={room.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-600 text-sm">Room {index + 1}</span>
                  {rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRoom(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-700 text-sm mb-1">Room Name *</label>
                    <input
                      type="text"
                      value={room.name}
                      onChange={(e) => handleRoomChange(index, e.target.value)}
                      placeholder="e.g., Conference Room A"
                      className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    {/* Items list */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-gray-700 text-sm">Items</label>
                        <button type="button" onClick={() => handleAddItem(index)} className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1">
                          <Plus className="w-4 h-4" />
                          <span className="text-xs">Add Item</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(room.items || []).map((it: any, idx: number) => (
                          <div key={it.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={it.name}
                              onChange={(e) => handleItemChange(index, idx, e.target.value)}
                              placeholder="e.g., Extinguisher"
                              className="flex-1 p-2 border border-gray-300 rounded text-sm text-gray-900"
                            />
                            <button type="button" onClick={() => handleRemoveItem(index, idx)} className="text-red-600 hover:text-red-700 p-2">
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {(!room.items || room.items.length === 0) && (
                          <div className="text-xs text-gray-500">No items yet. Use "Add Item" to start.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 lg:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t max-w-4xl mx-auto">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className={`w-full py-3 lg:py-4 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm lg:text-base ${saving ? 'bg-gray-300 text-gray-700 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          <Save className="w-5 h-5" />
          <span>{saving ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Facility')}</span>
        </button>
      </div>
    </div>
  );
}