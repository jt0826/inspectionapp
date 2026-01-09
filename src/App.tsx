import React, { useState } from 'react';
import { AuthProvider, useAuth, useDisplayName } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { Login } from './components/Login';
import { VenueList } from './components/VenueList';
import { RoomList } from './components/RoomList';
import { InspectionForm } from './components/InspectionForm';
import { InspectionHistory } from './components/InspectionHistory';
import { VenueForm } from './components/VenueForm';
import { UserProfile } from './components/UserProfile';
import { InspectorHome } from './components/InspectorHome';
import { VenueSelection } from './components/VenueSelection';
import { InspectionConfirmation } from './components/InspectionConfirmation';
import { VenueLayout } from './components/VenueLayout';
import { Dashboard } from './components/Dashboard';
import { InspectionProvider } from './contexts/InspectionContext';
import { useAppHandlers } from './hooks/useAppHandlers';

import type { Inspection } from './types/inspection';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const displayName = useDisplayName();

  // Local state that remains in AppContent (to be moved to context in a future step)
  const [inspectionReadOnly, setInspectionReadOnly] = useState<boolean>(false);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [editingInspectionIndex, setEditingInspectionIndex] = useState<number | null>(null);

  // All handlers and derived state from the hook
  const {
    // Navigation
    currentView,
    navigate,
    // Venue state & handlers
    venues,
    selectedVenue,
    selectedRoom,
    pendingVenueId,
    setVenues,
    setPendingVenueId,
    selectVenue,
    handleVenueSelect,
    handleAddVenue,
    handleEditVenue,
    handleDeleteVenue,
    handleSaveVenue,
    // Room handlers
    handleRoomSelect,
    // Inspection state & handlers
    inspections,
    currentInspectionId,
    isCreating,
    handleCreateNewInspection,
    handleInspectionCreated,
    handleInspectionSubmit,
    handleResumeInspection,
    handleDeleteInspectionById,
    // Navigation handlers
    handleBackFromVenueSelect,
    handleBackFromRooms,
    handleBackFromInspection,
    handleBack,
    handleBackToHome,
    handleViewHistory,
    handleViewProfile,
    handleViewDashboard,
    handleConfirmInspection,
    handleReturnHomeFromConfirm,
  } = useAppHandlers({
    displayName,
    inspectionReadOnly,
    setInspectionReadOnly,
    editingInspection,
    setEditingInspection,
    editingInspectionIndex,
    setEditingInspectionIndex,
  });

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {currentView === 'home' && (
        <InspectorHome
          inspections={inspections}
          venues={venues}
          onCreateNewInspection={handleCreateNewInspection}
          onResumeInspection={handleResumeInspection}
          onViewHistory={handleViewHistory}
          onViewProfile={handleViewProfile}
          onManageVenues={() => navigate('venues')}
          onViewDashboard={handleViewDashboard}
          onDeleteInspection={handleDeleteInspectionById}
        />
      )}

      {currentView === 'selectVenue' && (
        <VenueSelection
          venues={venues}
          onVenueSelect={handleVenueSelect}
          onBack={handleBackFromVenueSelect}
          currentInspectionId={currentInspectionId}
          isCreatingNewInspection={isCreating}
          onInspectionCreated={handleInspectionCreated}
        />
      )}

      {currentView === 'dashboard' && (
        <Dashboard onBack={() => navigate('home')} />
      )}

      {currentView === 'confirmInspection' && (
        <InspectionConfirmation
          venue={selectedVenue ?? undefined}
          pendingVenueId={pendingVenueId ?? undefined}
          onConfirm={handleConfirmInspection}
          onReturnHome={handleReturnHomeFromConfirm}
        />
      )}

      {currentView === 'venues' && (
        <VenueList
          venues={venues}
          onVenueSelect={handleVenueSelect}
          onViewVenue={(v) => { selectVenue(v); navigate('venueLayout'); }}
          onViewProfile={handleViewProfile}
          onAddVenue={handleAddVenue}
          onEditVenue={handleEditVenue}
          onDeleteVenue={handleDeleteVenue}
          onBack={() => navigate('home')}
          onVenuesLoaded={(v) => setVenues(v)}
        />
      )}

      {currentView === 'rooms' && (
        <RoomList
          venue={selectedVenue || undefined}
          venueId={selectedVenue ? undefined : pendingVenueId || undefined}
          onRoomSelect={handleRoomSelect}
          onBack={handleBackFromRooms}
          inspections={inspections}
          inspectionId={currentInspectionId}
          onVenueLoaded={(v) => { selectVenue(v); setPendingVenueId(null); }}
        />
      )}

      {currentView === 'inspection' && selectedVenue && selectedRoom && (
        <InspectionForm
          venue={selectedVenue}
          room={selectedRoom}
          inspectionId={currentInspectionId || undefined}
          onSubmit={handleInspectionSubmit}
          onBack={handleBackFromInspection}
          existingInspection={editingInspection}
          readOnly={inspectionReadOnly}
        />
      )}

      {currentView === 'venueLayout' && selectedVenue && (
        <VenueLayout venue={selectedVenue} onBack={() => navigate('venues')} />
      )}

      {(currentView === 'addVenue' || currentView === 'editVenue') && (
        <VenueForm
          venue={selectedVenue}
          onSave={handleSaveVenue}
          onBack={handleBack}
          isEdit={currentView === 'editVenue'}
        />
      )}

      {currentView === 'profile' && (
        <UserProfile onBack={handleBackToHome} />
      )}

      {currentView === 'history' && (
        <InspectionHistory
          inspections={inspections}
          onBack={handleBackToHome}
          onDeleteInspection={handleDeleteInspectionById}
          onResumeInspection={handleResumeInspection}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <InspectionProvider>
            <div className="min-h-screen bg-gray-50">
              <AppContent />
            </div>
          </InspectionProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
