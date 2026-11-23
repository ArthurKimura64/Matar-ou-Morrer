/**
 * ============================================================================
 * UTILITÁRIOS DE FORMATAÇÃO DE CARTAS E MODOS (Utils.js)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Formata automaticamente os textos das cartas de Ataque, Armas, Poderes e
 * Dispositivos, além de controlar personagens que possuem 2 modos (ex: Eclipse).
 * ============================================================================
 */

const localizationCache = new Map();
const descriptionCache = new Map();

export const Utils = {
  /**
   * Busca a tradução de uma chave no LocalizationPortuguese.json (com cache rápido).
   */
  resolveLocalizedValue: (value, localization) => {
    if (typeof value === 'string') {
      if (localizationCache.has(value)) {
        const cached = localizationCache.get(value);
        localizationCache.delete(value);
        localizationCache.set(value, cached);
        return cached;
      }

      const result = localization[value] || value;
      localizationCache.set(value, result);

      if (localizationCache.size > 500) {
        localizationCache.delete(localizationCache.keys().next().value);
      }

      return result;
    }
    return value;
  },

  /**
   * Transforma um ID como "EspadaLaser" em "Espada Laser" caso falte tradução.
   */
  formatFallback: (id) =>
    String(id || '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim(),

  /**
   * Monta o texto HTML de uma carta de Ataque ou Arma (Dano, Distância, Dados, Segundos, Terreno).
   */
  createAttackDescription: (def, localization, mode = 'mode1') => {
    const cacheKey = `attack_${def.ID}_${mode}`;

    if (descriptionCache.has(cacheKey)) {
      const cached = descriptionCache.get(cacheKey);
      descriptionCache.delete(cacheKey);
      descriptionCache.set(cacheKey, cached);
      return cached;
    }

    const modeData = Utils.modeSystem.getActiveMode(def, mode);
    const minDist = Utils.resolveLocalizedValue(modeData.MinimumDistance, localization);
    const maxDist = Utils.resolveLocalizedValue(modeData.MaximumDistance, localization);
    const distanceText = minDist === maxDist ? minDist : `${minDist} - ${maxDist}`;
    const ambientText = (modeData.Ambient || [])
      .map((a) => localization[`Ambient.${a}`] || a)
      .join(' / ') || (localization['Utils.NotAvailable'] || 'Não disponível');

    const result = `
      <b>${localization['AttackBase.Damage'] || 'Dano'}:</b> ${modeData.Damage}
      <br><b>${localization['AttackBase.Distance'] || 'Distância'}:</b> ${distanceText}
      <br><b>${localization['AttackBase.Dices'] || 'Dados'}:</b> ${modeData.Dices}
      <br><b>${localization['AttackBase.LoadTime'] || 'Segundos'}:</b> ${modeData.LoadTime ?? 0}
      <br><b>${localization['AttackBase.Terrain'] || 'Terreno'}:</b> ${ambientText}
      ${def.SpecialDescription ? `<br>${localization[def.SpecialDescription] || def.SpecialDescription}` : ''}
    `;

    descriptionCache.set(cacheKey, result);
    if (descriptionCache.size > 200) {
      descriptionCache.delete(descriptionCache.keys().next().value);
    }

    return result;
  },

  /**
   * Monta a descrição lado a lado quando uma arma muda de status entre Modo 1 e Modo 2
   * (Ex: Armas do Cavaleiro do Eclipse: Modo Normal vs Modo Eclipse).
   */
  createDualModeDescription: (def, localization, actor) => {
    if (!def.modes || Object.keys(def.modes).length < 2) {
      return Utils.createAttackDescription(def, localization);
    }

    const mode1Data = def.modes.mode1;
    const mode2Data = def.modes.mode2;
    const mode1Name = Utils.modeSystem.getModeName(actor, 'mode1', localization);
    const mode2Name = Utils.modeSystem.getModeName(actor, 'mode2', localization);

    const min1 = Utils.resolveLocalizedValue(mode1Data.MinimumDistance, localization);
    const max1 = Utils.resolveLocalizedValue(mode1Data.MaximumDistance, localization);
    const min2 = Utils.resolveLocalizedValue(mode2Data.MinimumDistance, localization);
    const max2 = Utils.resolveLocalizedValue(mode2Data.MaximumDistance, localization);

    return `
      <div class="row text-start">
        <div class="col-6 border-end border-secondary">
          <strong class="text-warning">${mode1Name}:</strong><br>
          ${localization['AttackBase.Damage'] || 'Dano'}: ${mode1Data.Damage}<br>
          ${localization['AttackBase.Distance'] || 'Distância'}: ${min1 === max1 ? min1 : `${min1}-${max1}`}<br>
          ${localization['AttackBase.Dices'] || 'Dados'}: ${mode1Data.Dices}<br>
          ${localization['AttackBase.LoadTime'] || 'Segundos'}: ${mode1Data.LoadTime ?? 0}<br>
          ${localization['AttackBase.Terrain'] || 'Terreno'}: ${(mode1Data.Ambient || []).map((a) => localization[`Ambient.${a}`] || a).join('/')}
        </div>
        <div class="col-6">
          <strong class="text-danger">${mode2Name}:</strong><br>
          ${localization['AttackBase.Damage'] || 'Dano'}: ${mode2Data.Damage}<br>
          ${localization['AttackBase.Distance'] || 'Distância'}: ${min2 === max2 ? min2 : `${min2}-${max2}`}<br>
          ${localization['AttackBase.Dices'] || 'Dados'}: ${mode2Data.Dices}<br>
          ${localization['AttackBase.LoadTime'] || 'Segundos'}: ${mode2Data.LoadTime ?? 0}<br>
          ${localization['AttackBase.Terrain'] || 'Terreno'}: ${(mode2Data.Ambient || []).map((a) => localization[`Ambient.${a}`] || a).join('/')}
        </div>
      </div>
      ${def.SpecialDescription ? `<div class="mt-2">${localization[def.SpecialDescription] || def.SpecialDescription}</div>` : ''}
    `;
  },

  /**
   * Adiciona o aviso "(Apenas Modo X)" no topo da descrição de poderes/passivas restritos.
   */
  createModeRestrictedDescription: (def, localization, actor) => {
    let description = localization[def.Description] || def.Description || '';
    if (def.modeRestriction) {
      const modeName = Utils.modeSystem.getModeName(actor, def.modeRestriction, localization);
      const onlyLabel = localization['Utils.DualModeDescription.ModeRestricted'] || localization['Characteristic.Only'] || 'Apenas';
      description = `(${onlyLabel} ${modeName})<br>${description}`;
    }
    return description;
  },

  /**
   * Adiciona o prefixo de gatilho (P), (A) ou (D) antes do nome de Poderes, Dispositivos e Especiais.
   */
  createTriggerName: (id, def, localization) => {
    const triggers = (def.TriggerType || [])
      .map((t) => localization[`AttackBase.TriggerType.${t}`] || t)
      .join(' / ') || (localization['Utils.NotAvailable'] || 'N/A');
    const itemName = (localization[id] || Utils.formatFallback(id)).trim();
    return `${triggers} ${itemName}`;
  },

  /**
   * Regras para personagens que possuem 2 modos (ex: Cavaleiro do Eclipse).
   */
  modeSystem: {
    hasModes: (actor) => Boolean(actor?.mode1 && actor?.mode2),

    getModes: (actor) => (actor?.mode1 && actor?.mode2 ? ['mode1', 'mode2'] : ['mode1']),

    getModeName: (actor, mode, localization) => {
      if (!actor?.mode1 || !actor?.mode2) return '';
      const modeKey = actor[mode];
      return localization[modeKey] || mode;
    },

    getModeDescription: (actor, localization) => {
      if (!actor?.mode1 || !actor?.mode2) return '';
      return localization[`Character.Mode.${actor.ID}.Description`] || (localization['Utils.ModeSystem.Active'] || 'Sistema de modos ativo');
    },

    canUseItem: (item, currentMode) => {
      if (item.modeRestriction) {
        return item.modeRestriction === currentMode;
      }
      return true;
    },

    getActiveMode: (item, currentMode) => {
      if (!item.modes) return item;
      return item.modes[currentMode] || item.modes.mode1 || item;
    }
  },

  /**
   * Compatibilidade com o sistema de transformação na ficha.
   */
  transformationSystem: {
    hasTransformation: (actor) =>
      Utils.modeSystem.hasModes(actor) || Boolean(actor?.TransformationData?.hasTransformation),

    getTransformationName: (actor, localization) => {
      if (Utils.modeSystem.hasModes(actor)) {
        return Utils.modeSystem.getModeDescription(actor, localization);
      }
      if (!actor?.TransformationData) return '';
      return localization[`Character.Transformation.${actor.ID}.Name`] || 'Transformação';
    },

    canUseItem: (item, isTransformed, actor) => {
      const activeMode = isTransformed ? 'mode2' : 'mode1';
      return Utils.modeSystem.canUseItem(item, activeMode);
    },

    getActiveMode: (item, isTransformed) => {
      const activeMode = isTransformed ? 'mode2' : 'mode1';
      return Utils.modeSystem.getActiveMode(item, activeMode);
    }
  }
};