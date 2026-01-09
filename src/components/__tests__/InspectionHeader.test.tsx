import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InspectionHeader from '../inspection/InspectionHeader';

describe('InspectionHeader', () => {
  // Verifies the header renders contextual information and a navigation affordance:
  // - shows the current room name
  // - displays the venue name for context
  // - exposes a back button labelled "Back to Rooms" that returns the user to the room list
  it('renders room and venue and back button', () => {
    render(<InspectionHeader roomName="Room A" venueName="Venue X" itemsCount={5} isReadOnly={false} onBack={() => {}} />);
    expect(screen.getByText('Room A')).toBeInTheDocument();
    expect(screen.getByText(/Venue X/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Rooms/i })).toBeInTheDocument();
  });
});