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
  const previousView = useRef(currentView);

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
          // Usar nome localizado do personagem
          characterName = localization && selectedActor?.ID 
            ? localization[`Character.Name.${selectedActor.ID}`] || selectedActor.ID
            : selectedActor?.name || selectedActor?.ID;
          break;
        case 'sheet':
          newStatus = 'ready';
          // Usar nome localizado do personagem
          characterName = localization && selectedActor?.ID 
            ? localization[`Character.Name.${selectedActor.ID}`] || selectedActor.ID
            : selectedActor?.name || selectedActor?.ID;
          break;
        default:
          newStatus = 'selecting';
      }

      // Só atualizar se mudou de view
      if (previousView.current !== currentView) {
        console.log('Atualizando status automaticamente:', newStatus, characterName);
        await RoomService.updatePlayerStatus(playerId, newStatus, characterName);
        previousView.current = currentView;
      }
    };

    updateStatus();
  }, [playerId, currentView, selectedActor?.ID, selectedActor?.name, characterSelections, localization]);
};

export default usePlayerStatus;
