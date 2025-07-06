import React from 'react';
import PlayerStatusBadge from './PlayerStatusBadge';

const PlayerDetailedStatus = ({ player, isCurrentPlayer = false, localization = {}, gameData }) => {
  const counters = player.counters || {
    vida: 20, vida_max: 20,
    esquiva: 0, esquiva_max: 0,
    oport: 0, oport_max: 0,
    item: 0, item_max: 0
  };

  const characteristics = player.characteristics || {
    attacks: 0, weapons: 0, passives: 0,
    devices: 0, powers: 0, specials: 0, passiveSpecials: 0
  };

  const usedItems = player.used_items || [];
  const additionalCounters = player.additional_counters || {};
  
  // Calcular características totais e disponíveis
  const getCharacteristicsData = () => {
    // Criar Set mais robusto que lida com diferentes tipos
    const usedItemsSet = new Set();
    usedItems.forEach(item => {
      usedItemsSet.add(item);
      usedItemsSet.add(String(item)); // Adicionar versão string também
    });
    
    const characteristicsData = {
      attacks: { total: 0, available: 0 },
      weapons: { total: 0, available: 0 },
      passives: { total: 0, available: 0 },
      devices: { total: 0, available: 0 },
      powers: { total: 0, available: 0 },
      specials: { total: 0, available: 0 },
      passiveSpecials: { total: 0, available: 0 }
    };
    
    // PRIMEIRA PRIORIDADE: Usar dados do ActorDefinitions se disponível
    if (player.character_name && gameData && gameData.ActorDefinitions) {
      const actorData = gameData.ActorDefinitions.find(actor => actor.ID === player.character_name);
      
      if (actorData) {
        characteristicsData.attacks.total = actorData.NumberOfUnlimitedAttacks || 0;
        characteristicsData.weapons.total = actorData.NumberOfWeapons || 0;
        characteristicsData.passives.total = actorData.NumberOfPassives || 0;
        characteristicsData.devices.total = actorData.NumberOfDevices || 0;
        characteristicsData.powers.total = actorData.NumberOfPowers || 0;
        characteristicsData.specials.total = actorData.NumberOfSpecialAbilities || 0;
        characteristicsData.passiveSpecials.total = actorData.NumberOfPassiveSpecialAbilities || 0;
      }
    }
    
    // SEGUNDA PRIORIDADE: Usar características salvas no banco (fallback)
    if (Object.values(characteristicsData).every(data => data.total === 0) && characteristics && Object.values(characteristics).some(v => v > 0)) {
      Object.keys(characteristicsData).forEach(key => {
        characteristicsData[key].total = characteristics[key] || 0;
      });
    }
    
    // CALCULAR DISPONÍVEIS baseado nas seleções
    if (player.selections && typeof player.selections === 'object' && Object.keys(player.selections).length > 0) {
      
      // Contar itens disponíveis (selecionados mas não usados)
      Object.entries(player.selections).forEach(([key, selectedItems]) => {
        if (Array.isArray(selectedItems)) {
          // Se não há totais definidos ainda, usar o tamanho das seleções como total
          if (characteristicsData[key] && characteristicsData[key].total === 0) {
            characteristicsData[key].total = selectedItems.length;
          }
          
          if (characteristicsData[key]) {
            // Verificar quais itens foram usados - comparando IDs corretamente
            const usedFromThisCategory = selectedItems.filter(item => {
              // Obter o ID do item (suporta diferentes formatos)
              const itemId = item.ID || item.id || item.Name || item.name;
              
              // Verificar se o ID está na lista de itens usados
              if (itemId && usedItems.includes(itemId)) {
                return true;
              }
              return false;
            });
            
            const availableCount = selectedItems.length - usedFromThisCategory.length;
            characteristicsData[key].available = availableCount;
          }
        }
      });
    } else {
      // Se não há seleções válidas, usar os totais como disponíveis
      Object.keys(characteristicsData).forEach(key => {
        characteristicsData[key].available = characteristicsData[key].total;
      });
    }
    
    return characteristicsData;
  };

  const getCharacteristicLabel = (key) => {
    const labels = {
      attacks: localization['Characteristic.Attack.Title'] || 'Ataques sem Limites',
      weapons: localization['Characteristic.Weapon.Title'] || 'Armas Primárias',
      passives: localization['Characteristic.Passive.Title'] || 'Habilidades Passivas',
      devices: localization['Characteristic.Device.Title'] || 'Dispositivos',
      powers: localization['Characteristic.Power.Title'] || 'Poderes',
      specials: localization['Characteristic.SpecialAbility.Title'] || 'Habilidades Especiais',
      passiveSpecials: localization['Characteristic.PassiveSpecialAbility.Title'] || 'Habilidades Especiais Passivas'
    };
    return labels[key] || key;
  };

  const formatCounter = (current, max) => {
    if (max && max > 0 && max !== current) {
      return `${current}/${max}`;
    }
    return current.toString();
  };

  const characteristicsData = getCharacteristicsData();

  // Se não há dados válidos, exibir mensagem de fallback
  if (!player || !player.name) {
    return (
      <div className="card bg-dark border-light h-100" style={{ transition: 'all 0.2s ease-in-out' }}>
        <div className="card-body p-2 d-flex align-items-center justify-content-center">
          <div className="text-center">
            <div className="mb-2">
              <div className="spinner-border spinner-border-sm text-muted" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
            <div className="text-muted small" style={{ 
              background: 'rgba(108,117,125,0.1)', 
              border: '1px solid rgba(108,117,125,0.3)',
              borderRadius: '6px',
              padding: '8px 12px'
            }}>
              Dados não disponíveis
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-dark border-light h-100" style={{ transition: 'all 0.2s ease-in-out' }}>
      <div className="card-body p-2">
        {/* Header com Nome e Status - Mais Compacto */}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center">
            <h6 className="card-title text-white mb-0 fw-bold me-2">
              {player.name}
            </h6>
            {player.character_name && (
              <span className="text-muted small">({player.character_name})</span>
            )}
          </div>
          {isCurrentPlayer && (
            <span className="badge bg-primary">
              {localization['UI.You'] || 'Você'}
            </span>
          )}
        </div>
        
        {/* Status Badge */}
        <div className="mb-2">
          <PlayerStatusBadge 
            player={player} 
            isCurrentPlayer={isCurrentPlayer}
            localization={localization}
          />
        </div>

        {/* Contadores e Características - só mostrar se o jogador estiver pronto */}
        {player.status === 'ready' && (
          <>
            {/* Contadores Básicos - Grid Compacto */}
            <div className="mb-2" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' }}>
              <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                <span className="me-2" style={{ color: '#17a2b8' }}>⚡</span>
                {localization['UI.Counters.Special'] || 'Contadores'}
              </h6>
              <div className="row g-1 small">
                <div className="col-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-2 rounded" style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)' }}>
                    <span className="text-muted">{localization['Characteristic.Health'] || 'Vida'}</span>
                    <span className="text-white fw-bold">{formatCounter(counters.vida, counters.vida_max)}</span>
                  </div>
                </div>
                <div className="col-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-2 rounded" style={{ background: 'rgba(40,167,69,0.1)', border: '1px solid rgba(40,167,69,0.2)' }}>
                    <span className="text-muted">{localization['Characteristic.DodgePoints'] || 'Esquiva'}</span>
                    <span className="text-white fw-bold">{formatCounter(counters.esquiva, counters.esquiva_max)}</span>
                  </div>
                </div>
                <div className="col-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-2 rounded" style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.2)' }}>
                    <span className="text-muted">{localization['Characteristic.OportunityAttack'] || 'Oportunidade'}</span>
                    <span className="text-white fw-bold">{formatCounter(counters.oport, counters.oport_max)}</span>
                  </div>
                </div>
                <div className="col-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-2 rounded" style={{ background: 'rgba(108,117,125,0.1)', border: '1px solid rgba(108,117,125,0.2)' }}>
                    <span className="text-muted">{localization['Characteristic.ExplorationItens'] || 'Itens'}</span>
                    <span className="text-white fw-bold">{formatCounter(counters.item, counters.item_max)}</span>
                  </div>
                </div>
                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center py-1 px-2 rounded" style={{ background: 'rgba(102,16,242,0.1)', border: '1px solid rgba(102,16,242,0.2)' }}>
                    <span className="text-muted">{localization['Characteristic.DefenseDices'] || 'Dados de defesa'}</span>
                    <span className="text-white fw-bold">{counters.defesa || 2}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contadores Adicionais - Se existirem */}
            {Object.keys(additionalCounters).length > 0 && (
              <div className="mb-2" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' }}>
                <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                  <span className="me-2" style={{ color: '#17a2b8' }}>📊</span>
                  {localization['UI.AdditionalCounters.Title'] || 'Contadores Especiais'}
                </h6>
                
                <div className="row g-2">
                  {Object.entries(additionalCounters).map(([key, counter]) => {
                    if (typeof counter === 'object' && counter.current !== undefined) {
                      const displayText = counter.max ? `${counter.current}/${counter.max}` : counter.current.toString();
                      let colorClass = 'text-info';
                      let bgColor = 'rgba(23,162,184,0.1)';
                      let borderColor = 'rgba(23,162,184,0.2)';
                      
                      // Definir cor baseada no status
                      if (counter.max) {
                        if (counter.current === 0) {
                          colorClass = 'text-danger';
                          bgColor = 'rgba(220,53,69,0.1)';
                          borderColor = 'rgba(220,53,69,0.2)';
                        } else if (counter.current < counter.max / 2) {
                          colorClass = 'text-warning';
                          bgColor = 'rgba(255,193,7,0.1)';
                          borderColor = 'rgba(255,193,7,0.2)';
                        } else {
                          colorClass = 'text-success';
                          bgColor = 'rgba(25,135,84,0.1)';
                          borderColor = 'rgba(25,135,84,0.2)';
                        }
                      }
                      
                      return (
                        <div key={key} className={Object.keys(additionalCounters).length <= 2 ? "col-6" : "col-12 col-sm-6"}>
                          <div className="d-flex justify-content-between align-items-center py-1 px-2 rounded" 
                               style={{ background: bgColor, border: `1px solid ${borderColor}`, minHeight: '28px' }}>
                            <span className="text-muted d-flex align-items-center text-truncate" style={{ maxWidth: '70%' }}>
                              {counter.icon && <span className="me-1 flex-shrink-0" style={{ fontSize: '0.8em' }}>{counter.icon}</span>}
                              <span className="text-truncate" style={{ fontSize: '0.85em' }} title={counter.label || key}>
                                {counter.label || key.replace('SpecialCustom.', '').replace(/\d+$/, '')}
                              </span>
                            </span>
                            <span className={`fw-bold ${colorClass} flex-shrink-0`} style={{ fontSize: '0.9em' }}>{displayText}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}

            {/* Características - Versão Linhas Compactas */}
            <div className="mb-2" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' }}>
              <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                <span className="me-2" style={{ color: '#ffc107' }}>🎯</span>
                {localization['Characteristic.Title'] || 'Características'}
              </h6>
              
              <div className="small">
                {Object.entries(characteristicsData).map(([key, data]) => {
                  if (data.total > 0) {
                    const characteristicLabel = getCharacteristicLabel(key);
                    const isConsumable = !['attacks', 'weapons', 'passives', 'passiveSpecials'].includes(key);
                    const displayText = isConsumable ? `${data.available}/${data.total}` : `${data.available}`;
                    
                    let textColor;
                    if (data.available === 0) {
                      textColor = isConsumable ? 'text-danger' : 'text-muted';
                    } else if (isConsumable && data.available < data.total) {
                      textColor = 'text-warning';
                    } else {
                      textColor = 'text-success';
                    }
                    
                    return (
                      <div key={key} className="d-flex justify-content-between align-items-center py-1" 
                           style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span className="text-muted">{characteristicLabel}</span>
                        <span className={`fw-bold ${textColor}`}>{displayText}</span>
                      </div>
                    );
                  }
                  return null;
                })}
                
                {Object.values(characteristicsData).every(data => data.total === 0) && (
                  <div className="text-muted text-center py-2">
                    {localization['UI.PlayerStatus.NoCharacteristics'] || 'Nenhuma característica disponível'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Placeholder para outros status */}
        {player.status !== 'ready' && (
          <div className="text-center py-4">
            <div className="mb-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
            <div className="text-muted" style={{ 
              background: 'rgba(13,110,253,0.1)', 
              border: '1px solid rgba(13,110,253,0.3)',
              borderRadius: '6px',
              padding: '12px 16px'
            }}>
              {player.status === 'creating' ? 
                (localization['UI.PlayerStatus.CreatingCharacter'] || 'Criando personagem') : 
                (localization['UI.PlayerStatus.WaitingSelection'] || 'Aguardando seleção')
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerDetailedStatus;
