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
            <div className="mb-3">
              <h6 className="text-light small mb-2 fw-bold">{localization['UI.Counters.Special'] || 'UI.Counters.Special'}</h6>
              <div className="row g-1">
                <div className="col-6">
                  <div className="text-center p-1 bg-success bg-opacity-10 rounded border border-success border-opacity-25">
                    <div className="small text-success fw-bold">{localization['Characteristic.Health'] || 'Characteristic.Health'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.vida, counters.vida_max)}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-1 bg-info bg-opacity-10 rounded border border-info border-opacity-25">
                    <div className="small text-info fw-bold">{localization['Characteristic.DodgePoints'] || 'Characteristic.DodgePoints'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.esquiva, counters.esquiva_max)}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-1 bg-warning bg-opacity-10 rounded border border-warning border-opacity-25">
                    <div className="small text-warning fw-bold">{localization['Characteristic.OportunityAttack'] || 'Characteristic.OportunityAttack'}</div>
                    <div className="text-white fw-bold">{formatCounter(counters.oport, counters.oport_max)}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-1 bg-secondary bg-opacity-10 rounded border border-secondary border-opacity-25">
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
                      <div className="text-center p-1 bg-purple bg-opacity-10 rounded border border-purple border-opacity-25">
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

            {/* Características */}
            <div className="mb-2">
              <h6 className="text-light small mb-2 fw-bold">{localization['UI.Counters.Characteristics'] || 'UI.Counters.Characteristics'}</h6>
              <div className="row g-1">
                {Object.entries(characteristicsData).map(([key, data]) => {
                  // Mostrar apenas características que têm valor total > 0
                  if (data.total > 0) {
                    return (
                      <div key={key} className="col-6">
                        <div className="text-center p-1 bg-primary bg-opacity-10 rounded border border-primary border-opacity-25">
                          <div className="small text-primary fw-bold">{getCharacteristicLabel(key)}</div>
                          <div className="text-white fw-bold">
                            {data.total > 0 ? `${data.available}/${data.total}` : data.available}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
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
                <h6 className="text-light small mb-1 fw-bold">{localization['UI.PlayerStatus.UsedItems'] || 'UI.PlayerStatus.UsedItems'}</h6>
                <div className="text-danger small">
                  {usedItems.length} {localization['UI.PlayerStatus.ItemsUsed'] || 'UI.PlayerStatus.ItemsUsed'}
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
