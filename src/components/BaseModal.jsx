import React, { useEffect, useId } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

const SIZE_CLASS = {
  sm: '',
  md: '',
  lg: 'modal-lg',
  xl: 'modal-xl'
};

/**
 * Molde padrão de Modal para todo o jogo.
 * Cuida automaticamente de Escape, clique fora, trava de rolagem do fundo e acessibilidade.
 */
const BaseModal = ({
  show,
  onClose,
  title,
  subtitle = null,
  borderVariant = 'secondary',
  size = 'md',
  maxWidth = null,
  disableClose = false,
  footer = null,
  children
}) => {
  const titleId = useId();
  const safeClose = disableClose ? undefined : onClose;

  useEscapeKey(Boolean(show && !disableClose), safeClose);

  // Evita que a página atrás do modal fique rolando no celular
  useEffect(() => {
    if (!show) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  if (!show) return null;

  const dialogStyle = maxWidth
    ? { maxWidth }
    : size === 'sm'
    ? { maxWidth: '380px' }
    : undefined;

  return (
    <>
      <div className="modal-backdrop" onClick={safeClose} />
      <div
        className="modal show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex="-1"
        onClick={(e) => e.target === e.currentTarget && safeClose?.()}
      >
        <div className={`modal-dialog ${SIZE_CLASS[size] || ''}`} style={dialogStyle}>
          <div className={`modal-content border-${borderVariant}`}>
            {title && (
              <header className="modal-header">
                <div className="text-start">
                  <h5 id={titleId} className="modal-title text-white fw-bold mb-0">
                    {title}
                  </h5>
                  {subtitle && <small className="text-muted d-block">{subtitle}</small>}
                </div>
                {!disableClose && onClose && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary flex-shrink-0"
                    style={{ width: '32px', height: '32px', padding: 0 }}
                    aria-label="Fechar"
                    onClick={onClose}
                  >
                    ✕
                  </button>
                )}
              </header>
            )}

            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {children}
            </div>

            {footer && <footer className="modal-footer">{footer}</footer>}
          </div>
        </div>
      </div>
    </>
  );
};

export default BaseModal;