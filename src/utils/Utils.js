// Utilitários globais
export const Utils = {
  // Resolve a value through localization if it's a string key
  resolveLocalizedValue: (value, localization) => {
    if (typeof value === 'string') {
      return localization[value] || value;
    }
    return value;
  },
  formatFallback: (id) => id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim(),

  createAttackDescription: (def, localization, mode = 'mode1') => {
    const modeData = Utils.modeSystem.getActiveMode(def, mode);
  const minDist = Utils.resolveLocalizedValue(modeData.MinimumDistance, localization);
  const maxDist = Utils.resolveLocalizedValue(modeData.MaximumDistance, localization);
  return `
  <b>${localization['AttackBase.Damage'] || 'AttackBase.Damage'}:</b> ${modeData.Damage}
  <br><b>${localization['AttackBase.Distance'] || 'AttackBase.Distance'}:</b> ${minDist === maxDist ? minDist : `${minDist} - ${maxDist}`}
    <br><b>${localization['AttackBase.Dices'] || 'AttackBase.Dices'}:</b> ${modeData.Dices}
    <br><b>${localization['AttackBase.LoadTime'] || 'AttackBase.LoadTime'}:</b> ${modeData.LoadTime || 0}
    <br><b>${localization['AttackBase.Terrain'] || 'AttackBase.Terrain'}:</b> ${(modeData.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'Utils.NotAvailable'}
    ${def.SpecialDescription ? `<br>${localization[def.SpecialDescription] || def.SpecialDescription}` : ""}`;
  },

  createDualModeDescription: (def, localization, actor) => {
    if (!def.modes) {
      return Utils.createAttackDescription(def, localization);
    }
    const modes = Object.keys(def.modes);
    if (modes.length < 2) {
      return Utils.createAttackDescription(def, localization);
    }
    const mode1Key = 'mode1';
    const mode2Key = 'mode2';
    const mode1Data = def.modes[mode1Key] || def.modes[modes[0]];
    const mode2Data = def.modes[mode2Key] || def.modes[modes[1]];
    const mode1Name = Utils.modeSystem.getModeName(actor, mode1Key, localization);
    const mode2Name = Utils.modeSystem.getModeName(actor, mode2Key, localization);
  const min1 = Utils.resolveLocalizedValue(mode1Data.MinimumDistance, localization);
  const max1 = Utils.resolveLocalizedValue(mode1Data.MaximumDistance, localization);
  const min2 = Utils.resolveLocalizedValue(mode2Data.MinimumDistance, localization);
  const max2 = Utils.resolveLocalizedValue(mode2Data.MaximumDistance, localization);
  return `
    <div class="row text-start">
      <div class="col-6 border-end border-secondary">
        <strong class="text-warning">${mode1Name}:</strong><br>
        ${localization['AttackBase.Damage'] || 'AttackBase.Damage'}: ${mode1Data.Damage}<br>
  ${localization['AttackBase.Distance'] || 'AttackBase.Distance'}: ${min1 === max1 ? min1 : `${min1}-${max1}`}<br>
        ${localization['AttackBase.Dices'] || 'AttackBase.Dices'}: ${mode1Data.Dices}<br>
        ${localization['AttackBase.LoadTime'] || 'AttackBase.LoadTime'}: ${mode1Data.LoadTime || 0}<br>
        ${localization['AttackBase.Terrain'] || 'AttackBase.Terrain'}: ${(mode1Data.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join("/")}
      </div>
      <div class="col-6">
        <strong class="text-danger">${mode2Name}:</strong><br>
        ${localization['AttackBase.Damage'] || 'AttackBase.Damage'}: ${mode2Data.Damage}<br>
  ${localization['AttackBase.Distance'] || 'AttackBase.Distance'}: ${min2 === max2 ? min2 : `${min2}-${max2}`}<br>
        ${localization['AttackBase.Dices'] || 'AttackBase.Dices'}: ${mode2Data.Dices}<br>
        ${localization['AttackBase.LoadTime'] || 'AttackBase.LoadTime'}: ${mode2Data.LoadTime || 0}<br>
        ${localization['AttackBase.Terrain'] || 'AttackBase.Terrain'}: ${(mode2Data.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join("/")}
      </div>
    </div>
    ${def.SpecialDescription ? `<div class="mt-2">${localization[def.SpecialDescription] || def.SpecialDescription}</div>` : ""}`;
  },

  createModeRestrictedDescription: (def, localization, actor) => {
    let description = localization[def.Description] || def.Description || "";
    if (def.modeRestriction) {
      const modeKey = def.modeRestriction;
      const modeName = Utils.modeSystem.getModeName(actor, modeKey, localization);
      description = `(${localization['Utils.DualModeDescription.ModeRestricted'] || localization['Characteristic.Only'] || 'Characteristic.Only'} ${modeName})<br>${description}`;
    }
    return description;
  },

  createTriggerName: (id, def, localization) => 
    `${(def.TriggerType || []).map(a => localization[`AttackBase.TriggerType.${a}`] || a).join(" / ") || (localization['Utils.NotAvailable'] || 'Utils.NotAvailable')} ${(localization[id] || Utils.formatFallback(id)).trim()}`,

  // Sistema de Modos (independente de pontos de transformação)
  modeSystem: {
    hasModes: (actor) => actor.mode1 && actor.mode2,
    
    getModes: (actor) => {
      if (!actor.mode1 || !actor.mode2) return ['mode1'];
      return ['mode1', 'mode2'];
    },
    
    getModeName: (actor, mode, localization) => {
      if (!actor.mode1 || !actor.mode2) return '';
      const modeKey = actor[mode];
      return localization[modeKey] || mode;
    },
    
    getModeDescription: (actor, localization) => {
      if (!actor.mode1 || !actor.mode2) return '';
      return localization[`Character.Mode.${actor.ID}.Description`] || (localization['Utils.ModeSystem.Active'] || 'Utils.ModeSystem.Active');
    },
    
    canUseItem: (item, currentMode) => {
      if (item.modeRestriction) {
        // Permite uso se o modo do item for igual ao modo atual
        return item.modeRestriction === currentMode;
      }
      return true;
    },
    getActiveMode: (item, currentMode) => {
      if (!item.modes) return item;
      return item.modes[currentMode] || item.modes.mode1 || item;
    }
  },

  // Sistema de transformação (backward compatibility) - usar modeSystem para novos personagens
  transformationSystem: {
    hasTransformation: (actor) => Utils.modeSystem.hasModes(actor) || 
      (actor.TransformationData && actor.TransformationData.hasTransformation),
    
    getTransformationName: (actor, localization) => {
      if (Utils.modeSystem.hasModes(actor)) {
        return Utils.modeSystem.getModeDescription(actor, localization);
      }
      if (!actor.TransformationData) return '';
      return localization[`Character.Transformation.${actor.ID}.Name`] || 'Character.Transformation.Name';
    },
    
    canUseItem: (item, isTransformed, actor) => {
      if (Utils.modeSystem.hasModes(actor)) {
        const currentMode = window.currentMode || (isTransformed ? 'mode2' : 'mode1');
        return Utils.modeSystem.canUseItem(item, currentMode);
      }
      // Verificação legacy para personagens antigos
      if (item.modeRestriction) {
        if (item.modeRestriction === 'mode1' && isTransformed) return false;
        if (item.modeRestriction === 'mode2' && !isTransformed) return false;
      }
      return true;
    },
    
    getActiveMode: (item, isTransformed) => {
      const mode = window.currentMode || (isTransformed ? 'mode2' : 'mode1');
      return Utils.modeSystem.getActiveMode(item, mode);
    }
  }
};
