import React from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

const ConnectionStatusIndicator = ({ showDetails = false }) => {
  const { connectionStatus, forceCheck } = useConnectionStatus();

  if (!showDetails && connectionStatus.isConnected) {
    // Se conectado e não quer mostrar detalhes, não mostrar nada
    return null;
  }

  const getStatusIcon = () => {
    if (connectionStatus.isChecking) return '🔄';
    if (connectionStatus.isConnected) return '🟢';
    return '🔴';
  };

  const getStatusText = () => {
    if (connectionStatus.isChecking) return 'Verificando...';
    if (connectionStatus.isConnected) {
      const latencyText = connectionStatus.latency ? ` (${connectionStatus.latency}ms)` : '';
      return `Conectado${latencyText}`;
    }
    return 'Desconectado';
  };

  const getStatusColor = () => {
    if (connectionStatus.isChecking) return 'text-warning';
    if (connectionStatus.isConnected) return 'text-success';
    return 'text-danger';
  };

  const handleClick = () => {
    if (!connectionStatus.isChecking) {
      forceCheck();
    }
  };

  return (
    <div 
      className={`d-flex align-items-center gap-1 ${showDetails ? 'p-2' : 'p-1'} rounded bg-dark bg-opacity-25`}
      style={{ 
        cursor: connectionStatus.isChecking ? 'default' : 'pointer',
        fontSize: showDetails ? '0.9rem' : '0.8rem'
      }}
      onClick={handleClick}
      title={connectionStatus.isConnected ? 
        `Última verificação: ${new Date(connectionStatus.lastCheck).toLocaleTimeString()}` : 
        connectionStatus.error || 'Clique para verificar conexão'
      }
    >
      <span className={connectionStatus.isChecking ? 'spin' : ''}>{getStatusIcon()}</span>
      <span className={getStatusColor()}>{getStatusText()}</span>
      
      {showDetails && (
        <small className="text-muted ms-1">
          {new Date(connectionStatus.lastCheck).toLocaleTimeString()}
        </small>
      )}
      
      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ConnectionStatusIndicator;
