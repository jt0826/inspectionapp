import React from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { InspectionItem } from '../../types/inspection';
import PhotoGrid from './PhotoGrid';

interface Props {
  item: InspectionItem;
  debouncedQuery: string;
  highlightMatch: (text: string, q: string) => React.ReactNode;
  isReadOnly: boolean;
  isBusy: boolean;
  updateItem: (id: string, updates: Partial<Pick<InspectionItem, 'status' | 'notes' | 'photos'>>) => void;
  removePhoto: (itemId: string, index: number) => void;
  handlePhotoUpload: (itemId: string, file: File) => void;
  openLightbox: (images: string[], idx: number) => void;
}

export default function InspectionItemCard({ item, debouncedQuery, highlightMatch, isReadOnly, isBusy, updateItem, removePhoto, handlePhotoUpload, openLightbox }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-900 mr-2">{debouncedQuery ? highlightMatch(item.name || '', debouncedQuery) : item.name}</p>
        {item.status === 'pending' && <span className="text-xs text-gray-500">Pending</span>}
      </div>

      {/* Status Buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => { if (!isReadOnly && !isBusy) updateItem(item.id, { status: 'pass' }); }}
          disabled={isReadOnly || isBusy}
          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
            item.status === 'pass'
              ? 'bg-green-500 text-white border-green-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
          } ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Pass</span>
        </button>
        <button
          onClick={() => { if (!isReadOnly && !isBusy) updateItem(item.id, { status: 'fail' }); }}
          disabled={isReadOnly || isBusy}
          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
            item.status === 'fail'
              ? 'bg-red-500 text-white border-red-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-red-500'
          } ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <XCircle className="w-4 h-4" />
          <span>Fail</span>
        </button>
        <button
          onClick={() => { if (!isReadOnly && !isBusy) updateItem(item.id, { status: 'na' }); }}
          disabled={isReadOnly || isBusy}
          className={`flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
            item.status === 'na'
              ? 'bg-gray-500 text-white border-gray-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
          } ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <MinusCircle className="w-4 h-4" />
          <span>N/A</span>
        </button>
      </div>

      {/* Notes */}
      <textarea
        value={item.notes}
        onChange={(e) => { if (!isReadOnly) updateItem(item.id, { notes: e.target.value }); }}
        placeholder="Add notes (optional)"
        className={`w-full p-2 border border-gray-300 rounded text-sm resize-none ${isReadOnly ? 'bg-gray-100 text-gray-600' : 'focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900'}`}
        rows={2}
        readOnly={isReadOnly || isBusy}
      />

      {/* Photo Upload + Grid */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-gray-700 text-sm mb-2">
          <CameraPlaceholder />
          <span>Add Photos</span>
        </label>

        <PhotoGrid
          photos={item.photos || []}
          itemName={item.name}
          isReadOnly={isReadOnly}
          isBusy={isBusy}
          onRemovePhoto={(index: number) => removePhoto(item.id, index)}
          onOpenLightbox={openLightbox}
          onChooseFile={(file: File) => handlePhotoUpload(item.id, file)}
          onTakePhoto={(file: File) => handlePhotoUpload(item.id, file)}
        />
      </div>
    </div>
  );
}

function CameraPlaceholder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M20 7h-3.586l-1.707-1.707A.996.996 0 0 0 14.586 5H9.414a.996.996 0 0 0-.707.293L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" stroke="#4B5563" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3" stroke="#4B5563" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
