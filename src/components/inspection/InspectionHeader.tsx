import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Inspection } from '../../types/inspection';

interface Props {
  roomName: string;
  venueName: string;
  itemsCount: number;
  existingInspection?: Inspection | null;
  isReadOnly: boolean;
  onBack: () => void;
  defaultInspectionItemsCount?: number;
  highlightReinspection?: boolean;
}

export default function InspectionHeader({ roomName, venueName, itemsCount, existingInspection, isReadOnly, onBack }: Props) {
  return (
    <div className="bg-blue-600 text-white p-6 lg:p-8 pb-8 lg:pb-10 sticky top-0 z-10">
      <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4">
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Rooms</span>
      </button>
      <h1 className="mb-1">{roomName}</h1>
      <p className="text-blue-100 text-sm">{venueName} • {itemsCount || 0} items</p>
      {existingInspection && (
        <p className="text-blue-200 text-sm mt-1">
          {isReadOnly ? 'Completed inspection (read-only)' : 'Editing existing inspection'}
        </p>
      )}
    </div>
  );
}
