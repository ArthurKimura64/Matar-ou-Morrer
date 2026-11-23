/**
 * ============================================================================
 * CONFIGURAÇÃO DE CONTADORES ADICIONAIS (AdditionalCountersConfig.js)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Lê a lista `SpecialCharacteristics` do personagem no GameEconomyData.json
 * e cria os contadores extras da ficha (ex: Escudo, Aura Negra, Pontos de Cópia).
 *
 * ============================================================================
 */

export const AdditionalCountersConfig = {};

/**
 * Gera os contadores especiais iniciais para o personagem escolhido.
 */
export const getCharacterAdditionalCounters = (characterName, characterData) => {
  const counters = {};

  const actor = characterData?.actor;
  const gameData = characterData?.gameData;
  const localization = characterData?.localization;

  // Se o personagem não tiver características especiais, retorna vazio
  if (!actor?.SpecialCharacteristics || !gameData?.SpecialDefinitions) {
    return counters;
  }

  actor.SpecialCharacteristics.forEach((specialId) => {
    const spec = gameData.SpecialDefinitions.find((s) => s.ID === specialId);
    if (!spec || spec.Type !== 'counter') return;

    if (counters[specialId]) return;

    const maxValue = spec.maxValue ?? spec.Max ?? 10;
    const minValue = spec.minValue ?? spec.Min ?? 0;

    const initialValue = spec.InitialValue ?? spec.initialValue ?? 0;

    const defaultLabel = specialId.replace('SpecialCustom.', '').replace(/\d+$/, '');
    const label = (localization && spec.Title ? localization[spec.Title] : spec.Title) || defaultLabel;

    counters[specialId] = {
      current: initialValue,
      max: maxValue,
      min: minValue,
      initialValue: initialValue,
      label: label,
      icon: spec.Icon || '📊'
    };
  });

  return counters;
};

/**
 * Atualiza o valor atual de um contador específico respeitando os limites (min e max).
 */
export const updateAdditionalCounter = (currentCounters, counterKey, newValue) => {
  const target = currentCounters?.[counterKey];
  if (!target) return currentCounters;

  const min = target.min ?? 0;
  const max = target.max ?? 10;

  return {
    ...currentCounters,
    [counterKey]: {
      ...target,
      current: Math.max(min, Math.min(newValue, max))
    }
  };
};

/**
 * Reseta todos os contadores especiais do personagem para o valor inicial (0).
 */
export const resetAdditionalCounters = (counters) => {
  const reset = {};

  Object.entries(counters || {}).forEach(([key, counterObj]) => {
    if (typeof counterObj === 'object' && counterObj !== null) {
      reset[key] = {
        ...counterObj,
        current: counterObj.initialValue ?? 0
      };
    } else {
      reset[key] = counterObj;
    }
  });

  return reset;
};