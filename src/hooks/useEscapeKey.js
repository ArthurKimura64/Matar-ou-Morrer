import { useEffect } from 'react';

export function useEscapeKey(isActive, onEscape) {
  useEffect(() => {
    if (!isActive || typeof onEscape !== 'function') return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);
}