import { useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';
import { DEFAULT_THEME } from '../config/themes';

/**
 * Gerencia o tema visual ativo no HTML, no localStorage e na conta do Supabase.
 */
export function useTheme({ currentUser, userProfile, onThemeSaved }) {
  const [userTheme, setUserTheme] = useState(() => {
    const initialTheme = localStorage.getItem('kod_active_theme') || DEFAULT_THEME;
    document.documentElement.setAttribute('data-kod-theme', initialTheme);
    return initialTheme;
  });

  // Aplica o atributo CSS no <html> sempre que o tema muda
  useEffect(() => {
    const active = userTheme || DEFAULT_THEME;
    document.documentElement.setAttribute('data-kod-theme', active);
    localStorage.setItem('kod_active_theme', active);
  }, [userTheme]);

  // Sincroniza o tema salvo na conta assim que o perfil carrega
  useEffect(() => {
    if (!currentUser?.id) return;

    const resolvedTheme =
      userProfile?.theme ||
      localStorage.getItem(`kod_theme_${currentUser.id}`) ||
      DEFAULT_THEME;

    setUserTheme(resolvedTheme);
    localStorage.setItem('kod_active_theme', resolvedTheme);
    localStorage.setItem(`kod_theme_${currentUser.id}`, resolvedTheme);
  }, [currentUser?.id, userProfile?.theme]);

  // Troca de tema escolhida pelo jogador no UserMenu
  const handleThemeChange = useCallback(
    async (newTheme) => {
      setUserTheme(newTheme);
      localStorage.setItem('kod_active_theme', newTheme);

      if (currentUser?.id) {
        localStorage.setItem(`kod_theme_${currentUser.id}`, newTheme);
        try {
          await authService.updateTheme(currentUser.id, newTheme);
          onThemeSaved?.(newTheme);
        } catch (err) {
          console.warn('Erro ao salvar tema na conta:', err);
        }
      }
    },
    [currentUser?.id, onThemeSaved]
  );

  // Volta para o tema padrão ao deslogar
  const resetTheme = useCallback(() => {
    setUserTheme(DEFAULT_THEME);
    localStorage.setItem('kod_active_theme', DEFAULT_THEME);
  }, []);

  return {
    userTheme,
    handleThemeChange,
    resetTheme
  };
}