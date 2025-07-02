// Utilitários globais
export const Utils = {
  formatFallback: (id) => id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim(),

  createAttackDescription: (def, localization, mode = 'mode1') => {
    const modeData = Utils.modeSystem.getActiveMode(def, mode);
    return `
    <b>${localization['AttackBase.Damage'] || 'Dano'}:</b> ${modeData.Damage}
    <br><b>${localization['AttackBase.Distance'] || 'Distância'}:</b> ${modeData.MinimumDistance == modeData.MaximumDistance ? modeData.MinimumDistance : `${modeData.MinimumDistance} - ${modeData.MaximumDistance}`}
    <br><b>${localization['AttackBase.Dices'] || 'Dados'}:</b> ${modeData.Dices}
    <br><b>${localization['AttackBase.LoadTime'] || 'Tempo de Recarga'}:</b> ${modeData.LoadTime || 0}
    <br><b>${localization['AttackBase.Terrain'] || 'Terreno'}:</b> ${(modeData.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'}
    ${def.SpecialDescription ? `<br>${localization[def.SpecialDescription] || ""}` : ""}`;
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
    return `
    <div class="row text-start">
      <div class="col-6 border-end border-secondary">
        <strong class="text-warning">${mode1Name}:</strong><br>
        ${localization['AttackBase.Damage'] || 'Dano'}: ${mode1Data.Damage}<br>
        ${localization['AttackBase.Distance'] || 'Distância'}: ${mode1Data.MinimumDistance === mode1Data.MaximumDistance ? mode1Data.MinimumDistance : `${mode1Data.MinimumDistance}-${mode1Data.MaximumDistance}`}<br>
        ${localization['AttackBase.Dices'] || 'Dados'}: ${mode1Data.Dices}<br>
        ${localization['AttackBase.LoadTime'] || 'Recarga'}: ${mode1Data.LoadTime || 0}<br>
        ${localization['AttackBase.Terrain'] || 'Ambiente'}: ${(mode1Data.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join("/")}
      </div>
      <div class="col-6">
        <strong class="text-danger">${mode2Name}:</strong><br>
        ${localization['AttackBase.Damage'] || 'Dano'}: ${mode2Data.Damage}<br>
        ${localization['AttackBase.Distance'] || 'Distância'}: ${mode2Data.MinimumDistance === mode2Data.MaximumDistance ? mode2Data.MinimumDistance : `${mode2Data.MinimumDistance}-${mode2Data.MaximumDistance}`}<br>
        ${localization['AttackBase.Dices'] || 'Dados'}: ${mode2Data.Dices}<br>
        ${localization['AttackBase.LoadTime'] || 'Recarga'}: ${mode2Data.LoadTime || 0}<br>
        ${localization['AttackBase.Terrain'] || 'Ambiente'}: ${(mode2Data.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join("/")}
      </div>
    </div>
    ${def.SpecialDescription ? `<div class="mt-2">${localization[def.SpecialDescription] || ""}</div>` : ""}`;
  },

  createModeRestrictedDescription: (def, localization, actor) => {
    let description = localization[def.Description] || "";
    if (def.modeRestriction) {
      const modeKey = def.modeRestriction;
      const modeName = Utils.modeSystem.getModeName(actor, modeKey, localization);
      description = `(${localization['Characteristic.Only'] || 'Apenas'} ${modeName})<br>${description}`;
    }
    return description;
  },

  createTriggerName: (id, def, localization) => 
    `${(def.TriggerType || []).map(a => localization[`AttackBase.TriggerType.${a}`] || a).join(" / ") || 'N/A'} ${(localization[id] || Utils.formatFallback(id)).trim()}`,

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
      return localization[`Character.Mode.${actor.ID}.Description`] || 'Sistema de modos ativo';
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
      return localization[`Character.Transformation.${actor.ID}.Name`] || 'Transformação';
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
