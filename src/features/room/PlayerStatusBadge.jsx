import React from 'react';

const PlayerStatusBadge = ({ player, isCurrentPlayer = false, localization = {} }) => {
  const getStatusInfo = () => {
    switch (player.status) {
      case 'selecting':
        return {
          text: localization['UI.PlayerStatus.WaitingSelection'] || 'Aguardando seleção',
          bgColor: 'bg-secondary',
          textColor: 'text-white',
          icon: '🔍'
        };
      case 'creating':
        return {
          text: player.character_name 
            ? `${localization['UI.PlayerStatus.CreatingCharacter'] || 'Criando personagem'} (${player.character_name})`
            : (localization['UI.PlayerStatus.CreatingCharacter'] || 'UI.PlayerStatus.CreatingCharacter'),
          bgColor: 'bg-warning',
          textColor: 'text-dark',
          icon: '⚙️'
        };
      case 'playing':
      case 'ready':
        return {
          text: player.character_name || (localization['UI.PlayerStatus.Ready'] || 'Pronto'),
          bgColor: 'bg-success',
          textColor: 'text-white',
          icon: '✅'
        };
      default:
        return {
          text: localization['UI.PlayerStatus.Unknown'] || 'Desconhecido',
          bgColor: 'bg-dark',
          textColor: 'text-white',
          icon: '❓'
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`badge ${statusInfo.bgColor} ${statusInfo.textColor} d-flex align-items-center gap-1`}>
      <span>{statusInfo.icon}</span>
      <span className="">{statusInfo.text}</span>
      {isCurrentPlayer && (
        <span className="badge bg-primary ms-1">{localization['UI.You'] || 'Você'}</span>
      )}
    </div>
  );
};

export default PlayerStatusBadge;
