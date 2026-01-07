import { useState, useCallback } from 'react';

export type View =
  | 'home'
  | 'venues'
  | 'rooms'
  | 'inspection'
  | 'addVenue'
  | 'editVenue'
  | 'profile'
  | 'history'
  | 'selectVenue'
  | 'confirmInspection'
  | 'venueLayout'
  | 'dashboard';

export function useNavigation() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [viewHistory, setViewHistory] = useState<View[]>(['home']);

  const navigate = useCallback((view: View) => {
    setViewHistory(prev => [...prev, view]);
    setCurrentView(view);
  }, []);

  const goBack = useCallback(() => {
    setViewHistory(prev => {
      if (prev.length <= 1) return prev;
      const newHistory = prev.slice(0, -1);
      setCurrentView(newHistory[newHistory.length - 1]);
      return newHistory;
    });
  }, []);

  const goHome = useCallback(() => {
    setViewHistory(['home']);
    setCurrentView('home');
  }, []);

  return { currentView, navigate, goBack, goHome } as const;
}
