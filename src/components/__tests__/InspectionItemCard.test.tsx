import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import InspectionItemCard from '../inspection/InspectionItemCard';
import type { InspectionItem } from '../../types/inspection';

// Helper used to construct a minimal `InspectionItem` for testing. Tests can override fields by passing `overrides`.
const makeItem = (overrides?: Partial<InspectionItem>): InspectionItem => ({
  id: 'item1',
  name: 'Fire Extinguisher',
  status: 'pending',
  notes: '',
  photos: [],
  ...overrides,
});

// Test-suite for the `InspectionItemCard` component. Covers rendering, status changes, notes editing,
// photo display / lightbox behavior, and read-only interactions.
describe('InspectionItemCard', () => {
  // cleanup DOM and clear mocks after each test to avoid cross-test interference
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  // Verifies the component renders the item name, shows a Pending label when status is pending,
  // and that the Pass/Fail/N/A buttons are enabled when not read-only or busy.
  it('renders name, pending label and buttons enabled', () => {
    const item = makeItem();
    const updateItem = vi.fn();
    const removePhoto = vi.fn();
    const handlePhotoUpload = vi.fn();
    const openLightbox = vi.fn();

    render(
      <InspectionItemCard
        item={item}
        debouncedQuery=""
        highlightMatch={(t) => t}
        isReadOnly={false}
        isBusy={false}
        updateItem={updateItem}
        removePhoto={removePhoto}
        handlePhotoUpload={handlePhotoUpload}
        openLightbox={openLightbox}
      />
    );

    expect(screen.getByText('Fire Extinguisher')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pass/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Fail/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /N\/A/i })).toBeEnabled();
  });

  // Ensures clicking each status button invokes `updateItem` with the expected status value.
  it('clicking status buttons calls updateItem with the right status', () => {
    const item = makeItem();
    const updateItem = vi.fn();

    render(
      <InspectionItemCard
        item={item}
        debouncedQuery=""
        highlightMatch={(t) => t}
        isReadOnly={false}
        isBusy={false}
        updateItem={updateItem}
        removePhoto={vi.fn()}
        handlePhotoUpload={vi.fn()}
        openLightbox={vi.fn()}
      />
    );

    // Click 'Pass' button and assert payload
    fireEvent.click(screen.getByRole('button', { name: /Pass/i }));
    expect(updateItem).toHaveBeenCalledWith('item1', { status: 'pass' });

    // Click 'Fail' button and assert payload
    fireEvent.click(screen.getByRole('button', { name: /Fail/i }));
    expect(updateItem).toHaveBeenCalledWith('item1', { status: 'fail' });

    // Click 'N/A' button and assert payload
    fireEvent.click(screen.getByRole('button', { name: /N\/A/i }));
    expect(updateItem).toHaveBeenCalledWith('item1', { status: 'na' });
  });

  // Verifies that typing into the notes textarea calls `updateItem` with the new notes content.
  it('notes textarea change calls updateItem with notes', () => {
    const item = makeItem();
    const updateItem = vi.fn();

    render(
      <InspectionItemCard
        item={item}
        debouncedQuery=""
        highlightMatch={(t) => t}
        isReadOnly={false}
        isBusy={false}
        updateItem={updateItem}
        removePhoto={vi.fn()}
        handlePhotoUpload={vi.fn()}
        openLightbox={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText(/Add notes/i);
    fireEvent.change(textarea, { target: { value: 'Checked and OK' } });
    expect(updateItem).toHaveBeenCalledWith('item1', { notes: 'Checked and OK' });
  });

  // Tests photo interactions: clicking a thumbnail should open the lightbox with the correct image list and index,
  // and clicking the remove button should call `removePhoto` with the item id and correct index.
  it('clicking image opens lightbox and remove button calls removePhoto', () => {
    const item = makeItem({ photos: ['http://example.com/img1.jpg'] });
    const removePhoto = vi.fn();
    const openLightbox = vi.fn();

    render(
      <InspectionItemCard
        item={item}
        debouncedQuery=""
        highlightMatch={(t) => t}
        isReadOnly={false}
        isBusy={false}
        updateItem={vi.fn()}
        removePhoto={removePhoto}
        handlePhotoUpload={vi.fn()}
        openLightbox={openLightbox}
      />
    );

    const img = screen.getByAltText(/Evidence 1/i);
    fireEvent.click(img);
    expect(openLightbox).toHaveBeenCalledWith(['http://example.com/img1.jpg'], 0);

    const removeBtn = screen.getByRole('button', { name: /Remove photo/i });
    fireEvent.click(removeBtn);
    expect(removePhoto).toHaveBeenCalledWith('item1', 0);
  });

  // Ensures when `isReadOnly` is true the interactive controls are disabled or hidden:
  // - status buttons are disabled
  // - remove photo button is not rendered
  // - the notes textarea is readonly
  it('when read-only disables controls and prevents removal', () => {
    const item = makeItem({ photos: ['http://example.com/img1.jpg'] });
    const updateItem = vi.fn();

    render(
      <InspectionItemCard
        item={item}
        debouncedQuery=""
        highlightMatch={(t) => t}
        isReadOnly={true}
        isBusy={false}
        updateItem={updateItem}
        removePhoto={vi.fn()}
        handlePhotoUpload={vi.fn()}
        openLightbox={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Pass/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Remove photo/i })).not.toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Add notes/i);
    expect(textarea).toHaveAttribute('readonly');
  });
});
