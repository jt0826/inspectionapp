import { z } from 'zod';
import { toCamelCaseKeys } from '../utils/case';

export const RoomItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  items: z.array(RoomItemSchema).optional(),
});

export const VenueSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  address: z.string().optional(),
  rooms: z.array(RoomSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  createdBy: z.string().optional(),
});

export function parseVenue(raw: any) {
  try {
    // Normalize keys to camelCase first
    const t: any = toCamelCaseKeys(raw) || {};

    // Ensure top-level id is present (accept venueId as alias)
    if (!t.id && t.venueId) t.id = t.venueId;

    // Normalize rooms and their nested items (accept roomId/itemId aliases)
    if (Array.isArray(t.rooms)) {
      t.rooms = t.rooms.map((r: any) => {
        const room = toCamelCaseKeys(r) || {};
        if (!room.id && room.roomId) room.id = room.roomId;
        if (Array.isArray(room.items)) {
          room.items = room.items.map((it: any) => {
            const item = toCamelCaseKeys(it) || {};
            if (!item.id && item.itemId) item.id = item.itemId;
            return item;
          });
        }
        return room;
      });
    }

    return VenueSchema.parse(t);
  } catch (e) {
    console.warn('parseVenue failed', e, raw);
    return null;
  }
}
