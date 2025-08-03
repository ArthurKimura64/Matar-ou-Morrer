import React, { useState } from 'react';
import { Utils } from '../utils/Utils';

const TableCards = ({ 
  players = [], 
  gameData = {}, 
  localization = {},
  currentPlayer = null
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleTableCards = () => {
    setIsOpen(!isOpen);
  };

  // Filtrar jogadores que têm cartas expostas
  const playersWithExposedCards = players.filter(player => 
    player.exposed_cards && Array.isArray(player.exposed_cards) && player.exposed_cards.length > 0
  );

  return (
    <>
      {/* Botão flutuante para cartas na mesa */}
      <button
        onClick={toggleTableCards}
        className="btn btn-success position-fixed d-flex align-items-center justify-content-center"
        style={{
          bottom: '20px',
          right: '20px',
          zIndex: 1055,
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s ease-in-out'
        }}
        title={localization['UI.TableCards.Toggle'] || "Cartas na Mesa"}
      >
        <div className="d-flex flex-column align-items-center">
          <span style={{ fontSize: '20px' }}>🃏</span>
          {playersWithExposedCards.length > 0 && (
            <span 
              className="badge bg-warning text-dark position-absolute"
              style={{ 
                top: '-5px', 
                right: '-5px',
                fontSize: '10px',
                minWidth: '20px'
              }}
            >
              {playersWithExposedCards.length}
            </span>
          )}
        </div>
      </button>

      {/* Modal/Overlay das cartas na mesa */}
      {isOpen && (
        <>
          {/* Overlay escuro */}
          <div
            className="position-fixed"
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              zIndex: 1060
            }}
            onClick={toggleTableCards}
          />

          {/* Modal das cartas */}
          <div
            className="position-fixed bg-dark border border-light"
            style={{
              top: '5%',
              left: '5%',
              right: '5%',
              bottom: '5%',
              borderRadius: '8px',
              zIndex: 1061,
              overflowY: 'auto'
            }}
          >
            {/* Header do modal */}
            <div className="bg-success text-white p-3 border-bottom border-light">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  🃏 {localization['UI.TableCards.Title'] || 'Cartas na Mesa'}
                </h5>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-light text-dark">
                    {playersWithExposedCards.length} {playersWithExposedCards.length === 1 ? 'jogador' : 'jogadores'}
                  </span>
                  <button
                    onClick={toggleTableCards}
                    className="btn btn-outline-light btn-sm"
                    style={{ width: '32px', height: '32px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Conteúdo das cartas */}
            <div className="p-3">
              {playersWithExposedCards.length === 0 ? (
                <div className="text-center py-5">
                  <div className="text-muted">
                    <div className="mb-3" style={{ fontSize: '4rem', opacity: 0.3 }}>
                      🃏
                    </div>
                    <h6 className="text-white mb-2">Mesa Vazia</h6>
                    <p>
                      {localization['UI.TableCards.NoCards'] || 'Nenhum jogador expôs cartas na mesa ainda.'}
                    </p>
                    <small className="text-muted">
                      Dica: Use o ícone do olho 👁️ nas habilidades da sua ficha para expor cartas.
                    </small>
                  </div>
                </div>
              ) : (
                <div>
                  {playersWithExposedCards.map(player => (
                    <div key={player.id} className="mb-4">
                      <h5 className="text-primary mb-3">
                        👤 {player.name} 
                        <span className="badge bg-secondary ms-2 small">
                          {player.exposed_cards.length} {player.exposed_cards.length === 1 ? 'carta' : 'cartas'}
                        </span>
                      </h5>
                      <div className="row g-2 mb-4">
                          {player.exposed_cards.map(itemId => {
                            // Buscar o item em todas as categorias possíveis
                            let foundItem = null;
                            let itemCategory = null;
                            
                            const categories = [
                              { key: 'AttackDefinitions', name: 'attack' },
                              { key: 'PassiveDefinitions', name: 'passive' },
                              { key: 'ConsumableDefinitions', name: 'consumable' },
                              { key: 'SpecialDefinitions', name: 'special' }
                            ];
                            
                            for (const category of categories) {
                              if (gameData[category.key]) {
                                const item = gameData[category.key].find(def => def.ID === itemId);
                                if (item) {
                                  foundItem = item;
                                  itemCategory = category.name;
                                  break;
                                }
                              }
                            }
                            
                            if (!foundItem) return null;
                            
                            // Definir cor baseada no prefixo do ID (já que Type não existe nos dados)
                            let cardColor = 'info'; // padrão
                            
                            if (foundItem.ID.startsWith('Attack.') || foundItem.ID.startsWith('Weapon.')) {
                              cardColor = 'danger'; // ataques e armas
                            } else if (foundItem.ID.startsWith('Passive.')) {
                              cardColor = 'success'; // passivas
                            } else if (foundItem.ID.startsWith('Device.')) {
                              cardColor = 'info'; // dispositivos
                            } else if (foundItem.ID.startsWith('Power.')) {
                              cardColor = 'primary'; // poderes - azul escuro
                            } else if (foundItem.ID.startsWith('SpecialAbility.')) {
                              cardColor = 'warning'; // especiais
                            } else if (foundItem.ID.startsWith('PassiveSpecialAbility.')) {
                              cardColor = 'warning'; // especiais passivas
                            } else if (foundItem.ID.startsWith('Consumable.')) {
                              cardColor = 'info'; // consumíveis
                            } else {
                              // Fallback baseado na categoria se prefixo não for identificado
                              if (itemCategory === 'attack') cardColor = 'danger';
                              else if (itemCategory === 'passive') cardColor = 'success';
                              else if (itemCategory === 'special') cardColor = 'warning';
                              else cardColor = 'info';
                            }                            // Para ataques/armas, usar descrição especial
                            let description = '';
                            if (foundItem.ID.startsWith('Attack.') || foundItem.ID.startsWith('Weapon.')) {
                              // Usar Utils para criar descrição de ataque
                              try {
                                description = Utils.createAttackDescription(foundItem, localization);
                              } catch (error) {
                                // Fallback para descrição manual se Utils falhar
                                if (foundItem.Damage !== undefined) {
                                  description = `
                                    <b>Dano:</b> ${foundItem.Damage}<br>
                                    <b>Distância:</b> ${foundItem.MinimumDistance === foundItem.MaximumDistance ? 
                                      foundItem.MinimumDistance : 
                                      `${foundItem.MinimumDistance} - ${foundItem.MaximumDistance}`}<br>
                                    <b>Dados:</b> ${foundItem.Dices}<br>
                                    <b>Tempo de Recarga:</b> ${foundItem.LoadTime || 0}
                                  `;
                                } else {
                                  description = localization[foundItem.Description] || foundItem.Description || 'Descrição não disponível';
                                }
                              }
                            } else {
                              description = localization[foundItem.Description] || foundItem.Description || 'Descrição não disponível';
                            }
                            
                            return (
                              <div key={itemId} className="col-12 col-md-6 col-lg-4 mb-3">
                                <div 
                                  className={`card border-${cardColor} h-100`}
                                  style={{background: 'var(--bs-gray-800)', color: '#fff'}}
                                >
                                  <div className="card-body p-2">
                                    <div className={`fw-bold text-${cardColor} mb-1`}>
                                      {localization[foundItem.ID] || foundItem.Name || foundItem.ID}
                                    </div>
                                    <div 
                                      className="mb-2" 
                                      dangerouslySetInnerHTML={{ __html: description }}
                                    />
                                    <div className="text-muted small">
                                      👤 {player.name}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default TableCards;
