import { useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

/**
 * Gerencia a sessão de login, checagem de banimento e carregamento do perfil.
 */
export function useAuthSession({ showToast }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const loadProfile = useCallback(async (userId, retries = 1) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const profile = await authService.getProfile(userId);
        setUserProfile(profile);
        return profile;
      } catch (err) {
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 500));
        } else {
          console.warn('Perfil ainda não disponível:', err);
        }
      }
    }
    return null;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const acceptOrRejectSession = async (session) => {
      if (!session?.user) {
        if (isMounted) {
          setCurrentUser(null);
          setUserProfile(null);
          setAuthLoading(false);
        }
        return;
      }

      const banStatus = await authService.checkBanStatus(session.user.id);
      if (!isMounted) return;

      if (banStatus?.banned) {
        await authService.signOut();
        showToast?.(
          `Sua conta foi banida. Motivo: ${banStatus.reason || 'Não especificado'}`,
          'error',
          6000
        );
        setCurrentUser(null);
        setUserProfile(null);
      } else {
        setCurrentUser(session.user);
        loadProfile(session.user.id, 1);
      }
      setAuthLoading(false);
    };

    // Verifica sessão existente na montagem
    authService.getSession().then(acceptOrRejectSession);

    // Escuta mudanças futuras (login, logout, refresh de token)
    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
      if (!isMounted || event === 'INITIAL_SESSION') return;
      acceptOrRejectSession(session);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [loadProfile, showToast]);

  const handleAuthSuccess = useCallback(
    (user) => {
      setCurrentUser(user);
      // 3 tentativas para dar tempo do trigger do banco criar o perfil de contas novas
      loadProfile(user.id, 3);
    },
    [loadProfile]
  );

  const clearAuthState = useCallback(() => {
    setCurrentUser(null);
    setUserProfile(null);
  }, []);

  const updateProfileThemeLocally = useCallback((newTheme) => {
    setUserProfile((prev) => (prev ? { ...prev, theme: newTheme } : prev));
  }, []);

  return {
    currentUser,
    userProfile,
    authLoading,
    handleAuthSuccess,
    clearAuthState,
    updateProfileThemeLocally
  };
}