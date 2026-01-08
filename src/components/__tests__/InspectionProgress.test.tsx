import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InspectionProgress from '../inspection/InspectionProgress';

describe('InspectionProgress', () => {
  it('renders counts and progress', () => {
    render(<InspectionProgress completedCount={2} totalCount={4} passCount={2} failCount={1} naCount={0} pendingCount={1} />);
    expect(screen.getByText(/Pass:/)).toBeInTheDocument();
    expect(screen.getByText(/Fail:/)).toBeInTheDocument();
  });
});