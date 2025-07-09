import React, { useState, useEffect, useMemo } from 'react';
import Counter from './Counter';
import CharacteristicCard from './CharacteristicCard';
import SpecialCharacteristics from './SpecialCharacteristics';
import AdditionalCounters from './AdditionalCounters';
import { Utils } from '../utils/Utils';
import { RoomService } from '../services/roomService';
import { getCharacterAdditionalCounters } from '../utils/AdditionalCountersConfig';

const CharacterSheet = ({ actor, selections, gameData, localization, onReset, currentPlayer }) => {
  const [counters, setCounters] = useState({
    vida: 20,
    vida_max: 20,
    esquiva: 0,
    esquiva_max: 0,
    oport: 0,
    oport_max: 0,
    item: 0,
    item_max: 0
  });
  
  const [currentMode, setCurrentMode] = useState('mode1');
  const [usedItems, setUsedItems] = useState(new Set());
  const [unlockedItems, setUnlockedItems] = useState(new Set()); // Novo estado para itens desbloqueados
  const [additionalCounters, setAdditionalCounters] = useState({});

  // Memoizar contadores iniciais
  const initialCounters = useMemo(() => ({
    vida: 20,
    vida_max: 20,
    esquiva: 0,
    esquiva_max: actor?.DodgePoints || 0,
    oport: 0,
    oport_max: actor?.OportunityAttacks || 0,
    item: 0,
    item_max: actor?.ExplorationItens || 0
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

  const handleCounterChange = async (id, value) => {
    const newCounters = {
      ...counters,
      [id]: value
      // IMPORTANTE: NÃO alterar o valor máximo automaticamente!
      // O valor máximo deve ser fixo baseado nas características do personagem
    };
    
    setCounters(newCounters);
    
    // Sincronizar com o banco de dados
    if (currentPlayer?.id) {
      await RoomService.updatePlayerCounters(currentPlayer.id, newCounters);
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
          className={`card border-${section.color} h-100${cardOpacity}`} 
          style={{background: 'var(--bs-gray-800)', color: '#fff'}}
        >
          <div className="card-body p-2">
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
              Utils.modeSystem.getModes(actor).map((mode, index) => (
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
              ))
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
      </div>

      <div className="row justify-content-center">
        <CharacteristicCard actor={actor} localization={localization} />
      </div>

      <div id="character-items">
        {itemSections.map(renderItemSection)}
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
        <button className="btn btn-secondary" onClick={onReset}>
          Reiniciar
        </button>
      </div>
    </div>
  );
};

export default CharacterSheet;
