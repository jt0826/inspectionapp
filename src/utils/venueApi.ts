import { API } from '../config/api';

export async function getVenues() {
  console.log('[venueApi] getVenues called');
  try {
    const res = await fetch(API.venuesQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_venues' }),
    });
    const data = await res.json();
    console.log('[venueApi] getVenues raw:', data && (data.body || data));
    let items: any[] = [];
    if (Array.isArray(data)) items = data;
    else if (Array.isArray(data.venues)) items = data.venues;
    else if (data.body) {
      try {
        const parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
        items = parsed.venues || parsed.Items || parsed || [];
      } catch (e) {
        console.warn('Failed to parse venues.body', e);
        items = [];
      }
    }
    try {
      const { parseVenue } = await import('../schemas/venue');
      // Normalize each item
      const normalized = items.map((it: any) => parseVenue(it) || it);
      return normalized;
    } catch (e) {
      console.warn('getVenues: parse venue failed', e);
      return items;
    }
  } catch (e) {
    console.warn('getVenues failed', e);
    return [];
  }
}

export async function getVenueById(venueId: string) {
  if (!venueId) return null;
  try {
    const items = await getVenues();
    const found = items.find((v: any) => String(v.venueId || v.id) === String(venueId)) || null;
    if (!found) return null;
    try {
      const { parseVenue } = await import('../schemas/venue');
      return parseVenue(found) || found;
    } catch (e) {
      return found;
    }
  } catch (e) {
    console.warn('getVenueById failed', e);
    return null;
  }
}