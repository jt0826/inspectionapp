import React from 'react';
import { Camera, X } from 'lucide-react';

interface PhotoGridProps {
  photos: any[];
  itemName: string;
  isReadOnly: boolean;
  isBusy: boolean;
  onRemovePhoto: (index: number) => void;
  onOpenLightbox: (images: string[], idx: number) => void;
  onChooseFile: (file: File) => void;
  onTakePhoto: (file: File) => void;
}

export default function PhotoGrid({ photos, itemName, isReadOnly, isBusy, onRemovePhoto, onOpenLightbox, onChooseFile, onTakePhoto }: PhotoGridProps) {
  return (
    <div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {photos.map((photo: any, photoIndex: number) => {
            let src: string | null = null;
            if (typeof photo === 'string') {
              src = photo;
            } else if (photo && (photo.file || (photo.preview && typeof photo.preview === 'string' && photo.preview.startsWith('blob:')))) {
              src = photo.preview;
            } else {
              src = (photo && photo.preview) || photo?.cloudfrontSignedUrl || null;
            }
            if (!src) return null;
            const photoKey = photo?.imageId ? `img_${photo.imageId}` : (photo?.id ? `img_${photo.id}` : `img_${photoIndex}`);
            return (
              <div key={photoKey} className="relative group">
                <img
                  src={src}
                  alt={`Evidence ${photoIndex + 1}`}
                  width={80}
                  height={80}
                  onClick={() => {
                    const imgs = photos.map((p: any) => {
                      if (typeof p === 'string') return p;
                      if (p && (p.file || (p.preview && typeof p.preview === 'string' && p.preview.startsWith('blob:')))) return p.preview;
                      return p.preview || p.cloudfrontSignedUrl || null;
                    }).filter(Boolean);
                    onOpenLightbox(imgs, imgs.indexOf(src));
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { const imgs = photos.map((p: any) => { if (typeof p === 'string') return p; if (p && (p.file || (p.preview && typeof p.preview === 'string' && p.preview.startsWith('blob:')))) return p.preview; return p.preview || p.cloudfrontSignedUrl || null; }).filter(Boolean); onOpenLightbox(imgs, imgs.indexOf(src)); } }}
                  className="cursor-pointer w-full h-20 object-contain object-center rounded border border-gray-300 bg-gray-100 p-0.5"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => onRemovePhoto(photoIndex)}
                    disabled={isReadOnly || isBusy}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 shadow-md focus:outline-none touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isReadOnly && !isBusy && (
        <div className="flex items-center gap-2">
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
                  onTakePhoto(file);
                  e.target.value = '';
                }
              }}
              className="hidden"
              aria-label={`Take photo for ${itemName}`}
            />
          </label>

          <label className="flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer text-sm text-gray-600">
            <Camera className="w-4 h-4" />
            <span>Choose from Library</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onChooseFile(file);
                  e.target.value = '';
                }
              }}
              className="hidden"
              aria-label={`Choose photo for ${itemName}`}
            />
          </label>
        </div>
      )}
    </div>
  );
}
