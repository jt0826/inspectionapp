import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import PhotoGrid from '../inspection/PhotoGrid';

// Helper to create a mock File object for input change events
const makeFile = (name = 'photo.jpg') => new File(['dummy'], name, { type: 'image/jpeg' });

describe('PhotoGrid', () => {
  // cleanup DOM and mocks between tests
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  // Verifies the component renders image thumbnails when provided a string URL
  it('renders string image URLs as thumbnails and opens lightbox on click', () => {
    const onOpenLightbox = vi.fn();

    render(
      <PhotoGrid
        photos={['http://example.com/img1.jpg']}
        itemName="Extinguisher"
        isReadOnly={false}
        isBusy={false}
        onRemovePhoto={vi.fn()}
        onOpenLightbox={onOpenLightbox}
        onChooseFile={vi.fn()}
        onTakePhoto={vi.fn()}
      />
    );

    // Thumbnail should be in the document
    const img = screen.getByAltText(/Evidence 1/i);
    expect(img).toBeInTheDocument();

    // Clicking the thumbnail should call the lightbox with the URL and index 0
    fireEvent.click(img);
    expect(onOpenLightbox).toHaveBeenCalledWith(['http://example.com/img1.jpg'], 0);
  });

  // Verifies remove button calls handler with correct index
  it('remove button calls onRemovePhoto with index', () => {
    const onRemovePhoto = vi.fn();

    render(
      <PhotoGrid
        photos={['http://example.com/img1.jpg', 'http://example.com/img2.jpg']}
        itemName="Extinguisher"
        isReadOnly={false}
        isBusy={false}
        onRemovePhoto={onRemovePhoto}
        onOpenLightbox={vi.fn()}
        onChooseFile={vi.fn()}
        onTakePhoto={vi.fn()}
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: /Remove photo/i });
    // Click the second remove button (index 1)
    fireEvent.click(removeButtons[1]);
    expect(onRemovePhoto).toHaveBeenCalledWith(1);
  });

  // Verifies file input 'Choose from Library' triggers onChooseFile
  it('choose file input triggers onChooseFile with selected file', () => {
    const onChooseFile = vi.fn();

    render(
      <PhotoGrid
        photos={[]}
        itemName="Extinguisher"
        isReadOnly={false}
        isBusy={false}
        onRemovePhoto={vi.fn()}
        onOpenLightbox={vi.fn()}
        onChooseFile={onChooseFile}
        onTakePhoto={vi.fn()}
      />
    );

    const chooseInput = screen.getByLabelText(/Choose photo for Extinguisher/i) as HTMLInputElement;
    fireEvent.change(chooseInput, { target: { files: [makeFile()] } });
    expect(onChooseFile).toHaveBeenCalled();
  });

  // Verifies capture input 'Take Photo' triggers onTakePhoto
  it('take photo input triggers onTakePhoto with captured file', () => {
    const onTakePhoto = vi.fn();

    render(
      <PhotoGrid
        photos={[]}
        itemName="Extinguisher"
        isReadOnly={false}
        isBusy={false}
        onRemovePhoto={vi.fn()}
        onOpenLightbox={vi.fn()}
        onChooseFile={vi.fn()}
        onTakePhoto={onTakePhoto}
      />
    );

    const takeInput = screen.getByLabelText(/Take photo for Extinguisher/i) as HTMLInputElement;
    fireEvent.change(takeInput, { target: { files: [makeFile('capture.jpg')] } });
    expect(onTakePhoto).toHaveBeenCalled();
  });

  // Verifies when read-only, the inputs and remove buttons are not available
  it('hides inputs and remove buttons when read-only', () => {
    render(
      <PhotoGrid
        photos={['http://example.com/img1.jpg']}
        itemName="Extinguisher"
        isReadOnly={true}
        isBusy={false}
        onRemovePhoto={vi.fn()}
        onOpenLightbox={vi.fn()}
        onChooseFile={vi.fn()}
        onTakePhoto={vi.fn()}
      />
    );

    // Remove button should not exist
    expect(screen.queryByRole('button', { name: /Remove photo/i })).not.toBeInTheDocument();
    // Inputs should not be found (queryByLabelText returns null)
    expect(screen.queryByLabelText(/Choose photo for Extinguisher/i)).toBeNull();
    expect(screen.queryByLabelText(/Take photo for Extinguisher/i)).toBeNull();
  });
});
