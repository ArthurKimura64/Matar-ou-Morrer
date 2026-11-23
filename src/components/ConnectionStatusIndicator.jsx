import React from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

/**
 * ============================================================================
 * INDICADOR DE STATUS DE CONEXÃO (ConnectionStatusIndicator.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * Mostra uma bolinha verde (🟢), amarela (🔄) ou vermelha (🔴) indicando se a
 * conexão com o servidor está ativa. Ao clicar nele, força um novo teste.
 * ============================================================================
 */
const ConnectionStatusIndicator = ({ showDetails = false, localization = {} }) => {
  const { connectionStatus, forceCheck } = useConnectionStatus();

  // Se estiver conectado e não pediu detalhes extras, fica invisível para não poluir a tela
  if (!showDetails && connectionStatus.isConnected) {
    return null;
  }

  const getStatusIcon = () => {
    if (connectionStatus.isChecking) return '🔄';
    if (connectionStatus.isConnected) return '🟢';
    return '🔴';
  };

  const getStatusText = () => {
    if (connectionStatus.isChecking) {
      return localization['UI.Connection.Checking'] || 'Verificando...';
    }
    if (connectionStatus.isConnected) {
      const latencyText = connectionStatus.latency ? ` (${connectionStatus.latency}ms)` : '';
      return `${localization['UI.Connection.Connected'] || 'Conectado'}${latencyText}`;
    }
    return localization['UI.Connection.Disconnected'] || 'Desconectado';
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
      title={
        connectionStatus.isConnected
          ? `${localization['UI.Connection.LastCheck'] || 'Última verificação:'} ${new Date(connectionStatus.lastCheck).toLocaleTimeString()}`
          : connectionStatus.error || (localization['UI.Connection.ClickToCheck'] || 'Clique para verificar conexão')
      }
    >
      <span style={connectionStatus.isChecking ? { display: 'inline-block', animation: 'spin 1s linear infinite' } : undefined}>
        {getStatusIcon()}
      </span>
      <span className={getStatusColor()}>{getStatusText()}</span>
      
      {showDetails && (
        <small className="text-muted ms-1">
          {new Date(connectionStatus.lastCheck).toLocaleTimeString()}
        </small>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;