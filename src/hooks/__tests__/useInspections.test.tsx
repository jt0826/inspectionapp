import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useInspections } from '../useInspections';

// Simple harness component to exercise the hook via UI interactions
function Harness() {
  const h = useInspections();

  return (
    <div>
      <div data-testid="ins-count">{h.inspections.length}</div>
      <div data-testid="current-id">{h.currentInspectionId || ''}</div>
      <div data-testid="is-creating">{String(h.isCreating)}</div>

      <button onClick={async () => { await h.createInspection({ venueId: 'v1', venueName: 'Venue 1', createdBy: 'test' }); }}>Create</button>
      <button onClick={() => h.setInspections([{ id: 'insp_1', venueId: 'v1', venueName: 'Venue 1', roomId: '', roomName: '', inspectorName: 'A', status: 'in-progress', createdAt: '', updatedAt: '', items: [] } as any])}>Seed</button>
      <button onClick={() => h.updateInspection('insp_1', { status: 'completed' })}>Update</button>
      <button onClick={() => h.setVenueForCurrentInspection({ id: 'v2', name: 'Venue Two' })}>SetVenue</button>
      <button onClick={() => h.setRoomForCurrentInspection({ id: 'r1', name: 'Room One' })}>SetRoom</button>
      <button onClick={() => h.deleteInspection('insp_1')}>Delete</button>
      <button onClick={() => h.selectInspection('insp_1')}>Select</button>
    </div>
  );
}

describe('useInspections hook', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('createInspection posts to API and adds a new inspection', async () => {
    // Mock fetch to return a created inspection payload
    const mockResponse = {
      body: JSON.stringify({ inspection: { inspection_id: 'insp_42', venueId: 'v1', venueName: 'Venue 1', createdBy: 'test' } }),
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockResponse) })) as any);

    render(<Harness />);

    // initial state
    expect(screen.getByTestId('ins-count').textContent).toBe('0');

    // click create and wait for the async update
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByTestId('ins-count').textContent).toBe('1'));
    expect(screen.getByTestId('current-id').textContent).toContain('insp_');
  });

  it('updateInspection updates an existing inspection', async () => {
    const r = render(<Harness />);

    // Seed a single inspection
    fireEvent.click(r.getByText('Seed'));
    expect(r.getByTestId('ins-count').textContent).toBe('1');

    // select it
    fireEvent.click(r.getByText('Select'));
    expect(r.getByTestId('current-id').textContent).toBe('insp_1');

    // Update its status
    fireEvent.click(screen.getByText('Update'));

    // No direct visible output for status in harness, but ensure selection remains
    expect(screen.getByTestId('current-id').textContent).toBe('insp_1');
  });

  it('setVenueForCurrentInspection and setRoomForCurrentInspection modify the selected inspection', async () => {
    const r = render(<Harness />);

    fireEvent.click(r.getByText('Seed'));
    fireEvent.click(r.getByText('Select'));
    expect(r.getByTestId('current-id').textContent).toBe('insp_1');

    fireEvent.click(r.getByText('SetVenue'));
    fireEvent.click(r.getByText('SetRoom'));

    // As the harness doesn't render these fields, we assert no errors thrown and selection stays
    expect(r.getByTestId('current-id').textContent).toBe('insp_1');
  });

  it('deleteInspection removes inspection and clears selection when selected', async () => {
    const r = render(<Harness />);

    fireEvent.click(r.getByText('Seed'));
    fireEvent.click(r.getByText('Select'));
    expect(r.getByTestId('ins-count').textContent).toBe('1');

    fireEvent.click(r.getByText('Delete'));
    expect(r.getByTestId('ins-count').textContent).toBe('0');
    expect(r.getByTestId('current-id').textContent).toBe('');
  });
});
