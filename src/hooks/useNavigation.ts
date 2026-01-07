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

/**
 * useNavigation - Lightweight client-side navigation hook for the single-page app.
 *
 * Purpose:
 * - Provide a small, testable navigation state machine that tracks the current
 *   view and a minimal history stack without touching the URL.
 * - Intended for apps that manage view state in-memory (no react-router / URL sync).
 *
 * Returns an object with:
 * - currentView: the current `View` string
 * - navigate(view): push `view` onto the history stack and make it active
 * - goBack(): pop the most recent view and restore the previous one (no-op at root)
 * - goHome(): reset history to ['home'] and set current view to 'home'
 * - future work can use the history stack to allow back and forward buttons to work despite no URL changes
 *
 * Example:
 * const { currentView, navigate, goBack } = useNavigation();
 * navigate('inspection');
 *
 * Notes:
 * - This hook is client-only and does not modify browser history or URLs.
 */
export function useNavigation() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [viewHistory, setViewHistory] = useState<View[]>(['home']);

  /**
   * navigate(view) → void
   * Push a view onto the internal history stack and make it the active view.
   * Side effects: updates `currentView` and appends to `viewHistory`.
   */
  const navigate = useCallback((view: View) => {
    setViewHistory(prev => [...prev, view]);
    setCurrentView(view);
  }, []);

  /**
   * goBack() → void
   * If there is history (more than one entry), pop the most recent view and
   * set the current view to the previous entry. If at root, this is a no-op.
   */
  const goBack = useCallback(() => {
    setViewHistory(prev => {
      if (prev.length <= 1) return prev;
      const newHistory = prev.slice(0, -1);
      setCurrentView(newHistory[newHistory.length - 1]);
      return newHistory;
    });
  }, []);

  /**
   * goHome() → void
   * Reset navigation history to the root view and set the current view to 'home'.
   */
  const goHome = useCallback(() => {
    setViewHistory(['home']);
    setCurrentView('home');
  }, []);

  return { currentView, navigate, goBack, goHome } as const;
}
