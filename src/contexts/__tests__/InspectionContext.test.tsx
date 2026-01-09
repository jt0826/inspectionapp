import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { InspectionProvider, useInspectionContext } from '../InspectionContext';

function Consumer() {
  const { refreshKey, triggerRefresh, lastLoadedInspections, setLastLoadedInspections } = useInspectionContext();
  return (
    <div>
      <div data-testid="rk">{refreshKey}</div>
      <div data-testid="snap">{lastLoadedInspections ? lastLoadedInspections.length : 0}</div>
      <button onClick={() => triggerRefresh()}>Trigger</button>
      <button onClick={() => setLastLoadedInspections([{ id: 'a' }])}>SetSnap</button>
    </div>
  );
}

describe('InspectionContext', () => {
  it('triggerRefresh increments refreshKey and setLastLoadedInspections sets snapshot', () => {
    render(
      <InspectionProvider>
        <Consumer />
      </InspectionProvider>
    );

    expect(screen.getByTestId('rk').textContent).toBe('0');
    fireEvent.click(screen.getByText('Trigger'));
    expect(screen.getByTestId('rk').textContent).toBe('1');

    expect(screen.getByTestId('snap').textContent).toBe('0');
    fireEvent.click(screen.getByText('SetSnap'));
    expect(screen.getByTestId('snap').textContent).toBe('1');
  });
});
