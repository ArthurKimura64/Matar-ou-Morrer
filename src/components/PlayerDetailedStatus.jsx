import React from 'react';
import PlayerStatusBadge from './PlayerStatusBadge';

const PlayerDetailedStatus = ({ player, isCurrentPlayer = false, localization }) => {
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
  
  // Calcular características totais e disponíveis
  const getCharacteristicsData = () => {
    const usedItemsSet = new Set(usedItems);
    
    const characteristicsData = {
      attacks: { total: 0, available: 0 },
      weapons: { total: 0, available: 0 },
      passives: { total: 0, available: 0 },
      devices: { total: 0, available: 0 },
      powers: { total: 0, available: 0 },
      specials: { total: 0, available: 0 },
      passiveSpecials: { total: 0, available: 0 }
    };
    
    // Usar as características salvas como totais (dados de características)
    if (characteristics && Object.values(characteristics).some(v => v > 0)) {
      Object.keys(characteristicsData).forEach(key => {
        characteristicsData[key].total = characteristics[key] || 0;
      });
    }
    
    // Calcular disponíveis baseado nas seleções e itens usados
    if (player.selections && typeof player.selections === 'object' && Object.keys(player.selections).length > 0) {
      // Contar apenas itens não usados das seleções
      Object.entries(player.selections).forEach(([key, selectedItems]) => {
        if (Array.isArray(selectedItems)) {
          selectedItems.forEach(item => {
            if (!usedItemsSet.has(item.ID)) {
              if (item.Type === 'Attack') characteristicsData.attacks.available++;
              else if (item.Type === 'Weapon') characteristicsData.weapons.available++;
              else if (item.Type === 'Passive') characteristicsData.passives.available++;
              else if (item.Type === 'Device') characteristicsData.devices.available++;
              else if (item.Type === 'Power') characteristicsData.powers.available++;
              else if (item.Type === 'SpecialAbility') characteristicsData.specials.available++;
              else if (item.Type === 'PassiveSpecialAbility') characteristicsData.passiveSpecials.available++;
            }
          });
        }
      });
    } else {
      // Se não tem seleções, usar as características totais como disponíveis também
      Object.keys(characteristicsData).forEach(key => {
        characteristicsData[key].available = characteristicsData[key].total;
      });
    }
    
    console.log('🔍 Dados de características (total/disponível):', characteristicsData);
    return characteristicsData;
  };

  const characteristicsData = getCharacteristicsData();

  // Debug: verificar dados do jogador
  if (player.status === 'ready') {
    console.log(`🔍 PlayerDetailedStatus - ${player.name}:`, {
      status: player.status,
      hasCharacteristics: !!player.characteristics,
      characteristicsCount: Object.values(characteristics).reduce((a, b) => a + b, 0),
      hasSelections: !!player.selections && Object.keys(player.selections).length > 0,
      selectionsKeys: player.selections ? Object.keys(player.selections) : [],
      usedItemsCount: usedItems.length,
      totalCharsCount: Object.values(characteristicsData).reduce((acc, char) => acc + char.total, 0),
      availableCharsCount: Object.values(characteristicsData).reduce((acc, char) => acc + char.available, 0)
    });
  }
  const additionalCounters = player.additional_counters || {};

  const formatCounter = (current, max) => {
    // Garantir que max é um valor válido e apenas mostrar max quando é diferente de current
    if (max && max > 0) {
      return `${current}/${max}`;
    }
    return current.toString();
  };

  const getCharacteristicLabel = (key) => {
    const labels = {
      attacks: localization['UI.Characteristics.Attacks'] || 'UI.Characteristics.Attacks',
      weapons: localization['UI.Characteristics.Weapons'] || 'UI.Characteristics.Weapons',
      passives: localization['UI.Characteristics.Passives'] || 'UI.Characteristics.Passives',
      devices: localization['UI.Characteristics.Devices'] || 'UI.Characteristics.Devices',
      powers: localization['UI.Characteristics.Powers'] || 'UI.Characteristics.Powers',
      specials: localization['UI.Characteristics.Specials'] || 'UI.Characteristics.Specials',
      passiveSpecials: localization['UI.Characteristics.PassiveSpecials'] || 'UI.Characteristics.PassiveSpecials'
    };
    return labels[key] || key;
  };

  const getCharacteristicIcon = (key) => {
    const icons = {
      attacks: '⚔️',
      weapons: '🗡️',
      passives: '🛡️',
      devices: '🔧',
      powers: '✨',
      specials: '🌟',
      passiveSpecials: '💫'
    };
    return icons[key] || '📊';
  };

  const getCharacteristicTooltip = (key, data) => {
    const descriptions = {
      attacks: 'Ataques sem limite que podem ser usados repetidamente',
      weapons: 'Armas primárias com poder especial',
      passives: 'Habilidades que funcionam automaticamente',
      devices: 'Dispositivos que podem ser utilizados (uso único)',
      powers: 'Poderes especiais que podem ser ativados (uso único)',
      specials: 'Habilidades especiais poderosas (uso único)',
      passiveSpecials: 'Habilidades especiais que funcionam automaticamente'
    };
    
    const description = descriptions[key] || 'Característica do personagem';
    const usedCount = data.total - data.available;
    
    return `${description}\n\nTotal: ${data.total}\nDisponível: ${data.available}\nUsados: ${usedCount}`;
  };

  const getAdditionalCounterIcon = (key, data) => {
    // Se o contador já tem um ícone definido, usar ele
    if (typeof data === 'object' && data.icon) {
      return data.icon;
    }
    
    // Ícone geral para todos os contadores
    return '📊';
  };

  const getAdditionalCounterLabel = (key, data) => {
    // Usar o label do próprio objeto se disponível (vem das SpecialDefinitions)
    if (typeof data === 'object' && data.label) {
      // Para evitar confusão com labels duplicados, adicionar identificador único se necessário
      const baseLabel = data.label;
      
      // Se há múltiplos contadores com o mesmo label, adicionar parte do ID para diferenciá-los
      const otherCountersWithSameLabel = Object.entries(additionalCounters).filter(([otherKey, otherData]) => 
        otherKey !== key && 
        typeof otherData === 'object' && 
        otherData.label === baseLabel
      );
      
      if (otherCountersWithSameLabel.length > 0) {
        const shortId = key.replace('SpecialCustom.', '').replace(/\d+$/, '');
        return `${baseLabel} (${shortId})`;
      }
      
      return baseLabel;
    }
    
    // Limpar o ID para uma versão mais legível
    return key.replace('SpecialCustom.', '').replace(/\d+$/, '').replace(/([A-Z])/g, ' $1').trim();
  };

  // Agrupar características por categoria
  const getCharacteristicsByCategory = () => {
    const combat = ['attacks', 'weapons'];
    const abilities = ['passives', 'passiveSpecials'];
    const consumables = ['devices', 'powers', 'specials'];
    
    return { combat, abilities, consumables };
  };

  const getCategoryInfo = (category) => {
    const info = {
      combat: {
        title: localization['UI.CharacteristicsCategory.Combat'] || 'Combate',
        icon: '⚔️',
        description: 'Ataques e armas para combate'
      },
      abilities: {
        title: localization['UI.CharacteristicsCategory.Abilities'] || 'Habilidades',
        icon: '🛡️',
        description: 'Habilidades passivas permanentes'
      },
      consumables: {
        title: localization['UI.CharacteristicsCategory.Consumables'] || 'Consumíveis',
        icon: '🔧',
        description: 'Itens e poderes de uso único'
      }
    };
    return info[category] || { title: category, icon: '📊', description: '' };
  };

  return (
    <div className="card bg-dark border-light h-100">
      <div className="card-body p-3">
        {/* Nome e Status */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h6 className="card-title text-white mb-0 fw-bold">
            {player.name}
          </h6>
          {isCurrentPlayer && (
            <span className="badge bg-primary">{localization['UI.You'] || 'UI.You'}</span>
          )}
        </div>
        
        {/* Status Badge */}
        <div className="mb-3">
          <PlayerStatusBadge 
            player={player} 
            isCurrentPlayer={isCurrentPlayer}
            localization={localization}
          />
        </div>

        {/* Contadores */}
        {player.status === 'ready' && (
          <>
            {/* Resumo Rápido de Status */}
            <div className="mb-3 p-2 bg-secondary bg-opacity-10 rounded border border-secondary border-opacity-25">
              <div className="small text-light fw-bold mb-1">{localization['UI.PlayerStatus.QuickSummary'] || 'UI.PlayerStatus.QuickSummary'}</div>
              <div className="row g-1 text-center">
                <div className="col-4">
                  <div className="small text-success">❤️ {counters.vida}</div>
                </div>
                <div className="col-4">
                  <div className="small text-primary">
                    🎯 {Object.values(characteristicsData).reduce((acc, char) => acc + char.available, 0)}
                  </div>
                </div>
                <div className="col-4">
                  <div className="small text-danger">
                    {usedItems.length > 0 ? `🚫 ${usedItems.length}` : '✅ 0'}
                  </div>
                </div>
              </div>
              <div className="row g-1 text-center mt-1">
                <div className="col-4">
                  <div className="small text-muted opacity-75">{localization['Characteristic.Health'] || 'Characteristic.Health'}</div>
                </div>
                <div className="col-4">
                  <div className="small text-muted opacity-75">{localization['UI.PlayerStatus.Available'] || 'UI.PlayerStatus.Available'}</div>
                </div>
                <div className="col-4">
                  <div className="small text-muted opacity-75">{localization['UI.PlayerStatus.Used'] || 'UI.PlayerStatus.Used'}</div>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <h6 className="text-light small mb-2 fw-bold">{localization['UI.Counters.Special'] || 'UI.Counters.Special'}</h6>
              <div className="row g-1">
                <div className="col-6">
                  <div className="text-center p-1 bg-success bg-opacity-10 rounded border border-success border-opacity-25 counter-card">
                    <div className="small text-success fw-bold">{localization['Characteristic.Health'] || 'Characteristic.Health'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.vida, counters.vida_max)}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-1 bg-info bg-opacity-10 rounded border border-info border-opacity-25 counter-card">
                    <div className="small text-info fw-bold">{localization['Characteristic.DodgePoints'] || 'Characteristic.DodgePoints'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.esquiva, counters.esquiva_max)}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-1 bg-warning bg-opacity-10 rounded border border-warning border-opacity-25 counter-card">
                    <div className="small text-warning fw-bold">{localization['Characteristic.OportunityAttack'] || 'Characteristic.OportunityAttack'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.oport, counters.oport_max)}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-1 bg-secondary bg-opacity-10 rounded border border-secondary border-opacity-25 counter-card">
                    <div className="small text-secondary fw-bold">{localization['Characteristic.ExplorationItens'] || 'Characteristic.ExplorationItens'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.item, counters.item_max)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contadores Adicionais */}
            {Object.keys(additionalCounters).length > 0 && (
              <div className="mb-3">
                <h6 className="text-light small mb-2 fw-bold">{localization['UI.CharacterSheet.AdditionalCounters'] || 'UI.CharacterSheet.AdditionalCounters'}</h6>
                <div className="row g-1">
                  {Object.entries(additionalCounters).map(([key, data]) => (
                    <div key={key} className="col-6">
                      <div className="text-center p-1 bg-purple bg-opacity-10 rounded border border-purple border-opacity-25 counter-card">
                        <div className="small text-purple fw-bold">
                          {getAdditionalCounterIcon(key, data)} {getAdditionalCounterLabel(key, data)}
                        </div>
                        <div className="text-white fw-bold">
                          {typeof data === 'object' ? formatCounter(data.current || 0, data.max || 0) : (data || 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Características Agrupadas por Categoria */}
            <div className="mb-2">
              <h6 className="text-light small mb-2 fw-bold d-flex align-items-center gap-1">
                <span>📊</span>
                <span>{localization['UI.Counters.Characteristics'] || 'UI.Counters.Characteristics'}</span>
              </h6>
              
              {(() => {
                const { combat, abilities, consumables } = getCharacteristicsByCategory();
                const categories = [
                  { key: 'combat', items: combat },
                  { key: 'abilities', items: abilities },
                  { key: 'consumables', items: consumables }
                ];
                
                return categories.map(({ key: categoryKey, items }) => {
                  const categoryInfo = getCategoryInfo(categoryKey);
                  const categoryHasItems = items.some(item => characteristicsData[item]?.total > 0);
                  
                  if (!categoryHasItems) return null;
                  
                  return (
                    <div key={categoryKey} className="mb-2">
                      <div className={`small text-light opacity-75 fw-bold mb-1 d-flex align-items-center gap-1 category-separator`}
                           style={{borderLeftColor: categoryKey === 'combat' ? '#dc3545' : categoryKey === 'abilities' ? '#0d6efd' : '#ffc107'}}>
                        <span>{categoryInfo.icon}</span>
                        <span>{categoryInfo.title}</span>
                        <span className="text-muted" style={{fontSize: '0.6rem'}}>
                          ({items.filter(item => characteristicsData[item]?.total > 0).length})
                        </span>
                      </div>
                      <div className="row g-1">
                        {items.map(key => {
                          const data = characteristicsData[key];
                          if (data.total === 0) return null;
                          
                          const isFullyUsed = data.available === 0;
                          const isPartiallyUsed = data.available < data.total;
                          const usagePercentage = data.total > 0 ? ((data.total - data.available) / data.total) * 100 : 0;
                          
                          return (
                            <div key={key} className="col-6">
                              <div 
                                className={`text-center p-1 rounded border characteristic-card ${
                                  isFullyUsed 
                                    ? 'bg-danger bg-opacity-10 border-danger border-opacity-25' 
                                    : isPartiallyUsed 
                                    ? 'bg-warning bg-opacity-10 border-warning border-opacity-25'
                                    : 'bg-primary bg-opacity-10 border-primary border-opacity-25'
                                }`}
                                title={getCharacteristicTooltip(key, data)}
                                style={{ cursor: 'help' }}
                              >
                                <div className={`small fw-bold d-flex align-items-center justify-content-center gap-1 ${
                                  isFullyUsed 
                                    ? 'text-danger' 
                                    : isPartiallyUsed 
                                    ? 'text-warning'
                                    : 'text-primary'
                                }`}>
                                  <span>{getCharacteristicIcon(key)}</span>
                                  <span style={{ fontSize: '0.7rem' }}>{getCharacteristicLabel(key)}</span>
                                </div>
                                <div className="text-white fw-bold">
                                  <span className={isFullyUsed ? 'text-danger' : ''}>{data.available}</span>
                                  <span className="text-muted">/</span>
                                  <span className="text-light">{data.total}</span>
                                </div>
                                {/* Barra de progresso visual */}
                                <div className="mt-1" style={{ height: '2px', backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                  <div 
                                    className={`h-100 rounded characteristic-progress-bar ${
                                      isFullyUsed ? 'bg-danger' : isPartiallyUsed ? 'bg-warning' : 'bg-success'
                                    }`}
                                    style={{ width: `${100 - usagePercentage}%` }}
                                  ></div>
                                </div>
                                {isFullyUsed && (
                                  <div className="small text-danger opacity-75" style={{fontSize: '0.6rem'}}>
                                    {localization['UI.PlayerStatus.AllUsed'] || 'UI.PlayerStatus.AllUsed'}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
              
              {Object.values(characteristicsData).every(data => data.total === 0) && (
                <div className="text-muted small text-center">
                  {player.status === 'ready' ? 
                    (player.selections && Object.keys(player.selections).length > 0 ? 
                      (localization['UI.PlayerStatus.NoCharacteristics'] || 'UI.PlayerStatus.NoCharacteristics') : 
                      (localization['UI.PlayerStatus.NoCharacteristicData'] || 'UI.PlayerStatus.NoCharacteristicData')) :
                    (localization['UI.PlayerStatus.WaitingCreation'] || 'UI.PlayerStatus.WaitingCreation')
                  }
                </div>
              )}
            </div>

            {/* Itens Usados */}
            {usedItems.length > 0 && (
              <div className="mb-2">
                <h6 className="text-light small mb-1 fw-bold d-flex align-items-center gap-1">
                  <span>🚫</span>
                  <span>{localization['UI.PlayerStatus.UsedItems'] || 'UI.PlayerStatus.UsedItems'}</span>
                </h6>
                <div className="bg-dark bg-opacity-50 rounded p-2 border border-secondary border-opacity-25">
                  <div className="text-danger small fw-bold mb-1 d-flex align-items-center gap-1">
                    <span>�</span>
                    <span>{usedItems.length} {localization['UI.PlayerStatus.ItemsUsed'] || 'UI.PlayerStatus.ItemsUsed'}</span>
                  </div>
                  {/* Mostrar breakdown dos tipos de itens usados */}
                  <div className="used-items-breakdown">
                    {(() => {
                      const usedByType = {};
                      const usedItemsSet = new Set(usedItems);
                      
                      // Contar itens usados por tipo
                      if (player.selections) {
                        Object.values(player.selections).forEach(selectedItems => {
                          if (Array.isArray(selectedItems)) {
                            selectedItems.forEach(item => {
                              if (usedItemsSet.has(item.ID)) {
                                const type = item.Type;
                                usedByType[type] = (usedByType[type] || 0) + 1;
                              }
                            });
                          }
                        });
                      }
                      
                      return Object.entries(usedByType).map(([type, count]) => {
                        const typeKey = type === 'Attack' ? 'attacks' 
                                      : type === 'Weapon' ? 'weapons'
                                      : type === 'Passive' ? 'passives'
                                      : type === 'Device' ? 'devices'
                                      : type === 'Power' ? 'powers'
                                      : type === 'SpecialAbility' ? 'specials'
                                      : type === 'PassiveSpecialAbility' ? 'passiveSpecials'
                                      : type;
                        
                        return (
                          <div key={type} className="small text-warning-emphasis d-flex justify-content-between align-items-center py-1">
                            <span className="d-flex align-items-center gap-1">
                              <span>{getCharacteristicIcon(typeKey)}</span>
                              <span>{getCharacteristicLabel(typeKey)}:</span>
                            </span>
                            <span className="text-danger fw-bold">{count}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Placeholder para outros status */}
        {player.status !== 'ready' && (
          <div className="text-muted small text-center py-2">
            {player.status === 'creating' ? 
              (localization['UI.PlayerStatus.CreatingCharacter'] || 'UI.PlayerStatus.CreatingCharacter') : 
              (localization['UI.PlayerStatus.WaitingSelection'] || 'UI.PlayerStatus.WaitingSelection')
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerDetailedStatus;
