import { useState, useEffect } from 'react';
import { RoomService } from '../services/roomService';

// Hook para monitorar status de conexão e fornecer feedback visual
export const useConnectionStatus = () => {
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: true,
    latency: null,
    lastCheck: Date.now(),
    isChecking: false
  });

  useEffect(() => {
    let checkInterval;
    let isMounted = true;

    const checkConnection = async () => {
      if (!isMounted) return;
      
      setConnectionStatus(prev => ({ ...prev, isChecking: true }));
      
      try {
        const result = await RoomService.testConnection();
        
        if (isMounted) {
          setConnectionStatus({
            isConnected: result.connected,
            latency: result.latency,
            lastCheck: Date.now(),
            isChecking: false,
            error: result.error
          });
        }
      } catch (error) {
        if (isMounted) {
          setConnectionStatus(prev => ({
            ...prev,
            isConnected: false,
            isChecking: false,
            error: error.message
          }));
        }
      }
    };

    // Verificação inicial
    checkConnection();

    // Verificação periódica (a cada 2 minutos)
    checkInterval = setInterval(checkConnection, 120000);

    // Verificar quando a página fica visível
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkConnection();
      }
    };

    // Verificar quando a conexão volta
    const handleOnline = () => {
      checkConnection();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      clearInterval(checkInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Função para forçar uma verificação manual
  const forceCheck = async () => {
    setConnectionStatus(prev => ({ ...prev, isChecking: true }));
    
    try {
      const result = await RoomService.testConnection();
      setConnectionStatus({
        isConnected: result.connected,
        latency: result.latency,
        lastCheck: Date.now(),
        isChecking: false,
        error: result.error
      });
      return result;
    } catch (error) {
      setConnectionStatus(prev => ({
        ...prev,
        isConnected: false,
        isChecking: false,
        error: error.message
      }));
      throw error;
    }
  };

  return {
    connectionStatus,
    forceCheck
  };
};
