import React, { useEffect } from 'react';

/**
 * Modal reutilizável de confirmação (substitui o window.confirm nativo do navegador).
 */
const ConfirmModal = ({
  show,
  title = 'Confirmar ação',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!show) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onCancel) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, onCancel]);

  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div
        className="modal show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabIndex="-1"
        onClick={(e) => e.target === e.currentTarget && onCancel?.()}
      >
        <div className="modal-dialog">
          <div className={`modal-content border-${confirmVariant}`}>
            <header className="modal-header">
              <h5 id="confirm-modal-title" className="modal-title text-white fw-bold mb-0">
                {title}
              </h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                style={{ width: '32px', height: '32px', padding: 0 }}
                aria-label="Fechar"
                onClick={onCancel}
              >
                ✕
              </button>
            </header>

            <div className="modal-body">
              <p className="text-light mb-0">{message}</p>
            </div>

            <footer className="modal-footer">
              <button type="button" className="btn btn-secondary btn-sm px-3" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`btn btn-${confirmVariant} btn-sm fw-bold px-3`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConfirmModal;