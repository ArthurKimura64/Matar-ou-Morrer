import React from 'react';
import BaseModal from './BaseModal';

const ConfirmModal = ({
  show,
  title = 'Confirmar ação',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  onConfirm,
  onCancel
}) => (
  <BaseModal
    show={show}
    onClose={onCancel}
    title={title}
    borderVariant={confirmVariant}
    footer={
      <>
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
      </>
    }
  >
    <p className="text-light mb-0">{message}</p>
  </BaseModal>
);

export default ConfirmModal;