import React, { useState, useEffect } from 'react';
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
    esquiva: 0, // Começar em 0
    esquiva_max: 0,
    oport: 0, // Começar em 0
    oport_max: 0,
    item: 0, // Começar em 0
    item_max: 0
  });
  
  const [currentMode, setCurrentMode] = useState('mode1');
  const [usedItems, setUsedItems] = useState(new Set());
  const [additionalCounters, setAdditionalCounters] = useState({});

  // Inicializar itens usados a partir dos dados do jogador
  useEffect(() => {
    if (currentPlayer?.used_items) {
      setUsedItems(new Set(currentPlayer.used_items));
    }
  }, [currentPlayer?.used_items]);

  // Calcular características do personagem criado
  useEffect(() => {
    if (actor && selections && currentPlayer?.id) {
      const newCharacteristics = {
        attacks: 0, weapons: 0, passives: 0,
        devices: 0, powers: 0, specials: 0, passiveSpecials: 0,
        consumables: 0, equipment: 0, modifications: 0
      };

      // Contar características selecionadas
      Object.entries(selections).forEach(([key, selectedItems]) => {
        if (Array.isArray(selectedItems)) {
          selectedItems.forEach(item => {
            if (item.Type === 'Attack') newCharacteristics.attacks++;
            else if (item.Type === 'Weapon') newCharacteristics.weapons++;
            else if (item.Type === 'Passive') newCharacteristics.passives++;
            else if (item.Type === 'Device') newCharacteristics.devices++;
            else if (item.Type === 'Power') newCharacteristics.powers++;
            else if (item.Type === 'SpecialAbility') newCharacteristics.specials++;
            else if (item.Type === 'PassiveSpecialAbility') newCharacteristics.passiveSpecials++;
            else if (item.Type === 'Consumable') newCharacteristics.consumables++;
            else if (item.Type === 'Equipment') newCharacteristics.equipment++;
            else if (item.Type === 'Modification') newCharacteristics.modifications++;
          });
        }
      });

      console.log('🎮 DEBUG - Características calculadas:', newCharacteristics);
      console.log('🎮 DEBUG - Seleções a serem salvas:', selections);

      // Definir valores dos contadores baseados no personagem (valores iniciais corretos)
      setCounters(prev => ({
        ...prev,
        vida: 20, // Vida sempre começa em 20
        vida_max: 20, // Vida máxima é sempre 20 (valor fixo do jogo)
        esquiva: 0, // Esquiva começa em 0, não no valor máximo
        esquiva_max: actor.DodgePoints || 0, // Valor fixo baseado no personagem
        oport: 0, // Oportunidade começa em 0, não no valor máximo  
        oport_max: actor.OportunityAttacks || 0, // Valor fixo baseado no personagem
        item: 0, // Itens começa em 0, não no valor máximo
        item_max: actor.ExplorationItens || 0 // Valor fixo baseado no personagem
      }));

      // Sincronizar com o banco de dados
      RoomService.updatePlayerCharacteristics(currentPlayer.id, newCharacteristics);
      
      // Sincronizar seleções
      RoomService.updatePlayerSelections(currentPlayer.id, selections).then(result => {
        if (!result.success) {
          console.error('❌ Falha ao salvar seleções:', result.error);
        }
      });

      // Sincronizar contadores principais com o banco
      const initialCounters = {
        vida: 20,
        vida_max: 20,
        esquiva: 0,
        esquiva_max: actor.DodgePoints || 0,
        oport: 0,
        oport_max: actor.OportunityAttacks || 0,
        item: 0,
        item_max: actor.ExplorationItens || 0
      };
      RoomService.updatePlayerCounters(currentPlayer.id, initialCounters);
      
      // Configurar contadores adicionais baseados nas SpecialCharacteristics reais
      console.log('🎮 DEBUG - Configurando contadores adicionais para:', actor.ID);
      console.log('🎮 DEBUG - SpecialCharacteristics do ator:', actor.SpecialCharacteristics);
      const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID;
      const additionalCountersData = getCharacterAdditionalCounters(characterName, { 
        actor, 
        selections, 
        gameData, 
        localization 
      });
      
      console.log('🎮 DEBUG - Contadores recebidos:', Object.keys(additionalCountersData), additionalCountersData);
      
      // Verificar se já existem contadores adicionais no estado para evitar sobreposição
      console.log('🎮 DEBUG - Contadores atuais no estado:', Object.keys(additionalCounters), additionalCounters);
      
      // Na ficha, os contadores especiais devem começar em 0, não no máximo
      const resetCountersData = {};
      Object.entries(additionalCountersData).forEach(([key, counter]) => {
        resetCountersData[key] = {
          ...counter,
          current: 0 // Começar sempre em 0 na ficha
        };
      });
      
      console.log('🎮 DEBUG - Contadores resetados:', resetCountersData);
      
      setAdditionalCounters(resetCountersData);
      
      // Sincronizar contadores adicionais
      RoomService.updatePlayerAdditionalCounters(currentPlayer.id, resetCountersData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, selections, currentPlayer?.id, localization, gameData]);

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

  const itemSections = [
    { key: 'attacks', title: localization['Characteristic.Attack.Title'], color: 'danger', type: 'attack' },
    { key: 'weapons', title: localization['Characteristic.Weapon.Title'], color: 'danger', type: 'weapon' },
    { key: 'passives', title: localization['Characteristic.Passive.Title'], color: 'success', type: 'passive' },
    { key: 'devices', title: localization['Characteristic.Device.Title'], color: 'info', type: 'device', useButton: true },
    { key: 'powers', title: localization['Characteristic.Power.Title'], color: 'primary', type: 'power', useButton: true },
    { key: 'specials', title: localization['Characteristic.SpecialAbility.Title'], color: 'warning', type: 'special', useButton: true },
    { key: 'passiveSpecials', title: localization['Characteristic.PassiveSpecialAbility.Title'], color: 'warning', type: 'passiveSpecial' }
  ];

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

    return (
      <div key={item.ID} className="col-12 col-md-3">
        <div 
          className={`card border-${section.color} h-100${isBlocked ? ' opacity-50' : ''}${isUsed ? ' bg-dark opacity-75' : ''}`} 
          style={{background: 'var(--bs-gray-800)', color: '#fff'}}
        >
          <div className="card-body p-2">
            <div className={`fw-bold text-${section.color} mb-1`}>
              {title}{isBlocked ? ` (${localization['UI.CharacterSheet.ModeRestricted'] || 'UI.CharacterSheet.ModeRestricted'})` : ''}
            </div>
            <div 
              className="mb-2" 
              dangerouslySetInnerHTML={{ __html: desc }}
            />
            {section.useButton && !isBlocked && (
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
        {section.useButton && (
          <div className="text-center mb-4">
            <button 
              className={`btn btn-sm btn-${section.color}`}
              onClick={() => handleRecoverItems(section.key)}
            >
              Recuperar {section.title}
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
