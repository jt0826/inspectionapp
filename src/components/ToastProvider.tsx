import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('success');
  const [timeoutId, setTimeoutId] = useState<number | null>(null);

  // Confirm modal state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('Confirm');
  const [confirmMessage, setConfirmMessage] = useState<string>('Are you sure?');
  const [confirmConfirmLabel, setConfirmConfirmLabel] = useState<string>('Confirm');
  const [confirmCancelLabel, setConfirmCancelLabel] = useState<string>('Cancel');
  const confirmResolveRef = useRef<(v: boolean) => void | null>(null);

  const show = useCallback((msg: string, options?: ToastOptions) => {
    setMessage(msg);
    setVariant(options?.variant || 'success');
    setVisible(true);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    const id = window.setTimeout(() => {
      setVisible(false);
      setTimeoutId(null);
    }, options?.duration ?? 3500);
    setTimeoutId(id);
  }, [timeoutId]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setConfirmTitle(opts.title || 'Confirm');
    setConfirmMessage(opts.message || 'Are you sure?');
    setConfirmConfirmLabel(opts.confirmLabel || 'Confirm');
    setConfirmCancelLabel(opts.cancelLabel || 'Cancel');
    setConfirmVisible(true);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  }, []);

  const handleConfirmChoice = (choice: boolean) => {
    setConfirmVisible(false);
    if (confirmResolveRef.current) {
      confirmResolveRef.current(choice);
      confirmResolveRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [timeoutId]);

  return (
    <ToastContext.Provider value={{ show, confirm }}>
      {children}

      {/* Toast UI (global) */}
      { (variant === 'success' || variant === 'error') ? (
        /* Top-center, slightly larger dark toasts for success/error with fade/scale animation */
        <div className={`fixed left-0 right-0 top-6 z-50 flex justify-center pointer-events-none`} role="status" aria-live="polite">
          <div className={`pointer-events-auto transform transition duration-200 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'} flex items-center gap-3 px-6 py-3 rounded-lg shadow-xl`} style={{ backgroundColor: variant === 'success' ? 'rgba(16,163,74,0.65)' : 'rgba(220,38,38,0.65)' }}>
            <div className="text-white font-semibold text-lg">{message}</div>
          </div>
        </div>
      ) : (
        /* Smaller, top-right toast for info or neutral messages (also animated) */
        <div className={`fixed top-6 right-6 z-50 pointer-events-none`} role="status" aria-live="polite">
          <div className={`pointer-events-auto transform transition duration-200 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'} flex items-center gap-2 px-4 py-2 rounded shadow-lg`} style={{ backgroundColor: 'rgba(75,85,99,0.65)' }}>
            <div className="text-white font-medium">{message}</div>
          </div>
        </div>
      ) }

      {/* Global confirm modal */}
      {confirmVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => handleConfirmChoice(false)} />
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg z-10 w-11/12 max-w-md">
            <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">{confirmTitle}</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{confirmMessage}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => handleConfirmChoice(false)} className="px-4 py-2 bg-gray-100 text-gray-900 rounded dark:bg-gray-700 dark:text-gray-100">{confirmCancelLabel}</button>
              <button onClick={() => handleConfirmChoice(true)} className={`px-4 py-2 rounded text-white bg-red-600 hover:bg-red-700`}>{confirmConfirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
