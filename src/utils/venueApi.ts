export async function getVenues() {
  console.log('[venueApi] getVenues called');
  try {
    const res = await fetch('https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-query', {
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
    return items;
  } catch (e) {
    console.warn('getVenues failed', e);
    return [];
  }
}

export async function getVenueById(venueId: string) {
  if (!venueId) return null;
  try {
    const items = await getVenues();
    return items.find((v: any) => String(v.venueId || v.id) === String(venueId)) || null;
  } catch (e) {
    console.warn('getVenueById failed', e);
    return null;
  }
}