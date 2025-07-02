import React, { useState } from 'react';
import Counter from './Counter';
import CharacteristicCard from './CharacteristicCard';
import { Utils } from '../utils/Utils';

const CharacterSheet = ({ actor, selections, gameData, localization, onReset }) => {
  const [counters, setCounters] = useState({
    vida: 20,
    esquiva: 0,
    oport: 0,
    item: 0
  });
  
  const [currentMode, setCurrentMode] = useState('mode1');
  const [usedItems, setUsedItems] = useState(new Set());

  const itemSections = [
    { key: 'attacks', title: localization['Characteristic.Attack.Title'], color: 'danger', type: 'attack' },
    { key: 'weapons', title: localization['Characteristic.Weapon.Title'], color: 'danger', type: 'weapon' },
    { key: 'passives', title: localization['Characteristic.Passive.Title'], color: 'success', type: 'passive' },
    { key: 'devices', title: localization['Characteristic.Device.Title'], color: 'info', type: 'device', useButton: true },
    { key: 'powers', title: localization['Characteristic.Power.Title'], color: 'primary', type: 'power', useButton: true },
    { key: 'specials', title: localization['Characteristic.SpecialAbility.Title'], color: 'warning', type: 'special', useButton: true },
    { key: 'passiveSpecials', title: localization['Characteristic.PassiveSpecialAbility.Title'], color: 'warning', type: 'passiveSpecial' }
  ];

  const handleCounterChange = (id, value) => {
    setCounters(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handleModeChange = (mode) => {
    setCurrentMode(mode);
  };

  const handleUseItem = (itemId) => {
    setUsedItems(prev => new Set([...prev, itemId]));
  };

  const handleRecoverItems = (type) => {
    const itemsToRecover = selections[type] || [];
    setUsedItems(prev => {
      const newSet = new Set(prev);
      itemsToRecover.forEach(item => newSet.delete(item.ID));
      return newSet;
    });
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
          : localization[item.Description] || "");

    const isUsed = usedItems.has(item.ID);

    return (
      <div key={item.ID} className="col-12 col-md-3">
        <div 
          className={`card border-${section.color} h-100${isBlocked ? ' opacity-50' : ''}${isUsed ? ' bg-dark opacity-75' : ''}`} 
          style={{background: 'var(--bs-gray-800)', color: '#fff'}}
        >
          <div className="card-body p-2">
            <div className={`fw-bold text-${section.color} mb-1`}>
              {title}{isBlocked ? ' (Bloqueado neste modo)' : ''}
            </div>
            <div 
              className="small mb-2" 
              dangerouslySetInnerHTML={{ __html: desc }}
            />
            {section.useButton && !isBlocked && (
              <button 
                className={`btn btn-sm btn-outline-${section.color}`}
                disabled={isUsed}
                onClick={() => handleUseItem(item.ID)}
              >
                {isUsed ? 'Usado' : localization['Characteristic.Use'] || 'Usar'}
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
      <h2 className="text-center mb-4">Ficha do Personagem</h2>
      <h3 className="text-center mb-3">
        {localization[`Character.Name.${actor.ID}`]} ({localization[`Character.Title.${actor.ID}`]})
      </h3>
      
      {localization[`Character.Description.${actor.ID}`] && (
        <div className="col-10 mb-4 px-3">
          {localization[`Character.Description.${actor.ID}`]}
        </div>
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
                  Modo Normal
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
                  Modo Transformado
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
          title={localization['Characteristic.Health'] || 'Vida'}
          value={counters.vida}
          min={0}
          max={999}
          onChange={(value) => handleCounterChange('vida', value)}
        />
        <Counter
          id="esquiva"
          title={localization['Characteristic.DodgePoints'] || 'Esquiva'}
          value={counters.esquiva}
          min={0}
          max={10}
          onChange={(value) => handleCounterChange('esquiva', value)}
        />
        <Counter
          id="oport"
          title={localization['Characteristic.OportunityAttack'] || 'Oportunidade'}
          value={counters.oport}
          min={0}
          max={10}
          onChange={(value) => handleCounterChange('oport', value)}
        />
        <Counter
          id="item"
          title={localization['Characteristic.ExplorationItens'] || 'Itens'}
          value={counters.item}
          min={0}
          max={99}
          onChange={(value) => handleCounterChange('item', value)}
        />
      </div>

      <div className="row justify-content-center">
        <CharacteristicCard actor={actor} localization={localization} />
      </div>

      <div id="character-items">
        {itemSections.map(renderItemSection)}
      </div>

      <div className="text-center mt-4">
        <button className="btn btn-secondary" onClick={onReset}>
          Reiniciar
        </button>
      </div>
    </div>
  );
};

export default CharacterSheet;
