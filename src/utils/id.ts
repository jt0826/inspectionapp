export const generateId = (prefix: string): string => {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return `${prefix}_${(crypto as any).randomUUID().replace(/-/g, '')}`;
    }
  } catch (e) {
    // fall through to fallback
  }
  // Fallback for older browsers/environments
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
};

export const generateInspectionId = () => generateId('inspection');
export const generateVenueId = () => generateId('venue');
export const generateRoomId = () => generateId('room');
export const generateItemId = () => generateId('item');
export const generatePhotoId = () => generateId('photo');
