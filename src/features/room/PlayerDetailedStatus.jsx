import React, { useMemo, useState } from 'react';
import PlayerStatusBadge from './PlayerStatusBadge';
import { getCharacterAdditionalCounters } from '../../utils/AdditionalCountersConfig';

const STYLES = {
  card: { transition: 'all 0.2s ease-in-out', minWidth: 0 },
  cardFallback: { transition: 'all 0.2s ease-in-out' },
  cardBody: { minWidth: 0 },
  section: { background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' },
  counterDot: (color) => ({ width: '6px', height: '6px', borderRadius: '2px', background: color }),
  rowBorder: { borderBottom: '1px solid rgba(255,255,255,0.08)' },
  rowBorderLight: { borderBottom: '1px solid rgba(255,255,255,0.1)' },
  fallbackBox: { background: 'rgba(108,117,125,0.1)', border: '1px solid rgba(108,117,125,0.3)', borderRadius: '6px', padding: '8px 12px' },
  placeholderBox: { background: 'rgba(13,110,253,0.1)', border: '1px solid rgba(13,110,253,0.3)', borderRadius: '6px', padding: '12px 16px' },
  kickBtn: { width: '24px', height: '24px', fontSize: '10px', padding: '0', borderRadius: '50%' },
  profileBtn: { width: '24px', height: '24px', fontSize: '11px', padding: '0', borderRadius: '50%' },
  dimmed: { opacity: 0.5 },
  iconColor: { color: '#17a2b8' },
  charIconColor: { color: '#ffc107' },
};

const PlayerDetailedStatus = ({
  player,
  briefStats = null,
  isCurrentPlayer = false,
  localization = {},
  gameData,
  canKick = false,
  onKickPlayer = null,
  isMaster = false,
  matchStatus = null,
  players = []
}) => {
  const [showBriefStats, setShowBriefStats] = useState(false);

  const actorId = player?.character?.actor?.ID || player?.character?.ID;
  const actorData = useMemo(() => {
    if (actorId && gameData?.ActorDefinitions) {
      return gameData.ActorDefinitions.find((actor) => actor.ID === actorId);
    }
    return null;
  }, [actorId, gameData]);

  const counters = useMemo(() => {
    const vida = player?.counters?.vida ?? 20;
    const vida_max = player?.counters?.vida_max ?? 20;
    const esquiva = player?.counters?.esquiva ?? 0;
    const esquiva_max = player?.counters?.esquiva_max ?? esquiva;
    const oport = player?.counters?.oport ?? 0;
    const oport_max = player?.counters?.oport_max ?? oport;
    const item = player?.counters?.item ?? 0;
    const item_max = player?.counters?.item_max ?? item;

    return {
      vida,
      vida_max,
      esquiva,
      esquiva_max,
      oport,
      oport_max,
      item,
      item_max
    };
  }, [player?.counters]);

  const killCount = useMemo(() => {
    if (!player?.id) return 0;
    return players.filter((p) => p.killed_by_player_id === player.id).length;
  }, [players, player?.id]);

  // Apenas contadores numéricos reais (ignora _notes e textos soltos)
  const numericAdditionalCounters = useMemo(() => {
    let source = {};
    if (player?.additional_counters && Object.keys(player.additional_counters).length > 0) {
      source = player.additional_counters;
    } else if (actorData && gameData) {
      try {
        const characterName = player?.character_name || actorId;
        const derived = getCharacterAdditionalCounters(characterName, {
          actor: actorData,
          gameData,
          localization
        });
        Object.entries(derived || {}).forEach(([k, v]) => {
          source[k] = { ...v, current: 0 };
        });
      } catch (e) {
        source = {};
      }
    }

    return Object.entries(source).filter(
      ([key, counter]) =>
        key !== '_notes' &&
        typeof counter === 'object' &&
        counter !== null &&
        counter.current !== undefined
    );
  }, [player?.additional_counters, actorId, actorData, player?.character_name, gameData, localization]);

  // Calcula características contabilizando Copiador (copycatAssignments) e Nyanja Vlast (convertedPowers)
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

    if (actorData) {
      data.attacks.total = Number(actorData.NumberOfUnlimitedAttacks) || 0;
      data.weapons.total = Number(actorData.NumberOfWeapons) || 0;
      data.passives.total = Number(actorData.NumberOfPassives) || 0;
      data.devices.total = Number(actorData.NumberOfDevices) || 0;
      data.powers.total = Number(actorData.NumberOfPowers) || 0;
      data.specials.total = Number(actorData.NumberOfSpecialAbilities) || 0;
      data.passiveSpecials.total = Number(actorData.NumberOfPassiveSpecialAbilities) || 0;
    }

    if (Object.values(data).every((d) => d.total === 0) && player.characteristics) {
      Object.keys(data).forEach((key) => {
        data[key].total = player.characteristics[key] || 0;
      });
    }

    if (player.selections && typeof player.selections === 'object') {
      const usedItems = new Set(player.used_items || []);
      const unlockedItems = new Set(player.unlocked_items || []);
      const copycatAssignments = player.selections.copycatAssignments || {};
      const convertedPowerIds = new Set(
        Array.isArray(player.selections.convertedPowers) ? player.selections.convertedPowers : []
      );

      const basePowers = Array.isArray(player.selections.powers) ? player.selections.powers : [];
      const convertedPowerItems = basePowers.filter(
        (item) => item?.ID && convertedPowerIds.has(item.ID)
      );

      Object.keys(data).forEach((key) => {
        const baseItems = Array.isArray(player.selections[key]) ? player.selections[key] : [];
        const copiedItems = Object.values(copycatAssignments[key] || {}).filter(Boolean);
        let effectiveItems = [...baseItems, ...copiedItems];

        if (convertedPowerItems.length > 0) {
          if (key === 'powers') {
            effectiveItems = effectiveItems.filter((item) => !convertedPowerIds.has(item?.ID));
            data[key].total = Math.max(0, effectiveItems.length);
          } else if (key === 'passives') {
            effectiveItems = [...effectiveItems, ...convertedPowerItems];
            data[key].total = Math.max(data[key].total, effectiveItems.length);
          }
        } else if (data[key].total === 0) {
          data[key].total = effectiveItems.length;
        }

        if (key === 'passiveSpecials') {
          const unlockedCount = effectiveItems.filter((item) => {
            const itemId = item.ID || item.id || item.Name || item.name;
            return itemId && unlockedItems.has(itemId);
          }).length;
          const maxAvailableByDeaths = Math.min(killCount, data[key].total);
          data[key].available = Math.min(unlockedCount, maxAvailableByDeaths);
        } else if (key === 'specials') {
          const usedCount = effectiveItems.filter((item) => {
            const itemId = item.ID || item.id || item.Name || item.name;
            return itemId && usedItems.has(itemId);
          }).length;
          const maxAvailableByDeaths = Math.min(killCount, data[key].total);
          const availableByUsage = effectiveItems.length - usedCount;
          data[key].available = Math.min(availableByUsage, maxAvailableByDeaths);
        } else {
          const usedCount = effectiveItems.filter((item) => {
            const itemId = item.ID || item.id || item.Name || item.name;
            return itemId && usedItems.has(itemId);
          }).length;
          data[key].available = effectiveItems.length - usedCount;
        }
      });
    } else {
      Object.keys(data).forEach((key) => {
        data[key].available = key === 'passiveSpecials' ? 0 : data[key].total;
      });
    }

    return data;
  }, [player, actorData, killCount]);

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

  const formatCounter = useMemo(
    () => (current, max) => (max && max > 0 ? `${current}/${max}` : current.toString()),
    []
  );

  const counterItems = useMemo(
    () => [
      { key: 'vida', label: localization['Characteristic.Health'] || 'Vida', value: formatCounter(counters.vida, counters.vida_max), color: '#dc3545' },
      { key: 'esquiva', label: localization['Characteristic.DodgePoints'] || 'Esquiva', value: formatCounter(counters.esquiva, counters.esquiva_max), color: '#28a745' },
      { key: 'oport', label: localization['Characteristic.OportunityAttack'] || 'Oport.', value: formatCounter(counters.oport, counters.oport_max), color: '#ffc107' },
      { key: 'itens', label: localization['Characteristic.ExplorationItens'] || 'Itens', value: formatCounter(counters.item, counters.item_max), color: '#6c757d' },
      { key: 'mortes', label: localization['Characteristic.Kills'] || 'Abates', value: killCount, color: '#8b0000' },
      { key: 'defesa', label: localization['Characteristic.DefenseDices'] || 'Dados de defesa', value: actorData?.NumberOfDefenseDices ?? 2, color: '#6610f2' }
    ],
    [counters, actorData?.NumberOfDefenseDices, localization, formatCounter, killCount]
  );

  if (!player?.name) {
    return (
      <article className="card bg-dark border-light h-100" style={STYLES.cardFallback}>
        <div className="card-body p-2 d-flex align-items-center justify-content-center">
          <div className="text-center">
            <div className="text-muted small" style={STYLES.fallbackBox}>
              {localization['UI.PlayerStatus.DataUnavailable'] || 'Dados não disponíveis'}
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="card bg-dark border-light" style={STYLES.card} aria-label={`Status de ${player.name}`}>
      <div className="card-body p-2" style={STYLES.cardBody}>
        {/* Header com Nome e Status */}
        <header className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center flex-grow-1 min-width-0">
            {matchStatus === 'in_progress' && (
              <span
                className="me-1 flex-shrink-0"
                title={
                  player.is_alive !== false
                    ? localization['UI.PlayerStatus.Alive'] || 'Vivo'
                    : localization['UI.PlayerStatus.Eliminated'] || 'Eliminado'
                }
              >
                {player.is_alive !== false ? '🟢' : '💀'}
              </span>
            )}
            <h6
              className="card-title text-white mb-0 me-2 text-truncate"
              style={player.is_alive === false && matchStatus === 'in_progress' ? STYLES.dimmed : undefined}
            >
              {player.name}
            </h6>
          </div>
          <div className="d-flex align-items-center gap-1 flex-shrink-0">
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
            <button
              type="button"
              onClick={() => setShowBriefStats((prev) => !prev)}
              className={`btn btn-sm ${showBriefStats ? 'btn-info' : 'btn-outline-secondary'}`}
              style={STYLES.profileBtn}
              title={showBriefStats ? 'Ocultar perfil do jogador' : 'Ver resumo do perfil do jogador'}
            >
              👤
            </button>
            {canKick && !isCurrentPlayer && !isMaster && onKickPlayer && (
              <button
                type="button"
                onClick={() => onKickPlayer(player)}
                className="btn btn-outline-danger btn-sm"
                style={STYLES.kickBtn}
                title={localization['UI.Room.KickPlayer'] || 'Expulsar jogador'}
              >
                ✕
              </button>
            )}
          </div>
        </header>

        {/* Status Badge Original */}
        <div className="mb-2">
          <PlayerStatusBadge
            player={player}
            isCurrentPlayer={isCurrentPlayer}
            localization={localization}
          />
        </div>

        {/* Resumo Breve da Conta do Jogador (Expansível ao clicar em 👤) */}
        {showBriefStats && (
          <section className="mb-2" style={{ ...STYLES.section, animation: 'fadeIn 0.16s ease-out' }} aria-label="Resumo do perfil">
            <h6 className="text-light mb-2 fw-bold d-flex justify-content-between align-items-center small">
              <span>
                <span className="me-1" style={STYLES.iconColor}>👤</span>
                {briefStats ? briefStats.display_name : 'Perfil da Conta'}
              </span>
              {briefStats && (
                <span className="text-info" style={{ fontSize: '0.75rem' }}>
                  ⭐ {briefStats.composite_score || 0} pts
                </span>
              )}
            </h6>

            {briefStats ? (
              <div className="small">
                <div className="d-flex justify-content-between align-items-center py-1" style={STYLES.rowBorder}>
                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>Partidas / Vitórias</span>
                  <span className="text-white fw-bold" style={{ fontSize: '0.82rem' }}>
                    {briefStats.total_matches || 0} / <span className="text-success">{briefStats.total_wins || 0}</span>
                  </span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-1" style={STYLES.rowBorder}>
                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>Win Rate</span>
                  <span className="text-warning fw-bold" style={{ fontSize: '0.82rem' }}>
                    {briefStats.win_rate || 0}%
                  </span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-1" style={STYLES.rowBorder}>
                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>Eliminações Totais</span>
                  <span className="text-danger fw-bold" style={{ fontSize: '0.82rem' }}>
                    {briefStats.total_eliminations || 0}
                  </span>
                </div>
                {briefStats.favorite_character && (
                  <div className="d-flex justify-content-between align-items-center py-1">
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>Personagem Favorito</span>
                    <span className="text-info fw-bold text-truncate ms-2" style={{ fontSize: '0.8rem', maxWidth: '55%' }}>
                      {briefStats.favorite_character}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted text-center py-1" style={{ fontSize: '0.78rem' }}>
                Jogador convidado ou sem histórico registrado.
              </div>
            )}
          </section>
        )}

        {/* Contadores e Características - só mostrar se o jogador estiver pronto */}
        {player.status === 'ready' && (
          <>
            {/* Contadores Básicos */}
            <section className="mb-2" style={STYLES.section} aria-label="Contadores do jogador">
              <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                <span className="me-2" style={STYLES.iconColor}>⚡</span>
                {localization['UI.Counters.Special'] || 'Contadores'}
              </h6>
              <div className="small">
                {counterItems.map(({ key, label, value, color }) => (
                  <div key={key} className="d-flex justify-content-between align-items-center py-1" style={STYLES.rowBorder}>
                    <span className="d-flex align-items-center text-truncate me-2" style={{ maxWidth: '65%' }}>
                      <span className="me-2 flex-shrink-0" style={STYLES.counterDot(color)} />
                      <span className="text-muted text-truncate" style={{ fontSize: '0.8rem' }}>{label}</span>
                    </span>
                    <span className="text-white fw-bold flex-shrink-0" style={{ fontSize: '0.85rem' }}>{value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Contadores Adicionais Numéricos */}
            {numericAdditionalCounters.length > 0 && (
              <section className="mb-2" style={STYLES.section} aria-label="Contadores especiais">
                <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                  <span className="me-2" style={STYLES.iconColor}>📊</span>
                  {localization['UI.AdditionalCounters.Title'] || 'Contadores Especiais'}
                </h6>
                <div className="small">
                  {numericAdditionalCounters.map(([key, counter]) => {
                    const displayText = counter.max ? `${counter.current}/${counter.max}` : counter.current.toString();
                    let color = '#17a2b8';
                    if (counter.max) {
                      if (counter.current === 0) color = '#dc3545';
                      else if (counter.current < counter.max / 2) color = '#ffc107';
                      else color = '#198754';
                    }
                    const label = counter.label || key.replace('SpecialCustom.', '').replace(/\d+$/, '');
                    return (
                      <div key={key} className="d-flex justify-content-between align-items-center py-1" style={STYLES.rowBorder}>
                        <span className="d-flex align-items-center text-truncate me-2" style={{ maxWidth: '65%' }}>
                          {counter.icon && <span className="me-1 flex-shrink-0" style={{ fontSize: '0.9em' }}>{counter.icon}</span>}
                          <span className="me-2 flex-shrink-0" style={STYLES.counterDot(color)} />
                          <span className="text-muted text-truncate" style={{ fontSize: '0.75rem' }} title={label}>{label}</span>
                        </span>
                        <span className="fw-bold flex-shrink-0" style={{ fontSize: '0.8rem', color }}>{displayText}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Características */}
            <section className="mb-2" style={STYLES.section} aria-label="Características do personagem">
              <h6 className="text-light mb-2 fw-bold d-flex align-items-center small">
                <span className="me-2" style={STYLES.charIconColor}>🎯</span>
                {localization['Characteristic.Title'] || 'Características'}
              </h6>

              <div className="small">
                {Object.entries(characteristicsData)
                  .filter(([, data]) => data.total > 0)
                  .map(([key, data]) => {
                    const characteristicLabel = getCharacteristicLabel(key);
                    const isConsumable = !['attacks', 'weapons', 'passives', 'passiveSpecials'].includes(key);
                    const isPassiveSpecial = key === 'passiveSpecials';

                    const displayText =
                      isConsumable || isPassiveSpecial
                        ? `${data.available}/${data.total}`
                        : `${data.available}`;

                    let textColor;
                    if (isPassiveSpecial) {
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
                      <div
                        key={key}
                        className="d-flex justify-content-between align-items-center py-1"
                        style={STYLES.rowBorderLight}
                      >
                        <span
                          className="text-muted text-truncate me-2"
                          style={{ fontSize: '0.8rem', maxWidth: '72%' }}
                          title={characteristicLabel}
                        >
                          {characteristicLabel}
                        </span>
                        <span className={`fw-bold ${textColor} flex-shrink-0`} style={{ fontSize: '0.85rem' }}>
                          {displayText}
                        </span>
                      </div>
                    );
                  })}

                {Object.values(characteristicsData).every((data) => data.total === 0) && (
                  <div className="text-muted text-center py-2">
                    {localization['UI.PlayerStatus.NoCharacteristics'] || 'Nenhuma característica disponível'}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* Placeholder para outros status */}
        {player.status !== 'ready' && (
          <div className="text-center py-3">
            <div className="text-muted" style={STYLES.placeholderBox}>
              {player.status === 'creating' ? (
                <>
                  <div>⚒️ {localization['UI.PlayerStatus.CreatingCharacter'] || 'Montando personagem'}</div>
                  {player.character_name && (
                    <strong className="text-info d-block mt-1">{player.character_name}</strong>
                  )}
                </>
              ) : (
                localization['UI.PlayerStatus.WaitingSelection'] || 'Aguardando seleção'
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
};

export default PlayerDetailedStatus;