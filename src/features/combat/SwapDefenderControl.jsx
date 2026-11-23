import React, { useState } from 'react';

/**
 * ============================================================================
 * CONTROLE DE TROCA DE DEFENSOR (SwapDefenderControl.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * Permite redirecionar um combate em andamento para outro jogador vivo da sala.
 * ============================================================================
 */
const SwapDefenderControl = ({
  swapTargets = [],
  onSwapDefender,
  localization = {},
  btnClass = 'btn-outline-warning'
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2">
      <button
        type="button"
        className={`btn btn-sm ${btnClass} w-100`}
        onClick={() => setIsOpen(!isOpen)}
      >
        🔄 {localization?.['UI.Combat.SwapDefender'] || 'Trocar Defensor'}
      </button>

      {isOpen && (
        <div className="mt-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {swapTargets.length === 0 ? (
            <small className="text-muted d-block text-center py-1">
              {localization?.['UI.Combat.NoPlayersAvailable'] || 'Nenhum jogador disponível'}
            </small>
          ) : (
            swapTargets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn-sm btn-outline-light w-100 mb-1 text-start"
                onClick={() => {
                  onSwapDefender(p.id);
                  setIsOpen(false);
                }}
              >
                🛡️ {p.name}
                <small className="text-muted ms-2">
                  {p.character_name || p.character?.actor?.Name || ''}
                </small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SwapDefenderControl;