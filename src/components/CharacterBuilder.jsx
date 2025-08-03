import React, { useState, useEffect, useMemo } from 'react';
import CharacteristicCard from './CharacteristicCard';
import SelectionSection from './SelectionSection';
import { Utils } from '../utils/Utils';

const CharacterBuilder = ({ actor, gameData, localization, onCharacterCreate, onBack }) => {
  const [selections, setSelections] = useState({});
  const [isComplete, setIsComplete] = useState(false);

  const selectionConfigs = useMemo(() => {
    const configs = {
      attack: { 
        data: actor.UnlimitedAttacksData, 
        number: actor.NumberOfUnlimitedAttacks, 
        definitions: gameData.AttackDefinitions, 
        color: 'danger' 
      },
      weapon: { 
        data: actor.WeaponsData, 
        number: actor.NumberOfWeapons, 
        definitions: gameData.AttackDefinitions, 
        color: 'danger' 
      },
      passive: { 
        data: actor.PassivesData, 
        number: actor.NumberOfPassives, 
        definitions: gameData.PassiveDefinitions, 
        color: 'success' 
      },
      device: { 
        data: actor.DevicesData, 
        number: actor.NumberOfDevices, 
        definitions: gameData.ConsumableDefinitions, 
        color: 'info' 
      },
      power: { 
        data: actor.PowersData, 
        number: actor.NumberOfPowers, 
        definitions: gameData.ConsumableDefinitions, 
        color: 'primary' 
      },
      special: { 
        data: actor.SpecialAbilitiesData, 
        number: actor.NumberOfSpecialAbilities, 
        definitions: gameData.ConsumableDefinitions, 
        color: 'warning' 
      },
      passiveSpecial: { 
        data: actor.PassiveSpecialAbilitiesData, 
        number: actor.NumberOfPassiveSpecialAbilities, 
        definitions: gameData.PassiveDefinitions, 
        color: 'warning' 
      }
    };

    // Aplicar configurações específicas de cada tipo
    Object.entries(configs).forEach(([type, config]) => {
      config.title = localization[`Characteristic.${type === 'attack' ? 'Attack' : 
                                     type === 'weapon' ? 'Weapon' : 
                                     type === 'passive' ? 'Passive' : 
                                     type === 'device' ? 'Device' : 
                                     type === 'power' ? 'Power' : 
                                     type === 'special' ? 'SpecialAbility' : 
                                     'PassiveSpecialAbility'}.Title`];
      
      if (['attack', 'weapon'].includes(type)) {
        config.getName = (id) => localization[id] || id;
        config.getDesc = (def) => {
          // Para personagens com modos, mostrar descrição dual mode na seleção
          if (actor.mode1 && actor.mode2 && def.modes) {
            return Utils.createDualModeDescription(def, localization, actor);
          }
          return Utils.createAttackDescription(def, localization);
        };
      } else if (['device', 'power', 'special'].includes(type)) {
        config.getName = (id, def) => Utils.createTriggerName(id, def, localization);
        config.getDesc = (def) => {
          // Para personagens com modos, mostrar restrições de modo
          if (actor.mode1 && actor.mode2 && def.modeRestriction) {
            return Utils.createModeRestrictedDescription(def, localization, actor);
          }
          return localization[def.Description] || "";
        };
      } else {
        config.getName = (id) => localization[id] || Utils.formatFallback(id);
        config.getDesc = (def) => {
          // Para personagens com modos, mostrar restrições de modo também em passivas
          if (actor.mode1 && actor.mode2 && def.modeRestriction && ['passive', 'passiveSpecial'].includes(type)) {
            return Utils.createModeRestrictedDescription(def, localization, actor);
          }
          return localization[def.Description] || (localization['Utils.NoDescription'] || 'Utils.NoDescription');
        };
      }
    });

    return configs;
  }, [actor, gameData, localization]);

  const handleSelectionChange = (type, selectedItems) => {
    setSelections(prev => ({
      ...prev,
      [type]: selectedItems
    }));
  };

  useEffect(() => {
    const complete = Object.entries(selectionConfigs).every(([type, config]) => {
      if (config.data && config.number) {
        return (selections[type]?.length || 0) === config.number;
      }
      return true;
    });
    setIsComplete(complete);
  }, [selections, selectionConfigs]);

  const handleCreateCharacter = () => {
    const finalSelections = Object.fromEntries(
      Object.entries(selectionConfigs).map(([type, config]) => [
        type === 'attack' ? 'attacks' : 
        type === 'weapon' ? 'weapons' : 
        type === 'passive' ? 'passives' : 
        type === 'passiveSpecial' ? 'passiveSpecials' : 
        `${type}s`,
        selections[type] || []
      ])
    );
    onCharacterCreate(finalSelections);
  };

  return (
    <div>
      <div className="row justify-content-center text-center">
        <div className="col-12">
          <button className="btn btn-secondary mb-3" onClick={onBack}>
            ← Voltar
          </button>
        </div>
        <div className="col-12">
          <h1 className="text-white">
            {localization[`Character.Name.${actor.ID}`] || actor.ID}
          </h1>
        </div>
        <div className="col-12">
          <h3 className="text-light">
            {localization[`Character.Title.${actor.ID}`] || actor.ID}
          </h3>
        </div>
        {localization[`Character.Description.${actor.ID}`] && (
          <div 
            className="col-10 mb-3 px-3 text-light"
            dangerouslySetInnerHTML={{ __html: localization[`Character.Description.${actor.ID}`] }}
          />
        )}
      </div>

      <div className="row justify-content-center">
        <CharacteristicCard actor={actor} localization={localization} deathCount={0} />
      </div>

      {Object.entries(selectionConfigs).map(([type, config]) => (
        <SelectionSection
          key={type}
          type={type}
          config={config}
          actor={actor}
          localization={localization}
          onSelectionChange={(selectedItems) => handleSelectionChange(type, selectedItems)}
        />
      ))}

      <div className="row justify-content-center my-4">
        <button 
          className="btn btn-lg btn-success col-8"
          disabled={!isComplete}
          onClick={handleCreateCharacter}
        >
          {localization['UI.CharacterBuilder.CreateCharacter'] || 'UI.CharacterBuilder.CreateCharacter'}
        </button>
      </div>
    </div>
  );
};

export default CharacterBuilder;
