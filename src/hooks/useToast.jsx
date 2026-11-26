import { useToastContext } from '../context/ToastContext';

// Componente vazio mantido por compatibilidade caso algum arquivo ainda renderize <ToastComponent />
const EmptyToast = () => null;

export const useToast = () => {
  const ctx = useToastContext();
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de um <ToastProvider>.');
  }
  return {
    showToast: ctx.showToast,
    hideToast: ctx.hideToast,
    ToastComponent: EmptyToast
  };
};