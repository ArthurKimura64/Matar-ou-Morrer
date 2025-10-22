import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Counter from './Counter';
import CharacteristicCard from './CharacteristicCard';
import SpecialCharacteristics from './SpecialCharacteristics';
import AdditionalCounters from './AdditionalCounters';
import { Utils } from '../utils/Utils';
import { RoomService } from '../services/roomService';
import { getCharacterAdditionalCounters } from '../utils/AdditionalCountersConfig';

// Map from sheet section key to selections key in player data
const TYPE_KEY_MAP = {
  attacks: 'attacks',
  weapons: 'weapons',
  passives: 'passives',
  devices: 'devices',
  powers: 'powers',
  specials: 'specials',
  passiveSpecials: 'passiveSpecials'
};

const CharacterSheet = ({ actor, selections, gameData, localization, onReset, currentPlayer, players = [] }) => {
  const [counters, setCounters] = useState({
    vida: 20,
    vida_max: 20,
    esquiva: 0,
    esquiva_max: 0,
    oport: 0,
    oport_max: 0,
    item: 0,
    item_max: 0,
    mortes: 0
  });
  
  const [currentMode, setCurrentMode] = useState('mode1');
  const [usedItems, setUsedItems] = useState(new Set());
  const [unlockedItems, setUnlockedItems] = useState(new Set()); // Novo estado para itens desbloqueados
  const [additionalCounters, setAdditionalCounters] = useState({});
  const [exposedCards, setExposedCards] = useState(new Set()); // Estado para cartas expostas na mesa
  const [copycatAssignments, setCopycatAssignments] = useState({}); // slots ocupados pelo Copiador
  const [isSelectingSource, setIsSelectingSource] = useState(null); // {slotKey, type} quando escolhendo a origem

  // Memoizar contadores iniciais
  const initialCounters = useMemo(() => ({
    vida: 20,
    vida_max: 20,
    esquiva: 0,
    esquiva_max: actor?.DodgePoints || 0,
    oport: 0,
    oport_max: actor?.OportunityAttacks || 0,
    item: 0,
    item_max: actor?.ExplorationItens || 0,
    mortes: 0
  }), [actor]);

  // Memoizar características calculadas
  const calculatedCharacteristics = useMemo(() => {
    if (!actor || !selections) return {};
    
    const newCharacteristics = {
      attacks: 0, weapons: 0, passives: 0,
      devices: 0, powers: 0, specials: 0, passiveSpecials: 0,
      consumables: 0, equipment: 0, modifications: 0
    };

    // Contar características selecionadas
    Object.entries(selections).forEach(([key, selectedItems]) => {
      if (Array.isArray(selectedItems)) {
        selectedItems.forEach(item => {
          const type = item.Type;
          switch(type) {
            case 'Attack': newCharacteristics.attacks++; break;
            case 'Weapon': newCharacteristics.weapons++; break;
            case 'Passive': newCharacteristics.passives++; break;
            case 'Device': newCharacteristics.devices++; break;
            case 'Power': newCharacteristics.powers++; break;
            case 'SpecialAbility': newCharacteristics.specials++; break;
            case 'PassiveSpecialAbility': newCharacteristics.passiveSpecials++; break;
            case 'Consumable': newCharacteristics.consumables++; break;
            case 'Equipment': newCharacteristics.equipment++; break;
            case 'Modification': newCharacteristics.modifications++; break;
            default: break;
          }
        });
      }
    });

    return newCharacteristics;
  }, [actor, selections]);

  // Inicializar itens usados a partir dos dados do jogador
  useEffect(() => {
    if (currentPlayer?.used_items) {
      setUsedItems(new Set(currentPlayer.used_items));
    }
  }, [currentPlayer?.used_items]);

  // Inicializar itens desbloqueados a partir dos dados do jogador
  useEffect(() => {
    if (currentPlayer?.unlocked_items) {
      setUnlockedItems(new Set(currentPlayer.unlocked_items));
    }
  }, [currentPlayer?.unlocked_items]);

  // Inicializar cartas expostas a partir dos dados do jogador
  useEffect(() => {
    if (currentPlayer?.exposed_cards) {
      setExposedCards(new Set(currentPlayer.exposed_cards));
    }
  }, [currentPlayer?.exposed_cards]);

  // Calcular características do personagem criado - Otimizado
  useEffect(() => {
    if (actor && selections && currentPlayer?.id) {
      // Definir valores dos contadores baseados no personagem
      setCounters(prev => ({ ...prev, ...initialCounters }));

      // Sincronizar com o banco de dados
      RoomService.updatePlayerCharacteristics(currentPlayer.id, calculatedCharacteristics);
      
      // Sincronizar seleções
      RoomService.updatePlayerSelections(currentPlayer.id, selections).catch(error => {
        console.error('❌ Falha ao salvar seleções:', error);
      });

      // Sincronizar contadores principais com o banco
      RoomService.updatePlayerCounters(currentPlayer.id, initialCounters);
      
      // Configurar contadores adicionais baseados nas SpecialCharacteristics
      const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID;
      const additionalCountersData = getCharacterAdditionalCounters(characterName, { 
        actor, 
        selections, 
        gameData, 
        localization 
      });
      
      // Na ficha, os contadores especiais devem começar em 0, não no máximo
      const resetCountersData = {};
      Object.entries(additionalCountersData).forEach(([key, counter]) => {
        resetCountersData[key] = {
          ...counter,
          current: 0 // Começar sempre em 0 na ficha
        };
      });
      
      setAdditionalCounters(resetCountersData);
      
      // Sincronizar contadores adicionais
      RoomService.updatePlayerAdditionalCounters(currentPlayer.id, resetCountersData);
    }
  }, [actor, selections, currentPlayer?.id, localization, gameData, initialCounters, calculatedCharacteristics]);

  // Determinar se é o Copiador e preparar slots vazios
  const isCopycat = useMemo(() => actor?.ID?.toLowerCase() === 'copiador', [actor?.ID]);

  const copycatSlots = useMemo(() => {
    if (!isCopycat) return {};
    return {
      attacks: (typeof actor.NumberOfUnlimitedAttacks === 'number' && actor.NumberOfUnlimitedAttacks) || (actor.UnlimitedAttacksData || []).length || 0,
      weapons: (typeof actor.NumberOfWeapons === 'number' && actor.NumberOfWeapons) || (actor.WeaponsData || []).length || 0,
      passives: (typeof actor.NumberOfPassives === 'number' && actor.NumberOfPassives) || (actor.PassivesData || []).length || 0,
      devices: (typeof actor.NumberOfDevices === 'number' && actor.NumberOfDevices) || (actor.DevicesData || []).length || 0,
      powers: (typeof actor.NumberOfPowers === 'number' && actor.NumberOfPowers) || (actor.PowersData || []).length || 0,
      specials: (typeof actor.NumberOfSpecialAbilities === 'number' && actor.NumberOfSpecialAbilities) || (actor.SpecialAbilitiesData || []).length || 0,
      passiveSpecials: (typeof actor.NumberOfPassiveSpecialAbilities === 'number' && actor.NumberOfPassiveSpecialAbilities) || (actor.PassiveSpecialAbilitiesData || []).length || 0
    };
  }, [isCopycat, actor]);

  // Persistir assignments do Copiador
  useEffect(() => {
    if (!isCopycat || !currentPlayer?.id) return;
    RoomService.updatePlayerSelections(currentPlayer.id, { ...selections, copycatAssignments });
  }, [copycatAssignments, isCopycat, currentPlayer?.id, selections]);

  // Memoize assigned item IDs across all copycat slots
  const assignedIds = useMemo(() => {
    const ids = new Set();
    Object.values(copycatAssignments || {}).forEach(map => {
      Object.values(map || {}).forEach(it => { if (it && it.ID) ids.add(it.ID); });
    });
    return ids;
  }, [copycatAssignments]);

  // Construir lista de candidatos com a característica/type desejado
  const getAvailableSources = useCallback((type) => {
    const key = TYPE_KEY_MAP[type];
    if (!key) return [];

    const currentSlotKey = isSelectingSource?.slotKey;

    return (players || [])
      .map(p => {
        const exposedNow = new Set(p.exposed_cards || []);
        const actorId = p.character?.actor?.ID;
        const everMap = (p.app_state && p.app_state.ever_exposed_cards) || {};
        const everSet = new Set((actorId && everMap[actorId]) || []);
        const rawItems = (p.character?.selections?.[key] || []);
        const items = rawItems
          .filter(it => it && (exposedNow.has(it.ID) || everSet.has(it.ID)))
          .map(it => {
            if (it && it.ID && it.Type) return it;
            const findIn = [
              gameData.AttackDefinitions || [],
              gameData.PassiveDefinitions || [],
              gameData.ConsumableDefinitions || [],
              gameData.SpecialDefinitions || [],
            ];
            for (const list of findIn) {
              const found = list.find(d => d.ID === (it.ID || it));
              if (found) return found;
            }
            return it;
          })
          .filter(it => {
            if (!it || !it.ID) return false;
            const assignedToCurrentSlot = (copycatAssignments[type] && copycatAssignments[type][currentSlotKey] && copycatAssignments[type][currentSlotKey].ID === it.ID);
            if (assignedIds.has(it.ID) && !assignedToCurrentSlot) return false;
            return true;
          });
        return { playerId: p.id, playerName: p.name, items };
      })
      .filter(entry => entry.items && entry.items.length > 0);
  }, [players, gameData.AttackDefinitions, gameData.PassiveDefinitions, gameData.ConsumableDefinitions, gameData.SpecialDefinitions, isSelectingSource?.slotKey, copycatAssignments, assignedIds]);

  const handleOpenCopySelect = (slotKey, type) => {
    setIsSelectingSource({ slotKey, type });
  };

  const handleAssignCopy = (slotKey, type, item) => {
    setCopycatAssignments(prev => ({
      ...prev,
      [type]: {
        ...(prev[type] || {}),
        [slotKey]: item
      }
    }));
    setIsSelectingSource(null);
  };

  const handleCounterChange = async (id, value) => {
    const newCounters = {
      ...counters,
      [id]: value
      // IMPORTANTE: NÃO alterar o valor máximo automaticamente!
      // O valor máximo deve ser fixo baseado nas características do personagem
    };
    
    setCounters(newCounters);
    
    // Lógica especial para o contador de mortes
    if (id === 'mortes') {
      if (value > counters.mortes) {
        // Aumentou mortes - desbloquear habilidades
        await handleDeathUnlock(value);
      } else if (value < 2 && currentMode === 'mode2') {
        // Diminuiu mortes para menos de 2 e está no modo Reivolk - forçar modo normal
        setCurrentMode('mode1');
      }
    }
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerCounters(currentPlayer.id, newCounters);
    }
  };

  // Função para desbloquear habilidades com base nas mortes
  const handleDeathUnlock = async (deathCount) => {
    if (!selections.specials && !selections.passiveSpecials) return;
    
    const newUnlockedItems = new Set(unlockedItems);
    const currentDeaths = counters.mortes;
    
    // Para cada nova morte, desbloquear uma habilidade especial e uma passiva especial
    for (let i = currentDeaths; i < deathCount; i++) {
      // Obter habilidades especiais não desbloqueadas
      const availableSpecials = (selections.specials || []).filter(item => !newUnlockedItems.has(item.ID));
      // Obter habilidades passivas especiais não desbloqueadas
      const availablePassiveSpecials = (selections.passiveSpecials || []).filter(item => !newUnlockedItems.has(item.ID));
      
      // Desbloquear uma habilidade especial se disponível
      if (availableSpecials.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableSpecials.length);
        const selectedSpecial = availableSpecials[randomIndex];
        newUnlockedItems.add(selectedSpecial.ID);
        console.log(`💀 Morte ${i + 1}: Habilidade Especial desbloqueada:`, selectedSpecial.ID);
      }
      
      // Desbloquear uma habilidade passiva especial se disponível
      if (availablePassiveSpecials.length > 0) {
        const randomIndex = Math.floor(Math.random() * availablePassiveSpecials.length);
        const selectedPassiveSpecial = availablePassiveSpecials[randomIndex];
        newUnlockedItems.add(selectedPassiveSpecial.ID);
        console.log(`💀 Morte ${i + 1}: Habilidade Passiva Especial desbloqueada:`, selectedPassiveSpecial.ID);
      }
    }
    
    setUnlockedItems(newUnlockedItems);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerUnlockedItems(currentPlayer.id, Array.from(newUnlockedItems));
    }
    
    // Mostrar notificação se alcançou 2 mortes
    if (deathCount >= 2 && currentDeaths < 2) {
      console.log('🔥 Modo Reivolk desbloqueado!');
    }
  };

  const handleAdditionalCounterChange = async (newAdditionalCounters) => {
    setAdditionalCounters(newAdditionalCounters);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerAdditionalCounters(currentPlayer.id, newAdditionalCounters);
    }
  };

  // Memoizar seções de itens
  const itemSections = useMemo(() => [
    { key: 'attacks', title: localization['Characteristic.Attack.Title'], color: 'danger', type: 'attack' },
    { key: 'weapons', title: localization['Characteristic.Weapon.Title'], color: 'danger', type: 'weapon' },
    { key: 'passives', title: localization['Characteristic.Passive.Title'], color: 'success', type: 'passive' },
    { key: 'devices', title: localization['Characteristic.Device.Title'], color: 'info', type: 'device', useButton: true },
    { key: 'powers', title: localization['Characteristic.Power.Title'], color: 'primary', type: 'power', useButton: true },
    { key: 'specials', title: localization['Characteristic.SpecialAbility.Title'], color: 'warning', type: 'special', useButton: true },
    { key: 'passiveSpecials', title: localization['Characteristic.PassiveSpecialAbility.Title'], color: 'warning', type: 'passiveSpecial' }
  ], [localization]);

  const handleModeChange = (mode) => {
    setCurrentMode(mode);
  };

  const handleUseItem = async (itemId) => {
    const newUsedItems = new Set([...usedItems, itemId]);
    setUsedItems(newUsedItems);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerUsedItems(currentPlayer.id, Array.from(newUsedItems));
    }
  };

  const handleUnlockItem = async (itemId) => {
    const newUnlockedItems = new Set([...unlockedItems, itemId]);
    setUnlockedItems(newUnlockedItems);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerUnlockedItems(currentPlayer.id, Array.from(newUnlockedItems));
    }
  };

  const handleRecoverItems = async (type) => {
    const itemsToRecover = selections[type] || [];
    const newUsedItems = new Set(usedItems);
    itemsToRecover.forEach(item => newUsedItems.delete(item.ID));
    
    setUsedItems(newUsedItems);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerUsedItems(currentPlayer.id, Array.from(newUsedItems));
    }
  };

  const handleLockItems = async (type) => {
    const itemsToLock = selections[type] || [];
    const newUnlockedItems = new Set(unlockedItems);
    itemsToLock.forEach(item => newUnlockedItems.delete(item.ID));
    
    setUnlockedItems(newUnlockedItems);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerUnlockedItems(currentPlayer.id, Array.from(newUnlockedItems));
    }
  };

  const handleToggleCardExposure = async (itemId) => {
    const newExposedCards = new Set(exposedCards);
    
    if (newExposedCards.has(itemId)) {
      newExposedCards.delete(itemId);
    } else {
      newExposedCards.add(itemId);
    }
    
    setExposedCards(newExposedCards);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerExposedCards(currentPlayer.id, Array.from(newExposedCards));

      // Se acabou de expor (ligar o olho), registrar no histórico permanente do jogador atual
      if (newExposedCards.has(itemId)) {
        try {
          const actorId = actor?.ID;
          // Fetch latest player row to avoid overwriting concurrent changes
          const latest = await RoomService.getPlayer(currentPlayer.id);
          const appState = (latest.success && latest.player && latest.player.app_state) ? latest.player.app_state : (currentPlayer.app_state || {});
          const ever = { ...(appState.ever_exposed_cards || {}) };
          const list = new Set([...(ever[actorId] || [])]);
          list.add(itemId);
          ever[actorId] = Array.from(list);
          await RoomService.updatePlayerAppState(currentPlayer.id, { ...appState, ever_exposed_cards: ever });
        } catch (e) {
          console.error('Falha ao registrar histórico de exposição:', e);
        }
      }
    }
  };

  const handleReset = async () => {
    // Limpar cartas expostas antes de fazer reset
    if (currentPlayer?.id) {
      await RoomService.updatePlayerExposedCards(currentPlayer.id, []);
      // Remover histórico apenas do personagem atual (reinício da ficha)
      try {
        const actorId = actor?.ID;
        const appState = currentPlayer.app_state || {};
        const ever = { ...(appState.ever_exposed_cards || {}) };
        if (actorId && ever[actorId]) {
          delete ever[actorId];
          await RoomService.updatePlayerAppState(currentPlayer.id, { ...appState, ever_exposed_cards: ever });
        }
      } catch (e) {
        console.error('Erro ao limpar histórico deste personagem no reset:', e);
      }
    }
    
    // Limpar estado local
    setExposedCards(new Set());
    
    // Chamar função de reset original
    onReset();
  };

  const renderItemCard = ({ item, section, isBlocked }) => {
    // Título: se for device, power, special, mostrar TriggerType
    let title = '';
    if (["device", "power", "special"].includes(section.type)) {
      title = Utils.createTriggerName(item.ID, item, localization);
    } else {
      title = localization[item.ID] || item.ID;
    }
    const desc = ['attack', 'weapon'].includes(section.type)
      ? (Utils.modeSystem.hasModes(actor) && item.modes
          ? Utils.createDualModeDescription(item, localization, actor)
          : Utils.createAttackDescription(item, localization, currentMode))
      : (Utils.modeSystem.hasModes(actor) && ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
          ? Utils.createModeRestrictedDescription(item, localization, actor)
          : localization[item.Description] || item.Description || "");

    const isUsed = usedItems.has(item.ID);
    const isUnlocked = unlockedItems.has(item.ID);
    const isExposed = exposedCards.has(item.ID);
    const isPassiveSpecial = section.type === 'passiveSpecial';

    // Para habilidades passivas especiais, o estado padrão é bloqueado
    let cardOpacity = '';
    if (isPassiveSpecial) {
      cardOpacity = isUnlocked ? '' : ' opacity-50'; // Bloqueado por padrão, claro quando desbloqueado
    } else {
      cardOpacity = isBlocked ? ' opacity-50' : ''; // Comportamento normal para outros tipos
      if (isUsed) cardOpacity += ' bg-dark opacity-75';
    }

    return (
      <div key={item.ID} className="col-12 col-md-3">
        <div 
          className={`card border-${section.color} h-100${cardOpacity} position-relative`} 
          style={{background: 'var(--bs-gray-800)', color: '#fff'}}
        >
          {/* Ícone de olho no canto superior direito */}
          <button 
            className={`btn btn-sm position-absolute ${isExposed ? 'btn-success' : 'btn-outline-secondary'}`}
            style={{ 
              top: '5px', 
              right: '5px', 
              zIndex: 1,
              width: '24px',
              height: '24px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px'
            }}
            onClick={() => handleToggleCardExposure(item.ID)}
            title={isExposed ? 'Ocultar da mesa' : 'Expor na mesa'}
          >
            👁️
          </button>
          <div className="card-body p-2" style={{ paddingTop: '30px' }}>
            <div className={`fw-bold text-${section.color} mb-1`}>
              {title}
              {isBlocked && !isPassiveSpecial ? ` (${localization['UI.CharacterSheet.ModeRestricted'] || 'UI.CharacterSheet.ModeRestricted'})` : ''}
              {isPassiveSpecial && !isUnlocked ? ` (${localization['UI.CharacterSheet.Locked'] || 'Bloqueado'})` : ''}
            </div>
            <div 
              className="mb-2" 
              dangerouslySetInnerHTML={{ __html: desc }}
            />
            {/* Botões para habilidades passivas especiais */}
            {isPassiveSpecial && !isBlocked && (
              <button 
                className={`btn btn-sm btn-outline-${section.color}`}
                onClick={() => handleUnlockItem(item.ID)}
                disabled={isUnlocked}
              >
                {isUnlocked ? (localization['UI.CharacterSheet.Unlocked'] || 'Desbloqueado') : (localization['UI.CharacterSheet.Unlock'] || 'Desbloquear')}
              </button>
            )}
            {/* Botões para outros tipos com useButton */}
            {section.useButton && !isBlocked && !isPassiveSpecial && (
              <button 
                className={`btn btn-sm btn-outline-${section.color}`}
                disabled={isUsed}
                onClick={() => handleUseItem(item.ID)}
              >
                {isUsed ? (localization['UI.CharacterSheet.Used'] || 'UI.CharacterSheet.Used') : (localization['UI.CharacterSheet.Use'] || 'UI.CharacterSheet.Use')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderItemSection = (section) => {
    const items = selections[section.key] || [];
    if (!items.length) return null;

    const isPassiveSpecial = section.type === 'passiveSpecial';

    return (
      <div key={section.key} className="mb-4">
        <h4 className={`text-${section.color}`}>{section.title}:</h4>
        <div className="row g-2 mb-2 justify-content-center">
          {items.map(item => {
            const isBlocked = Utils.transformationSystem.hasTransformation(actor) &&
              !Utils.transformationSystem.canUseItem(item, currentMode === 'mode2', actor);
            
            return renderItemCard({ item, section, isBlocked });
          })}
        </div>
        
        {/* Botões para habilidades passivas especiais */}
        {isPassiveSpecial && (
          <div className="text-center mb-4">
            <button 
              className={`btn btn-sm btn-${section.color} me-2`}
              onClick={() => handleLockItems(section.key)}
            >
              {localization['UI.CharacterSheet.LockAll'] || 'Bloquear Todos'}
            </button>
          </div>
        )}
        
        {/* Botões para outros tipos com useButton */}
        {section.useButton && !isPassiveSpecial && (
          <div className="text-center mb-4">
            <button 
              className={`btn btn-sm btn-${section.color}`}
              onClick={() => handleRecoverItems(section.key)}
            >
              {localization['UI.CharacterSheet.RecoverAll'] || 'Recuperar'} {section.title}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render de slots do Copiador quando não há seleções próprias
  const renderCopycatSection = (section) => {
    const total = copycatSlots[section.key] || 0;
    if (total <= 0) return null;

    const assignedByType = copycatAssignments[section.key] || {};

    const sources = isSelectingSource?.type === section.key ? getAvailableSources(section.key) : [];

    return (
      <div key={`copycat-${section.key}`} className="mb-4">
        <h4 className={`text-${section.color}`}>{section.title}:</h4>
        <div className="row g-2 mb-2 justify-content-center">
          {Array.from({ length: total }).map((_, idx) => {
            const slotKey = `${section.key}-${idx+1}`;
            const assigned = assignedByType[slotKey];
            return (
              <div key={slotKey} className="col-12 col-md-3">
                <div className={`card border-${section.color} h-100`} style={{background: 'var(--bs-gray-800)', color: '#fff'}}>
                  <div className="card-body p-2">
                    {!assigned ? (
                      <>
                        <div className={`fw-bold text-${section.color} mb-1`}>Slot {idx+1}</div>
                        {isSelectingSource && isSelectingSource.slotKey === slotKey ? (
                          <div className="small">
                            {sources.length === 0 && (
                              <div className="text-muted">Nenhum jogador expôs esta característica.</div>
                            )}
                            {sources.map(src => (
                              <div key={src.playerId} className="mb-3">
                                <div className="fw-semibold mb-1">{src.playerName}</div>
                                <div className="row g-2">
                                  {src.items.map(it => {
                                    const title = (["device","power","special"].includes(section.type))
                                      ? Utils.createTriggerName(it.ID, it, localization)
                                      : (localization[it.ID] || it.ID);
                                    const desc = (['attack','weapon'].includes(section.type)
                                      ? (Utils.modeSystem.hasModes(actor) && it.modes
                                          ? Utils.createDualModeDescription(it, localization, actor)
                                          : Utils.createAttackDescription(it, localization, currentMode))
                                      : (Utils.modeSystem.hasModes(actor) && ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
                                          ? Utils.createModeRestrictedDescription(it, localization, actor)
                                          : (localization[it.Description] || it.Description || ""))
                                    );
                                    return (
                                      <div key={it.ID} className="col-12">
                                        <div className={`card border-${section.color}`} style={{background: 'var(--bs-gray-900)', color: '#fff'}}>
                                          <div className="card-body p-2">
                                            <div className={`fw-bold text-${section.color} mb-1`}>{title}</div>
                                            <div className="mb-2" dangerouslySetInnerHTML={{ __html: desc }} />
                                            <button
                                              className={`btn btn-sm btn-${section.color}`}
                                              onClick={() => handleAssignCopy(slotKey, section.key, it)}
                                            >
                                              {localization['Characteristic.Select'] || 'Selecionar'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            <button className="btn btn-sm btn-secondary" onClick={() => setIsSelectingSource(null)}>Cancelar</button>
                          </div>
                        ) : (
                          <button 
                            className={`btn btn-sm btn-outline-${section.color}`}
                            onClick={() => handleOpenCopySelect(slotKey, section.key)}
                          >
                            adicionar {section.title}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className={`fw-bold text-${section.color} mb-1`}>{localization[assigned.ID] || assigned.ID}</div>
                        <div className="mb-2" dangerouslySetInnerHTML={{ __html: (['attack','weapon'].includes(section.type)
                          ? (Utils.modeSystem.hasModes(actor) && assigned.modes
                              ? Utils.createDualModeDescription(assigned, localization, actor)
                              : Utils.createAttackDescription(assigned, localization, currentMode))
                          : (Utils.modeSystem.hasModes(actor) && ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
                              ? Utils.createModeRestrictedDescription(assigned, localization, actor)
                              : localization[assigned.Description] || "")
                        ) }} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="card col-12 col-md-12 mx-auto my-5 p-4">
      <h2 className="text-center mb-4">{localization['UI.CharacterSheet.Title'] || 'UI.CharacterSheet.Title'}</h2>
      <h3 className="text-center mb-3">
        {localization[`Character.Name.${actor.ID}`]} ({localization[`Character.Title.${actor.ID}`]})
      </h3>
      
      {localization[`Character.Description.${actor.ID}`] && (
        <div 
          className="col-10 mb-4 px-3"
          dangerouslySetInnerHTML={{ __html: localization[`Character.Description.${actor.ID}`] }}
        />
      )}

      {Utils.transformationSystem.hasTransformation(actor) && (
        <div className="text-center mb-3">
          <div className="btn-group" role="group">
            {Utils.modeSystem.hasModes(actor) ? (
              Utils.modeSystem.getModes(actor).map((mode, index) => {
                return (
                  <React.Fragment key={mode}>
                    <input 
                      type="radio" 
                      className="btn-check" 
                      name="transformation-mode" 
                      id={`mode-${mode}`}
                      checked={currentMode === mode}
                      onChange={() => handleModeChange(mode)}
                    />
                    <label 
                      className={`btn btn-outline-${mode === 'mode2' ? 'danger' : 'warning'}`} 
                      htmlFor={`mode-${mode}`}
                    >
                      {Utils.modeSystem.getModeName(actor, mode, localization)}
                    </label>
                  </React.Fragment>
                );
              })
            ) : (
              <>
                <input 
                  type="radio" 
                  className="btn-check" 
                  name="transformation-mode" 
                  id="mode-mode1"
                  checked={currentMode === 'mode1'}
                  onChange={() => handleModeChange('mode1')}
                />
                <label className="btn btn-outline-warning" htmlFor="mode-mode1">
                  {localization['UI.CharacterSheet.ModeNormal'] || 'UI.CharacterSheet.ModeNormal'}
                </label>
                <input 
                  type="radio" 
                  className="btn-check" 
                  name="transformation-mode" 
                  id="mode-mode2"
                  checked={currentMode === 'mode2'}
                  onChange={() => handleModeChange('mode2')}
                />
                <label className="btn btn-outline-danger" htmlFor="mode-mode2">
                  {localization['UI.CharacterSheet.ModeTransformed'] || 'UI.CharacterSheet.ModeTransformed'}
                </label>
              </>
            )}
          </div>
          {/* Mostrar descrição do modo */}
          <div className="mt-2 small text-muted">
            {Utils.transformationSystem.getTransformationName(actor, localization)}
          </div>
        </div>
      )}

      <div className="mb-3 row justify-content-center text-center">
        <Counter
          id="vida"
          title={localization['Characteristic.Health'] || 'Characteristic.Health'}
          value={counters.vida}
          min={0}
          max={null}
          onChange={(value) => handleCounterChange('vida', value)}
        />
        <Counter
          id="esquiva"
          title={localization['Characteristic.DodgePoints'] || 'Characteristic.DodgePoints'}
          value={counters.esquiva}
          min={0}
          max={null}
          onChange={(value) => handleCounterChange('esquiva', value)}
        />
        <Counter
          id="oport"
          title={localization['Characteristic.OportunityAttack'] || 'Characteristic.OportunityAttack'}
          value={counters.oport}
          min={0}
          max={null}
          onChange={(value) => handleCounterChange('oport', value)}
        />
        <Counter
          id="item"
          title={localization['Characteristic.ExplorationItens'] || 'Characteristic.ExplorationItens'}
          value={counters.item}
          min={0}
          max={null}
          onChange={(value) => handleCounterChange('item', value)}
        />
        <Counter
          id="mortes"
          title={localization['Characteristic.Deaths'] || 'Mortes'}
          value={counters.mortes}
          min={0}
          max={null}
          onChange={(value) => handleCounterChange('mortes', value)}
        />
      </div>

      <div className="row justify-content-center">
        <CharacteristicCard actor={actor} localization={localization} deathCount={counters.mortes} />
      </div>

      <div id="character-items">
        {/* Se não for Copiador, render normal; se for, render slots de cópia quando não houver seleções próprias */}
        {!isCopycat && itemSections.map(renderItemSection)}
        {isCopycat && itemSections.map(section => (
          (selections[section.key] && selections[section.key].length > 0)
            ? renderItemSection(section)
            : renderCopycatSection(section)
        ))}
      </div>

      <SpecialCharacteristics 
        actor={actor} 
        gameData={gameData} 
        localization={localization} 
      />

      {/* Contadores Adicionais no final da ficha */}
      <AdditionalCounters
        additionalCounters={additionalCounters}
        onCounterChange={handleAdditionalCounterChange}
        playerId={currentPlayer?.id}
        localization={localization}
      />

      <div className="text-center mt-4">
        <button className="btn btn-secondary" onClick={handleReset}>
          Reiniciar
        </button>
      </div>
    </div>
  );
};

export default CharacterSheet;
