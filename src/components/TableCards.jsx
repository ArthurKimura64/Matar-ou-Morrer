import React, { useState } from 'react';
import { Utils } from '../utils/Utils';

const TableCards = ({ 
  players = [], 
  gameData = {}, 
  localization = {},
  currentPlayer = null,
  isOpen: isOpenProp,
  onToggle
}) => {
  // Usar estado local apenas se não for controlado externamente
  const [isOpenLocal, setIsOpenLocal] = useState(false);
  const isOpen = isOpenProp !== undefined ? isOpenProp : isOpenLocal;

  const toggleTableCards = () => {
    if (onToggle) {
      onToggle();
    } else {
      setIsOpenLocal(!isOpenLocal);
    }
  };

  // Filtrar jogadores que têm cartas expostas
  const playersWithExposedCards = players.filter(player => 
    player.exposed_cards && Array.isArray(player.exposed_cards) && player.exposed_cards.length > 0
  );

  return (
    <>
      {/* Botão de toggle fixo na lateral direita */}
      <button
        onClick={toggleTableCards}
        className="btn btn-success position-fixed d-flex align-items-center justify-content-center sidebar-toggle-btn border border-light"
        style={{
          right: isOpen ? '380px' : '0px',
          top: 'calc(50% - 180px)',
          transform: 'translateY(-50%)',
          zIndex: 1055,
          width: '40px',
          height: '80px',
          borderRadius: '8px 0 0 8px',
          transition: 'all 0.3s ease-in-out',
          fontSize: '20px',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}
        title={isOpen ? 
          (localization['UI.TableCards.Close'] || "Fechar cartas na mesa") : 
          `${localization['UI.TableCards.Toggle'] || "Cartas na Mesa"} (${playersWithExposedCards.length} ${playersWithExposedCards.length === 1 ? 'jogador' : 'jogadores'})`
        }
      >
        {/* Ícone centralizado */}
        <span style={{ 
          fontSize: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%'
        }}>
          {isOpen ? '▶' : '👁️'}
        </span>
        {!isOpen && playersWithExposedCards.length > 0 && (
          <span 
            className="badge bg-warning text-dark position-absolute"
            style={{ 
              top: '5px', 
              right: '5px',
              fontSize: '10px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {playersWithExposedCards.length}
          </span>
        )}
      </button>

      {/* Overlay escuro quando o painel está aberto */}
      {isOpen && (
        <div
          className="position-fixed"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1050
          }}
          onClick={toggleTableCards}
        />
      )}

      {/* Painel lateral */}
      <div
        className="position-fixed bg-dark border-start border-light d-none d-md-block"
        style={{
          top: 0,
          right: isOpen ? '0' : '-380px',
          width: '380px',
          height: '100vh',
          transition: 'right 0.3s ease-in-out',
          zIndex: 1051,
          boxShadow: isOpen ? '-4px 0 12px rgba(0, 0, 0, 0.3)' : 'none'
        }}
      >
        {/* Header do painel */}
        <div className="bg-success text-white p-3 border-bottom border-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="text-white mb-1 fw-bold">
                👁️ {localization['UI.TableCards.Title'] || 'Cartas na Mesa'}
              </h6>
              <small className="text-light">
                {playersWithExposedCards.length} {playersWithExposedCards.length === 1 ? 'jogador' : 'jogadores'} com cartas expostas
              </small>
            </div>
            <button
              onClick={toggleTableCards}
              className="btn btn-outline-light btn-sm"
              style={{ width: '32px', height: '32px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Conteúdo das cartas com scroll */}
        <div
          className="p-3"
          style={{
            height: 'calc(100vh - 80px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
              {playersWithExposedCards.length === 0 ? (
                <div className="text-center py-5">
                  <div className="text-muted">
                    <div className="mb-3" style={{ fontSize: '4rem', opacity: 0.3 }}>
                      👁️
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
                <div className="d-flex flex-column gap-3">
                  {playersWithExposedCards.map(player => (
                    <div key={player.id} className="mb-3">
                      <h6 className="text-primary mb-3 d-flex align-items-center gap-2">
                        <span>👤 {player.name}</span>
                        <span className="badge bg-secondary small">
                          {player.exposed_cards.length} {player.exposed_cards.length === 1 ? 'carta' : 'cartas'}
                        </span>
                      </h6>
                      <div className="row g-2">
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
                                  const minDist = typeof foundItem.MinimumDistance === 'string' 
                                    ? (localization[foundItem.MinimumDistance] || foundItem.MinimumDistance)
                                    : foundItem.MinimumDistance;
                                  const maxDist = typeof foundItem.MaximumDistance === 'string' 
                                    ? (localization[foundItem.MaximumDistance] || foundItem.MaximumDistance)
                                    : foundItem.MaximumDistance;
                                  description = `
                                    <b>${localization['AttackBase.Damage'] || 'Dano'}:</b> ${foundItem.Damage}<br>
                                    <b>${localization['AttackBase.Distance'] || 'Distância'}:</b> ${minDist === maxDist ? minDist : `${minDist} - ${maxDist}`}<br>
                                    <b>${localization['AttackBase.Dices'] || 'Dados'}:</b> ${foundItem.Dices}<br>
                                    <b>${localization['AttackBase.LoadTime'] || 'Segundos'}:</b> ${foundItem.LoadTime || 0}
                                  `;
                                } else {
                                  description = localization[foundItem.Description] || foundItem.Description || 'Descrição não disponível';
                                }
                              }
                            } else {
                              description = localization[foundItem.Description] || foundItem.Description || 'Descrição não disponível';
                            }
                            
                            return (
                              <div key={itemId} className="col-12 mb-2">
                                <div 
                                  className={`card border-${cardColor} h-100`}
                                  style={{background: 'var(--bs-gray-800)', color: '#fff'}}
                                >
                                  <div className="card-body p-2">
                                    <div className={`fw-bold text-${cardColor} mb-1 small`}>
                                      {localization[foundItem.ID] || foundItem.Name || foundItem.ID}
                                    </div>
                                    <div 
                                      className="mb-1 small" 
                                      style={{ fontSize: '0.85rem' }}
                                      dangerouslySetInnerHTML={{ __html: description }}
                                    />
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

      {/* Painel Mobile - Fullscreen */}
      <div
        className="position-fixed bg-dark d-block d-md-none"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease-in-out',
          zIndex: 1051
        }}
      >
        {/* Header do painel mobile */}
        <div className="bg-success text-white p-3 border-bottom border-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="text-white mb-1 fw-bold">
                👁️ {localization['UI.TableCards.Title'] || 'Cartas na Mesa'}
              </h6>
              <small className="text-light">
                {playersWithExposedCards.length} {playersWithExposedCards.length === 1 ? 'jogador' : 'jogadores'} com cartas expostas
              </small>
            </div>
            <button
              onClick={toggleTableCards}
              className="btn btn-outline-light btn-sm"
              style={{ width: '32px', height: '32px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Conteúdo das cartas com scroll (mobile) */}
        <div
          className="p-3"
          style={{
            height: 'calc(100vh - 80px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          {playersWithExposedCards.length === 0 ? (
            <div className="text-center py-5">
              <div className="text-muted">
                <div className="mb-3" style={{ fontSize: '4rem', opacity: 0.3 }}>
                  👁️
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
            <div className="d-flex flex-column gap-3">
              {playersWithExposedCards.map(player => (
                <div key={player.id} className="mb-3">
                  <h6 className="text-primary mb-3 d-flex align-items-center gap-2">
                    <span>👤 {player.name}</span>
                    <span className="badge bg-secondary small">
                      {player.exposed_cards.length} {player.exposed_cards.length === 1 ? 'carta' : 'cartas'}
                    </span>
                  </h6>
                  <div className="row g-2">
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
                      
                      // Definir cor baseada no prefixo do ID
                      let cardColor = 'info';
                      
                      if (foundItem.ID.startsWith('Attack.') || foundItem.ID.startsWith('Weapon.')) {
                        cardColor = 'danger';
                      } else if (foundItem.ID.startsWith('Passive.')) {
                        cardColor = 'success';
                      } else if (foundItem.ID.startsWith('Device.')) {
                        cardColor = 'info';
                      } else if (foundItem.ID.startsWith('Power.')) {
                        cardColor = 'primary';
                      } else if (foundItem.ID.startsWith('SpecialAbility.')) {
                        cardColor = 'warning';
                      } else if (foundItem.ID.startsWith('PassiveSpecialAbility.')) {
                        cardColor = 'warning';
                      } else if (foundItem.ID.startsWith('Consumable.')) {
                        cardColor = 'info';
                      } else {
                        if (itemCategory === 'attack') cardColor = 'danger';
                        else if (itemCategory === 'passive') cardColor = 'success';
                        else if (itemCategory === 'special') cardColor = 'warning';
                        else cardColor = 'info';
                      }

                      let description = '';
                      if (foundItem.ID.startsWith('Attack.') || foundItem.ID.startsWith('Weapon.')) {
                        try {
                          description = Utils.createAttackDescription(foundItem, localization);
                        } catch (error) {
                          if (foundItem.Damage !== undefined) {
                            const minDist = typeof foundItem.MinimumDistance === 'string' 
                              ? (localization[foundItem.MinimumDistance] || foundItem.MinimumDistance)
                              : foundItem.MinimumDistance;
                            const maxDist = typeof foundItem.MaximumDistance === 'string' 
                              ? (localization[foundItem.MaximumDistance] || foundItem.MaximumDistance)
                              : foundItem.MaximumDistance;
                            description = `
                              <b>${localization['AttackBase.Damage'] || 'Dano'}:</b> ${foundItem.Damage}<br>
                              <b>${localization['AttackBase.Distance'] || 'Distância'}:</b> ${minDist === maxDist ? minDist : `${minDist} - ${maxDist}`}<br>
                              <b>${localization['AttackBase.Dices'] || 'Dados'}:</b> ${foundItem.Dices}<br>
                              <b>${localization['AttackBase.LoadTime'] || 'Segundos'}:</b> ${foundItem.LoadTime || 0}
                            `;
                          } else {
                            description = localization[foundItem.Description] || foundItem.Description || 'Descrição não disponível';
                          }
                        }
                      } else {
                        description = localization[foundItem.Description] || foundItem.Description || 'Descrição não disponível';
                      }
                      
                      return (
                        <div key={itemId} className="col-12 mb-2">
                          <div 
                            className={`card border-${cardColor} h-100`}
                            style={{background: 'var(--bs-gray-800)', color: '#fff'}}
                          >
                            <div className="card-body p-2">
                              <div className={`fw-bold text-${cardColor} mb-1`}>
                                {localization[foundItem.ID] || foundItem.Name || foundItem.ID}
                              </div>
                              <div 
                                className="mb-1" 
                                dangerouslySetInnerHTML={{ __html: description }}
                              />
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
  );
};

export default TableCards;
