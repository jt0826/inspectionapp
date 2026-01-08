import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  open: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function Lightbox({ open, images, index, onClose, onPrev, onNext }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
      role="dialog"
      aria-modal="true"
      onClick={() => onClose()}
    >
      <div className="absolute top-4 right-4">
        <button onClick={() => onClose()} aria-label="Close image" className="p-2 text-white bg-black bg-opacity-20 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute left-4">
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Previous image" className="p-2 text-white bg-black bg-opacity-20 rounded">
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="relative max-w-[90vw] max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
        <img src={images[index]} alt={`Image ${index + 1}`} className="max-w-full max-h-[80vh] object-contain rounded shadow-lg bg-white" />
      </div>

      <div className="absolute right-4">
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Next image" className="p-2 text-white bg-black bg-opacity-20 rounded">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
