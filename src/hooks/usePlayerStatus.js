import { useEffect, useRef } from 'react';
import { RoomService } from '../services/roomService';

/**
 * Hook para gerenciar o status do jogador automaticamente
 * @param {string} playerId - ID do jogador atual
 * @param {string} currentView - View atual ('lobby', 'builder', 'sheet')
 * @param {object} selectedActor - Ator selecionado
 * @param {object} characterSelections - Seleções do personagem
 * @param {object} localization - Objeto de localização
 */
export const usePlayerStatus = (playerId, currentView, selectedActor, characterSelections, localization) => {
  const previousView = useRef(null);

  useEffect(() => {
    const updateStatus = async () => {
      if (!playerId) return;

      let newStatus = 'selecting';
      let characterName = null;

      switch (currentView) {
        case 'lobby':
          newStatus = 'selecting';
          break;
        case 'builder':
          newStatus = 'creating';
          characterName = localization && selectedActor?.ID 
            ? localization[`Character.Name.${selectedActor.ID}`] || selectedActor.ID
            : selectedActor?.name || selectedActor?.ID;
          break;
        case 'sheet':
          newStatus = 'ready';
          characterName = localization && selectedActor?.ID 
            ? localization[`Character.Name.${selectedActor.ID}`] || selectedActor.ID
            : selectedActor?.name || selectedActor?.ID;
          break;
        default:
          newStatus = 'selecting';
      }

      // Atualizar se mudou de view OU se é a primeira vez (previousView é null na montagem)
      if (previousView.current !== currentView) {
        await RoomService.updatePlayerStatus(playerId, newStatus, characterName);
        previousView.current = currentView;
      }
    };

    updateStatus();
  }, [playerId, currentView, selectedActor?.ID, selectedActor?.name, localization]);
};

export default usePlayerStatus;
