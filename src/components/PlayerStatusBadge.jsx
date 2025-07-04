import React from 'react';

const PlayerStatusBadge = ({ player, isCurrentPlayer = false }) => {
  const getStatusInfo = () => {
    switch (player.status) {
      case 'selecting':
        return {
          text: 'Selecionando Personagem',
          bgColor: 'bg-secondary',
          textColor: 'text-white',
          icon: '🔍'
        };
      case 'creating':
        return {
          text: player.character_name 
            ? `Criando personagem (${player.character_name})`
            : 'Criando personagem',
          bgColor: 'bg-warning',
          textColor: 'text-dark',
          icon: '⚙️'
        };
      case 'ready':
        return {
          text: player.character_name || 'Pronto',
          bgColor: 'bg-success',
          textColor: 'text-white',
          icon: '✅'
        };
      default:
        return {
          text: 'Desconhecido',
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
        <span className="badge bg-primary ms-1">Você</span>
      )}
    </div>
  );
};

export default PlayerStatusBadge;
