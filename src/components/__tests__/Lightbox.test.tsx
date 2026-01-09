import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import Lightbox from '../inspection/Lightbox';

describe('Lightbox', () => {
  // cleanup between tests
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  // When `open` is false the component should render nothing
  it('does not render when closed', () => {
    const onClose = vi.fn();
    render(<Lightbox open={false} images={['a.jpg']} index={0} onClose={onClose} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // When open, it should render the dialog and the current image by index
  it('renders open dialog with correct image and alt text', () => {
    const onClose = vi.fn();
    render(<Lightbox open images={["/img1.jpg", "/img2.jpg"]} index={1} onClose={onClose} onPrev={vi.fn()} onNext={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const img = screen.getByAltText('Image 2') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/img2.jpg');
  });

  // Clicking the overlay (outside image) should call onClose
  it('clicking backdrop triggers onClose', () => {
    const onClose = vi.fn();
    render(<Lightbox open images={["/img1.jpg"]} index={0} onClose={onClose} onPrev={vi.fn()} onNext={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  // Clicking the Close button should call onClose
  it('clicking close button calls onClose', () => {
    const onClose = vi.fn();
    render(<Lightbox open images={["/img1.jpg"]} index={0} onClose={onClose} onPrev={vi.fn()} onNext={vi.fn()} />);

    const closeBtn = screen.getByRole('button', { name: /Close image/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  // Clicking prev/next buttons should call respective callbacks and should not propagate to close
  it('prev and next buttons call handlers', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();

    render(<Lightbox open images={["/img1.jpg", "/img2.jpg"]} index={0} onClose={onClose} onPrev={onPrev} onNext={onNext} />);

    const prevBtn = screen.getByRole('button', { name: /Previous image/i });
    const nextBtn = screen.getByRole('button', { name: /Next image/i });

    fireEvent.click(prevBtn);
    expect(onPrev).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Clicking the image itself should not close the lightbox because propagation is stopped
  it('clicking image does not close the lightbox', () => {
    const onClose = vi.fn();
    render(<Lightbox open images={["/img1.jpg"]} index={0} onClose={onClose} onPrev={vi.fn()} onNext={vi.fn()} />);

    const img = screen.getByAltText('Image 1');
    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });
});
