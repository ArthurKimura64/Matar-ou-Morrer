import React, { useMemo } from 'react';
import PlayerStatusBadge from './PlayerStatusBadge';

const PlayerDetailedStatus = ({ 
  player, 
  isCurrentPlayer = false, 
  localization = {}, 
  gameData,
  canKick = false,
  onKickPlayer = null,
  isMaster = false
}) => {
  // Memoizar contadores para evitar recalcular
  // Buscar dados do personagem (actorData) para acessar NumberOfDefenseDices
  const actorData = useMemo(() => {
    if (player?.character_name && gameData?.ActorDefinitions) {
      return gameData.ActorDefinitions.find(actor => actor.ID === player.character_name);
    }
    return null;
  }, [player?.character_name, gameData]);

  const counters = useMemo(() => ({
    vida: player?.counters?.vida ?? 20,
    vida_max: player?.counters?.vida_max ?? 20,
    esquiva: player?.counters?.esquiva ?? 0,
    esquiva_max: player?.counters?.esquiva_max ?? 0,
    oport: player?.counters?.oport ?? 0,
    oport_max: player?.counters?.oport_max ?? 0,
    item: player?.counters?.item ?? 0,
    item_max: player?.counters?.item_max ?? 0,
    mortes: player?.counters?.mortes ?? 0
    // defesa removido daqui
  }), [player?.counters]);

  // Memoizar contadores adicionais
  const additionalCounters = useMemo(() => 
    player?.additional_counters || {}, [player?.additional_counters]
  );

  // Memoizar dados de características otimizados
  const characteristicsData = useMemo(() => {
    if (!player) return {};
    
    const data = {
      attacks: { total: 0, available: 0 },
      weapons: { total: 0, available: 0 },
      passives: { total: 0, available: 0 },
      devices: { total: 0, available: 0 },
      powers: { total: 0, available: 0 },
      specials: { total: 0, available: 0 },
      passiveSpecials: { total: 0, available: 0 }
    };
    
    // Obter dados do ActorDefinitions (primeira prioridade)
    if (player.character_name && gameData?.ActorDefinitions) {
      const actorData = gameData.ActorDefinitions.find(actor => actor.ID === player.character_name);
      
      if (actorData) {
        data.attacks.total = actorData.NumberOfUnlimitedAttacks || 0;
        data.weapons.total = actorData.NumberOfWeapons || 0;
        data.passives.total = actorData.NumberOfPassives || 0;
        data.devices.total = actorData.NumberOfDevices || 0;
        data.powers.total = actorData.NumberOfPowers || 0;
        data.specials.total = actorData.NumberOfSpecialAbilities || 0;
        data.passiveSpecials.total = actorData.NumberOfPassiveSpecialAbilities || 0;
      }
    }
    
    // Fallback para características salvas
    if (Object.values(data).every(d => d.total === 0) && player.characteristics) {
      Object.keys(data).forEach(key => {
        data[key].total = player.characteristics[key] || 0;
      });
    }
    
    // Calcular disponíveis baseado nas seleções
    if (player.selections && typeof player.selections === 'object') {
      const usedItems = new Set(player.used_items || []);
      const unlockedItems = new Set(player.unlocked_items || []);
      
      Object.entries(player.selections).forEach(([key, selectedItems]) => {
        if (Array.isArray(selectedItems) && data[key]) {
          // Se não há totais definidos, usar tamanho das seleções
          if (data[key].total === 0) {
            data[key].total = selectedItems.length;
          }
          
          // Para habilidades passivas especiais, contar apenas os desbloqueados
          if (key === 'passiveSpecials') {
            const unlockedCount = selectedItems.filter(item => {
              const itemId = item.ID || item.id || item.Name || item.name;
              return itemId && unlockedItems.has(itemId);
            }).length;
            
            // Calcular disponíveis baseado nas mortes (1 por morte)
            const deathCount = counters.mortes || 0;
            const maxAvailableByDeaths = Math.min(deathCount, data[key].total);
            data[key].available = Math.min(unlockedCount, maxAvailableByDeaths);
          } else if (key === 'specials') {
            // Para habilidades especiais, considerar mortes para disponibilidade
            const usedCount = selectedItems.filter(item => {
              const itemId = item.ID || item.id || item.Name || item.name;
              return itemId && usedItems.has(itemId);
            }).length;
            
            // Calcular disponíveis baseado nas mortes (1 por morte)
            const deathCount = counters.mortes || 0;
            const maxAvailableByDeaths = Math.min(deathCount, data[key].total);
            const availableByUsage = selectedItems.length - usedCount;
            data[key].available = Math.min(availableByUsage, maxAvailableByDeaths);
          } else {
            // Para outros tipos, contar itens não utilizados
            const usedCount = selectedItems.filter(item => {
              const itemId = item.ID || item.id || item.Name || item.name;
              return itemId && usedItems.has(itemId);
            }).length;
            
            data[key].available = selectedItems.length - usedCount;
          }
        }
      });
    } else {
      // Sem seleções, usar totais como disponíveis (exceto passiveSpecials que começam em 0)
      Object.keys(data).forEach(key => {
        data[key].available = key === 'passiveSpecials' ? 0 : data[key].total;
      });
    }
    
    return data;
  }, [player, gameData, counters.mortes]);

  // Memoizar labels para evitar recalcular
  const getCharacteristicLabel = useMemo(() => {
    const labels = {
      attacks: localization['Characteristic.Attack.Title'] || 'Ataques sem Limites',
      weapons: localization['Characteristic.Weapon.Title'] || 'Armas Primárias',
      passives: localization['Characteristic.Passive.Title'] || 'Habilidades Passivas',
      devices: localization['Characteristic.Device.Title'] || 'Dispositivos',
      powers: localization['Characteristic.Power.Title'] || 'Poderes',
      specials: localization['Characteristic.SpecialAbility.Title'] || 'Habilidades Especiais',
      passiveSpecials: localization['Characteristic.PassiveSpecialAbility.Title'] || 'Habilidades Especiais Passivas'
    };
    return (key) => labels[key] || key;
  }, [localization]);

  const getShortCharacteristicLabel = useMemo(() => {
    const shortLabels = {
      attacks: 'Ataques',
      weapons: 'Armas',
      passives: 'Passivas',
      devices: 'Dispositivos',
      powers: 'Poderes',
      specials: 'Especiais',
      passiveSpecials: 'Pass. Esp.'
    };
    return (key) => shortLabels[key] || getCharacteristicLabel(key);
  }, [getCharacteristicLabel]);

  // Função otimizada para formatação de contadores
  const formatCounter = useMemo(() => (current, max) => {
    return max && max > 0 && max !== current ? `${current}/${max}` : current.toString();
  }, []);

  // Validação após hooks
  if (!player?.name) {
    return (
      <div className="card bg-dark border-light h-100" style={{ transition: 'all 0.2s ease-in-out' }}>
        <div className="card-body p-2 d-flex align-items-center justify-content-center">
          <div className="text-center">
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

  // Se não há dados válidos, exibir mensagem de fallback
  if (!player || !player.name) {
    return (
      <div className="card bg-dark border-light h-100" style={{ transition: 'all 0.2s ease-in-out' }}>
        <div className="card-body p-2 d-flex align-items-center justify-content-center">
          <div className="text-center">
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
    <div className="card bg-dark border-light h-100" style={{ transition: 'all 0.2s ease-in-out', minWidth: 0 }}>
      <div className="card-body p-2" style={{ minWidth: 0 }}>
        {/* Header com Nome e Status - Mais Compacto */}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center flex-grow-1 min-width-0">
            <h6 className="card-title text-white mb-0 fw-bold me-2 text-truncate">
              {player.name}
            </h6>
          </div>
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {isMaster && (
              <span className="badge bg-warning text-dark">
                👑 {localization['UI.Room.Master'] || 'Mestre'}
              </span>
            )}
            {isCurrentPlayer && (
              <span className="badge bg-primary">
                {localization['UI.You'] || 'Você'}
              </span>
            )}
            {canKick && !isCurrentPlayer && !isMaster && onKickPlayer && (
              <button
                onClick={() => onKickPlayer(player)}
                className="btn btn-outline-danger btn-sm"
                style={{ 
                  width: '24px', 
                  height: '24px',
                  fontSize: '10px',
                  padding: '0',
                  borderRadius: '50%'
                }}
                title={localization['UI.Room.KickPlayer'] || 'Expulsar jogador'}
              >
                ✕
              </button>
            )}
          </div>
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
                <div className="col-sm-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)' }}>
                    <span className="text-muted text-truncate me-1" style={{ fontSize: '0.8rem' }}>{localization['Characteristic.Health'] || 'Vida'}</span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>{formatCounter(counters.vida, counters.vida_max)}</span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" style={{ background: 'rgba(40,167,69,0.1)', border: '1px solid rgba(40,167,69,0.2)' }}>
                    <span className="text-muted text-truncate me-1" style={{ fontSize: '0.8rem' }}>{localization['Characteristic.DodgePoints'] || 'Esquiva'}</span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>{formatCounter(counters.esquiva, counters.esquiva_max)}</span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.2)' }}>
                    <span className="text-muted text-truncate me-1" style={{ fontSize: '0.8rem' }}>{localization['Characteristic.OportunityAttack'] || 'Oport.'}</span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>{formatCounter(counters.oport, counters.oport_max)}</span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" style={{ background: 'rgba(108,117,125,0.1)', border: '1px solid rgba(108,117,125,0.2)' }}>
                    <span className="text-muted text-truncate me-1" style={{ fontSize: '0.8rem' }}>{localization['Characteristic.ExplorationItens'] || 'Itens'}</span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>{formatCounter(counters.item, counters.item_max)}</span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" style={{ background: 'rgba(139,0,0,0.1)', border: '1px solid rgba(139,0,0,0.2)' }}>
                    <span className="text-muted text-truncate me-1" style={{ fontSize: '0.8rem' }}>{localization['Characteristic.Deaths'] || 'Mortes'}</span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>{counters.mortes || 0}</span>
                  </div>
                </div>
                <div className="col-sm-12">
                  <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" style={{ background: 'rgba(102,16,242,0.1)', border: '1px solid rgba(102,16,242,0.2)' }}>
                    <span className="text-muted text-truncate me-1" style={{ fontSize: '0.8rem' }}>{localization['Characteristic.DefenseDices'] || 'Dados de defesa'}</span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>
                      {actorData?.NumberOfDefenseDices ?? 2}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contadores Adicionais - Otimizado */}
            {Object.keys(additionalCounters).length > 0 && (
              <div className="mb-2" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' }}>
                <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                  <span className="me-2" style={{ color: '#17a2b8' }}>📊</span>
                  {localization['UI.AdditionalCounters.Title'] || 'Contadores Especiais'}
                </h6>
                
                <div className="row g-2">
                  {Object.entries(additionalCounters).map(([key, counter]) => {
                    if (typeof counter !== 'object' || counter.current === undefined) return null;
                    
                    const displayText = counter.max ? `${counter.current}/${counter.max}` : counter.current.toString();
                    
                    // Definir cores baseado no status de forma otimizada
                    let colorClass = 'text-info';
                    let bgColor = 'rgba(23,162,184,0.1)';
                    let borderColor = 'rgba(23,162,184,0.2)';
                    
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
                    
                    const colClass = Object.keys(additionalCounters).length <= 2 ? "col-6" : "col-12 col-sm-6";
                    
                    return (
                      <div key={key} className={colClass}>
                        <div className="d-flex justify-content-between align-items-center py-1 px-1 px-sm-2 rounded" 
                             style={{ background: bgColor, border: `1px solid ${borderColor}`, minHeight: '28px' }}>
                          <span className="text-muted d-flex align-items-center text-truncate" style={{ maxWidth: '65%', minWidth: 0 }}>
                            {counter.icon && <span className="me-1 flex-shrink-0" style={{ fontSize: '0.7em' }}>{counter.icon}</span>}
                            <span className="text-truncate" style={{ fontSize: '0.75rem' }} title={counter.label || key}>
                              {counter.label || key.replace('SpecialCustom.', '').replace(/\d+$/, '')}
                            </span>
                          </span>
                          <span className={`fw-bold ${colorClass} flex-shrink-0`} style={{ fontSize: '0.8rem' }}>{displayText}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Características - Otimizado */}
            <div className="mb-2" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' }}>
              <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                <span className="me-2" style={{ color: '#ffc107' }}>🎯</span>
                {localization['Characteristic.Title'] || 'Características'}
              </h6>
              
              <div className="small">
                {Object.entries(characteristicsData)
                  .filter(([, data]) => data.total > 0)
                  .map(([key, data]) => {
                    const characteristicLabel = getCharacteristicLabel(key);
                    const shortLabel = getShortCharacteristicLabel(key);
                    const isConsumable = !['attacks', 'weapons', 'passives', 'passiveSpecials'].includes(key);
                    const isPassiveSpecial = key === 'passiveSpecials';
                    
                    // Para passiveSpecials, mostrar desbloqueados/total
                    const displayText = isConsumable ? `${data.available}/${data.total}` : 
                                       isPassiveSpecial ? `${data.available}/${data.total}` : 
                                       `${data.available}`;
                    
                    let textColor;
                    if (isPassiveSpecial) {
                      // Para passiveSpecials: verde se todos desbloqueados, amarelo se parcial, cinza se nenhum
                      if (data.available === 0) {
                        textColor = 'text-muted';
                      } else if (data.available < data.total) {
                        textColor = 'text-warning';
                      } else {
                        textColor = 'text-success';
                      }
                    } else if (data.available === 0) {
                      textColor = isConsumable ? 'text-danger' : 'text-muted';
                    } else if (isConsumable && data.available < data.total) {
                      textColor = 'text-warning';
                    } else {
                      textColor = 'text-success';
                    }
                    
                    return (
                      <div key={key} className="d-flex justify-content-between align-items-center py-1" 
                           style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span className="text-muted text-truncate me-2" style={{ fontSize: '0.8rem', maxWidth: '65%' }} title={characteristicLabel}>
                          <span className="d-inline d-sm-none">{shortLabel}</span>
                          <span className="d-none d-sm-inline">{characteristicLabel}</span>
                        </span>
                        <span className={`fw-bold ${textColor} flex-shrink-0`} style={{ fontSize: '0.85rem' }}>{displayText}</span>
                      </div>
                    );
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
