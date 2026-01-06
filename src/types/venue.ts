// Canonical venue types
// Prefer camelCase across the wire and in code

export interface Venue {
  id: string;
  name: string;
  address: string;
  rooms: Room[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Room {
  id: string;
  name: string;
  items: RoomItem[];
}

export interface RoomItem {
  id: string;
  name: string;
}
