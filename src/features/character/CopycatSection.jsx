import React, { useState, useMemo, useCallback } from 'react';
import { Utils } from '../../utils/cardFormatter';
import { sanitizeHtml } from '../../utils/sanitize';
import BaseModal from '../../components/BaseModal';

const CATEGORY_SOURCE_MAP = {
  attacks: { listKey: 'AttackDefinitions', prefix: 'Attack.' },
  weapons: { listKey: 'AttackDefinitions', prefix: 'Weapon.' },
  passives: { listKey: 'PassiveDefinitions', prefix: 'Passive.' },
  devices: { listKey: 'ConsumableDefinitions', prefix: 'Device.' },
  powers: { listKey: 'ConsumableDefinitions', prefix: 'Power.' },
  specials: { listKey: 'ConsumableDefinitions', prefix: 'SpecialAbility.' },
  passiveSpecials: { listKey: 'PassiveDefinitions', prefix: 'PassiveSpecialAbility.' }
};

const CopycatSection = ({
  section,
  totalSlots = 0,
  actor,
  currentMode = 'mode1',
  players = [],
  gameData,
  localization = {},
  copycatAssignments = {},
  onAssignCopy,
  exposedCards = new Set(),
  onToggleCardExposure,
  usedItems = new Set(),
  onUseItem,
  onRecoverItems,
  unlockedItems = new Set(),
  onUnlockItem,
  onLockItems
}) => {
  const [activeSlotKey, setActiveSlotKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isSoloMode = !Array.isArray(players) || players.length === 0;

  const closeSlotModal = useCallback(() => {
    setActiveSlotKey(null);
    setSearchQuery('');
  }, []);

  const categoryAssignments = useMemo(
    () => copycatAssignments?.[section.key] || {},
    [copycatAssignments, section.key]
  );

  // Lista de slots garantindo leitura compatível com chaves 'slot_0' ou legadas '0'
  const slots = useMemo(() => {
    const count = Number(totalSlots) || 0;
    return Array.from({ length: count }, (_, idx) => {
      const slotKey = `slot_${idx}`;
      const assignedItem = categoryAssignments[slotKey] ?? categoryAssignments[idx] ?? null;
      return { index: idx, slotKey, item: assignedItem };
    });
  }, [totalSlots, categoryAssignments]);

  const alreadyCopiedIds = useMemo(() => {
    const ids = new Set();
    slots.forEach((s) => {
      if (s.item?.ID) ids.add(s.item.ID);
    });
    return ids;
  }, [slots]);

  const hasAnyCopiedItem = useMemo(() => slots.some((s) => Boolean(s.item)), [slots]);

  // Mapa rápido de definições válidas para esta categoria (acesso O(1))
  const categoryDefinitionsMap = useMemo(() => {
    const mapping = CATEGORY_SOURCE_MAP[section.key];
    const map = new Map();
    if (!mapping || !gameData?.[mapping.listKey]) return map;

    (gameData[mapping.listKey] || []).forEach((def) => {
      if (def && typeof def.ID === 'string' && def.ID.startsWith(mapping.prefix)) {
        map.set(def.ID, def);
      }
    });
    return map;
  }, [gameData, section.key]);

  // Mapa rápido de qual personagem é dono de cada carta (para descrições com 2 modos)
  const itemOwnerActorMap = useMemo(() => {
    if (gameData?.indexes?.ownerActorMap) {
      return gameData.indexes.ownerActorMap;
    }

    const map = new Map();
    const actorsList = gameData?.ActorDefinitions || [];
    const dataFields = [
      'UnlimitedAttacksData',
      'WeaponsData',
      'PassivesData',
      'DevicesData',
      'PowersData',
      'SpecialAbilitiesData',
      'PassiveSpecialAbilitiesData'
    ];
    actorsList.forEach((act) => {
      dataFields.forEach((field) => {
        if (Array.isArray(act[field])) {
          act[field].forEach((id) => {
            if (!map.has(id)) map.set(id, act);
          });
        }
      });
    });
    return map;
  }, [gameData?.indexes?.ownerActorMap, gameData?.ActorDefinitions]);

  const getItemTitle = (item) => {
    if (!item) return '';
    if (['device', 'power', 'special'].includes(section.type)) {
      return Utils.createTriggerName(item.ID, item, localization);
    }
    return localization[item.ID] || item.Name || item.ID;
  };

  const getItemDescription = (item) => {
    if (!item) return '';
    const sourceActor = itemOwnerActorMap.get(item.ID) || actor;

    if (['attack', 'weapon'].includes(section.type)) {
      if (Utils.modeSystem?.hasModes?.(sourceActor) && item.modes) {
        return Utils.createDualModeDescription(item, localization, sourceActor);
      }
      return Utils.createAttackDescription(item, localization, currentMode);
    }

    if (
      Utils.modeSystem?.hasModes?.(sourceActor) &&
      item.modeRestriction &&
      ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
    ) {
      return Utils.createModeRestrictedDescription(item, localization, sourceActor);
    }

    return localization[item.Description] || item.Description || '';
  };

  // MULTIPLAYER: apenas cartas já reveladas pelos outros jogadores (Cartas na Mesa + histórico da partida)
  const revealedRoomCandidates = useMemo(() => {
  const mapping = CATEGORY_SOURCE_MAP[section.key];
  if (!mapping) return [];

  const list = [];
  const seen = new Set();

  (players || []).forEach((p) => {
    const pActorId = p.actor_id ?? p.character?.actor?.ID ?? p.character?.ID;
    if (String(pActorId ?? '').toLowerCase() === 'copiador') return;

    const currentlyExposed = Array.isArray(p.exposed_cards) ? p.exposed_cards : [];

    currentlyExposed.forEach((itemId) => {
      if (typeof itemId !== 'string' || !itemId.startsWith(mapping.prefix)) return;

      const uniqueKey = `${p.id}_${itemId}`;
      if (seen.has(uniqueKey)) return;

      const item = categoryDefinitionsMap.get(itemId);
      if (!item) return;

      seen.add(uniqueKey);
      list.push({
        item,
        isCurrentlyOnTable: true,
        sourceLabel: `${p.name}${p.character_name ? ` (${p.character_name})` : ''}`
      });
    });
  });

  return list;
}, [players, section.key, categoryDefinitionsMap]);

  // MODO SOLO: sem outros jogadores na sala, libera o catálogo da categoria
  const soloCatalogCandidates = useMemo(() => {
    if (!isSoloMode) return [];
    return Array.from(categoryDefinitionsMap.values()).map((item) => {
      const owner = itemOwnerActorMap.get(item.ID);
      const ownerName = owner ? localization[`Character.Name.${owner.ID}`] || owner.ID : '';
      return {
        item,
        isCurrentlyOnTable: false,
        sourceLabel: ownerName
      };
    });
  }, [isSoloMode, categoryDefinitionsMap, itemOwnerActorMap, localization]);

  const candidateItems = isSoloMode ? soloCatalogCandidates : revealedRoomCandidates;

  const openSlotModal = (slotKey) => {
    setActiveSlotKey(slotKey);
    setSearchQuery('');
  };

  const handleSelectCandidate = (item) => {
    if (!activeSlotKey || typeof onAssignCopy !== 'function') return;
    onAssignCopy(activeSlotKey, section.key, item);
    closeSlotModal();
  };

  const handleClearSlot = (slotKey) => {
    if (typeof onAssignCopy !== 'function') return;
    onAssignCopy(slotKey, section.key, null);
  };

  const filteredCandidates = useMemo(() => {
    const q = String(searchQuery ?? '').trim().toLowerCase();
    if (!q) return candidateItems;

    return candidateItems.filter(({ item, sourceLabel }) => {
      const titleStr = String(getItemTitle(item) ?? '').toLowerCase();
      const sourceStr = String(sourceLabel ?? '').toLowerCase();
      const idStr = String(item.ID ?? '').toLowerCase();
      return titleStr.includes(q) || sourceStr.includes(q) || idStr.includes(q);
    });
  }, [candidateItems, searchQuery]);

  if (!totalSlots || totalSlots <= 0) return null;

  const isPassiveSpecial = section.type === 'passiveSpecial';

  return (
    <section className="mb-4" aria-label={section.title}>
      <h4 className={`text-${section.color}`}>{section.title}:</h4>

      <div className="row g-2 mb-2 justify-content-center">
        {slots.map(({ index, slotKey, item: copiedItem }) => {
          // Slot Vazio
          if (!copiedItem) {
            return (
              <article key={slotKey} className="col-12 md:col-3">
                <div
                  className={`card border-${section.color} h-100`}
                  style={{
                    borderStyle: 'dashed',
                    background: 'var(--bs-gray-800)',
                    color: '#fff',
                    minHeight: '140px'
                  }}
                >
                  <div className="card-body d-flex flex-column justify-content-center align-items-center text-center p-3">
                    <small className="text-muted mb-2">
                      {localization['UI.Copycat.EmptySlot'] ||
                        `${localization['UI.Copycat.Slot'] || 'Slot'} ${index + 1}`}
                    </small>
                    <button
                      type="button"
                      className={`btn btn-sm btn-outline-${section.color}`}
                      onClick={() => openSlotModal(slotKey)}
                    >
                      ➕ {localization['UI.Copycat.CopyCard'] || 'Copiar Carta'}
                    </button>
                  </div>
                </div>
              </article>
            );
          }

          // Slot Preenchido com Carta Copiada
          const title = getItemTitle(copiedItem);
          const desc = getItemDescription(copiedItem);
          const isUsed = usedItems.has(copiedItem.ID);
          const isUnlocked = unlockedItems.has(copiedItem.ID);
          const isExposed = exposedCards.has(copiedItem.ID);

          let cardOpacity = '';
          if (isPassiveSpecial) {
            cardOpacity = isUnlocked ? '' : ' opacity-50';
          } else if (isUsed) {
            cardOpacity = ' bg-dark opacity-75';
          }

          return (
            <article key={slotKey} className="col-12 md:col-3">
              <div
                className={`card border-${section.color} h-100${cardOpacity}${
                  isExposed ? ' card-exposed' : ''
                } position-relative`}
                style={{ background: 'var(--bs-gray-800)', color: '#fff' }}
              >
                {/* Botão de Expor na Mesa (👁️) */}
                {typeof onToggleCardExposure === 'function' && (
                  <button
                    type="button"
                    className={`btn btn-sm position-absolute ${
                      isExposed ? 'btn-success' : 'btn-outline-secondary'
                    }`}
                    style={{
                      top: '5px',
                      right: '5px',
                      zIndex: 2,
                      width: '24px',
                      height: '24px',
                      padding: 0,
                      fontSize: '12px'
                    }}
                    onClick={() => onToggleCardExposure(copiedItem.ID)}
                    title={
                      isExposed
                        ? localization['UI.CharacterSheet.HideFromTable'] || 'Ocultar da mesa'
                        : localization['UI.CharacterSheet.ExposeOnTable'] || 'Expor na mesa'
                    }
                  >
                    👁️
                  </button>
                )}

                <div
                  className="card-body p-2 d-flex flex-column justify-content-between"
                  style={{ paddingTop: '30px' }}
                >
                  <div>
                    <div className={`fw-bold text-${section.color} mb-1 pe-4`}>
                      {title}
                      {isPassiveSpecial && !isUnlocked
                        ? ` (${localization['UI.CharacterSheet.Locked'] || 'Bloqueado'})`
                        : ''}
                    </div>
                    <div className="mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(desc) }} />
                  </div>

                  {/* Botões de Ação da Carta Copiada */}
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top border-secondary">
                    <div className="d-flex flex-wrap gap-1">
                      {isPassiveSpecial && typeof onUnlockItem === 'function' && (
                        <button
                          type="button"
                          className={`btn btn-sm btn-outline-${section.color}`}
                          onClick={() => onUnlockItem(copiedItem.ID)}
                          disabled={isUnlocked}
                        >
                          {isUnlocked
                            ? localization['UI.CharacterSheet.Unlocked'] || 'Desbloqueado'
                            : localization['UI.CharacterSheet.Unlock'] || 'Desbloquear'}
                        </button>
                      )}

                      {section.useButton && !isPassiveSpecial && typeof onUseItem === 'function' && (
                        <button
                          type="button"
                          className={`btn btn-sm ${isUsed ? 'btn-outline-secondary' : `btn-outline-${section.color}`}`}
                          onClick={() => onUseItem(copiedItem.ID)}
                          title={isUsed ? 'Clique novamente para desfazer o uso' : undefined}
                        >
                          {isUsed
                            ? `${localization['UI.CharacterSheet.Used'] || 'Usado'} ↩`
                            : localization['UI.CharacterSheet.Use'] || 'Usar'}
                        </button>
                      )}
                    </div>

                    <div className="d-flex gap-1 ms-auto">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        style={{ padding: '2px 7px', fontSize: '0.75rem' }}
                        onClick={() => openSlotModal(slotKey)}
                        title={localization['UI.Copycat.SwapCard'] || 'Trocar carta copiada'}
                      >
                        🔄
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        style={{ padding: '2px 7px', fontSize: '0.75rem' }}
                        onClick={() => handleClearSlot(slotKey)}
                        title={localization['UI.Copycat.ClearSlot'] || 'Remover cópia deste slot'}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Botão de Recuperar / Bloquear Todos para as cartas copiadas desta categoria */}
      {hasAnyCopiedItem && isPassiveSpecial && typeof onLockItems === 'function' && (
        <div className="text-center mb-4">
          <button type="button" className={`btn btn-sm btn-${section.color}`} onClick={onLockItems}>
            {localization['UI.CharacterSheet.LockAll'] || 'Bloquear Todos'}
          </button>
        </div>
      )}

      {hasAnyCopiedItem && section.useButton && !isPassiveSpecial && typeof onRecoverItems === 'function' && (
        <div className="text-center mb-4">
          <button type="button" className={`btn btn-sm btn-${section.color}`} onClick={onRecoverItems}>
            {localization['UI.CharacterSheet.RecoverAll'] || 'Recuperar'} {section.title}
          </button>
        </div>
      )}

      {/* Modal de Seleção de Carta Revelada para Copiar */}
      <BaseModal
        show={Boolean(activeSlotKey)}
        onClose={closeSlotModal}
        title={`🪞 ${localization['UI.Copycat.SelectToCopy'] || 'Copiar'} ${section.title}`}
        subtitle={
          isSoloMode
            ? 'Modo Solo: escolha qualquer carta desta categoria'
            : 'Apenas cartas já reveladas pelos jogadores nas Cartas da Mesa'
        }
        borderVariant={section.color}
        size="lg"
        footer={
          <button type="button" className="btn btn-secondary btn-sm px-3" onClick={closeSlotModal}>
            {localization['UI.Common.Close'] || 'Fechar'}
          </button>
        }
      >
        {/* Barra de Busca (só mostra se houver cartas disponíveis) */}
        {candidateItems.length > 0 && (
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <small className="text-muted">
              👁️ {candidateItems.length}{' '}
              {candidateItems.length === 1 ? 'carta revelada' : 'cartas reveladas'}
            </small>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ maxWidth: '260px' }}
              placeholder={localization['UI.Common.Search'] || 'Buscar carta ou jogador...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Lista de Cartas Reveladas */}
        <div style={{ maxHeight: '55vh', overflowY: 'auto', overflowX: 'hidden' }}>
          {filteredCandidates.length === 0 ? (
            <div className="text-center text-muted py-4">
              {candidateItems.length === 0
                ? localization['UI.Copycat.NoneExposed'] ||
                  'Nenhum jogador expôs esta característica.'
                : localization['UI.Copycat.NoCardsFound'] || 'Nenhuma carta encontrada.'}
            </div>
          ) : (
            <div className="row g-2">
              {filteredCandidates.map(({ item, sourceLabel, isCurrentlyOnTable }, idx) => {
                const isAlreadyCopied = alreadyCopiedIds.has(item.ID);
                return (
                  <article key={`${item.ID}_${idx}`} className="col-12 md:col-6">
                    <div
                      className={`card h-100 border-${section.color} ${
                        isAlreadyCopied ? 'opacity-50' : 'cursor-pointer'
                      }`}
                      style={{ cursor: isAlreadyCopied ? 'not-allowed' : 'pointer' }}
                      onClick={() => !isAlreadyCopied && handleSelectCandidate(item)}
                    >
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                          <strong className={`text-${section.color} small`}>
                            {getItemTitle(item)}
                          </strong>
                          <div className="d-flex align-items-center gap-1 flex-shrink-0">
                            {!isSoloMode && isCurrentlyOnTable && (
                              <span
                                className="badge bg-success"
                                style={{ fontSize: '0.65rem' }}
                                title="Atualmente exposta nas Cartas da Mesa"
                              >
                                👁️ Na mesa
                              </span>
                            )}
                            {sourceLabel && (
                              <span
                                className="badge bg-secondary"
                                style={{ fontSize: '0.68rem' }}
                              >
                                {sourceLabel}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className="small text-light"
                          style={{ fontSize: '0.8rem' }}
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(getItemDescription(item))
                          }}
                        />
                        {isAlreadyCopied && (
                          <small className="text-warning d-block mt-1 fw-bold">
                            ✓ {localization['UI.Copycat.AlreadyCopied'] || 'Já copiada em outro slot'}
                          </small>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </BaseModal>
    </section>
  );
};

export default CopycatSection;