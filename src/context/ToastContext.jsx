import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const TOAST_STYLES = {
  error: { bgClass: 'bg-danger text-white', icon: '❌', closeWhite: true },
  success: { bgClass: 'bg-success text-white', icon: '✅', closeWhite: true },
  warning: { bgClass: 'bg-warning text-dark', icon: '⚠️', closeWhite: false },
  info: { bgClass: 'bg-primary text-white', icon: 'ℹ️', closeWhite: true }
};

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const timerRef = useRef(null);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  const showToast = useCallback((message, type = 'info', durationMs = 4000) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setToast({ show: true, message, type });

    timerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
      timerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {toast.show && (
        <aside
          className="position-fixed bottom-0 end-0 p-3"
          style={{ zIndex: 9999 }}
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            className={`toast show align-items-center ${style.bgClass} border-0 shadow-lg`}
            role="status"
            style={{ animation: 'fadeInUp 0.25s ease-out' }}
          >
            <div className="d-flex align-items-center">
              <div className="toast-body fw-bold d-flex align-items-center gap-2">
                <span aria-hidden="true">{style.icon}</span>
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                className={`btn-close ${style.closeWhite ? 'btn-close-white' : ''} me-2 m-auto`}
                aria-label="Fechar aviso"
                onClick={hideToast}
              />
            </div>
          </div>
        </aside>
      )}
    </ToastContext.Provider>
  );
};

export const useToastContext = () => useContext(ToastContext);