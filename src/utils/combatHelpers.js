/**
 * ============================================================================
 * FUNÇÕES AUXILIARES DE COMBATE (combatHelpers.js)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Reúne toda a lógica pura de combate fora do visual (React):
 * 1. Leitura segura dos dados de defesa (evita erro no personagem Energz).
 * 2. Extração das armas/ataques da ficha (incluindo Modos e Copiador).
 * 3. Cálculo automático da quantidade e ordem das rodadas pela velocidade.
 * ============================================================================
 */

/**
 * Converte o valor de dados de defesa do personagem em um número seguro.
 * Se o valor for uma frase (como no personagem Energz), retorna 0 em vez de NaN.
 */
export function parseDefenseDices(rawValue, fallback = 0) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.max(0, rawValue);
  }
  const parsed = parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
}

/**
 * Converte a quantidade de dados de ataque em um número inteiro seguro (>= 0).
 * Preserva explicitamente o 0 (ex: "0" ou 0) em vez de transformar em 1.
 * Se o valor for texto não numérico (ex: "??"), retorna o fallback (0 por padrão).
 */
export function parseAttackDices(rawValue, fallback = 0) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.max(0, Math.floor(rawValue));
  }
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return fallback;
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
}

/**
 * Gera um array com resultados aleatórios de dados de 6 lados (d6).
 */
export function rollSixSidedDice(count) {
  const safeCount = Math.max(0, parseInt(count, 10) || 0);
  return Array.from({ length: safeCount }, () => 1 + Math.floor(Math.random() * 6));
}

/**
 * Retorna a versão da arma correspondente ao modo ativo (mode1 ou mode2).
 */
export function getWeaponForMode(weapon, combatMode = 'mode1') {
  if (!weapon) return null;
  if (!weapon.modes) return weapon;
  return weapon.modes[combatMode] || weapon.modes.mode1 || weapon;
}
/**
 * Retorna uma cópia da arma com Dados, Tempo e Dano atualizados para o modo escolhido.
 */
export function applyModeToWeapon(weapon, targetMode = 'mode1') {
  if (!weapon || !weapon.modes || !weapon.modes[targetMode]) return weapon;
  const modeData = weapon.modes[targetMode];
  return {
    ...weapon,
    Dices: String(modeData.Dices ?? weapon.Dices ?? '0'),
    LoadTime: String(modeData.LoadTime ?? weapon.LoadTime ?? '0'),
    Damage: String(modeData.Damage ?? weapon.Damage ?? '0'),
    Ambient: modeData.Ambient ?? weapon.Ambient,
    MinimumDistance: modeData.MinimumDistance ?? weapon.MinimumDistance,
    MaximumDistance: modeData.MaximumDistance ?? weapon.MaximumDistance,
    activeMode: targetMode
  };
}
/**
 * Calcula as rodadas do combate com base nos Segundos (LoadTime) do atacante e do defensor.
 * Regra:
 * - Primeira rodada: SEMPRE do atacante
 * - Rodadas intermediárias: quem tiver MENOS segundos ataca (diferença) vezes extras
 * - Penúltima rodada: SEMPRE do defensor
 * - Última rodada: SEMPRE do atacante
 */
export function calculateCombatRounds(attackerLoadTime, defenderLoadTime) {
  const atkTime = parseInt(attackerLoadTime, 10) || 0;
  const defTime = parseInt(defenderLoadTime, 10) || 0;
  const timeDiff = atkTime - defTime;

  const rounds = [
    { round: 1, who_acts: 'attacker', action_type: 'attack' }
  ];

  if (timeDiff < 0) {
    // Atacante é mais rápido (menos segundos): ganha ataques extras
    for (let i = 0; i < Math.abs(timeDiff); i++) {
      rounds.push({
        round: rounds.length + 1,
        who_acts: 'attacker',
        action_type: 'attack'
      });
    }
  } else if (timeDiff > 0) {
    // Defensor é mais rápido (menos segundos): ganha contra-ataques extras
    for (let i = 0; i < timeDiff; i++) {
      rounds.push({
        round: rounds.length + 1,
        who_acts: 'defender',
        action_type: 'counter'
      });
    }
  }

  // Penúltima rodada: Defensor contra-ataca
  rounds.push({
    round: rounds.length + 1,
    who_acts: 'defender',
    action_type: 'counter'
  });

  // Última rodada: Atacante finaliza
  rounds.push({
    round: rounds.length + 1,
    who_acts: 'attacker',
    action_type: 'attack'
  });

  return { totalRounds: rounds.length, rounds };
}

/**
 * Extrai e padroniza todos os ataques e armas disponíveis para o jogador,
 * levando em conta o modo atual (Normal/Eclipse) e habilidades copiadas (Copiador).
 */
export function extractPlayerWeapons(playerData, combatMode = 'mode1', localization = {}) {
  const weaponsList = [];
  const selections = playerData?.character?.selections;
  const actor = playerData?.character?.actor;
  const hasModes = Boolean(actor?.mode1 && actor?.mode2);

  if (!selections) return weaponsList;

  const normalizeItem = (item, category, type) => {
    if (!item || (!item.Name && !item.ID)) return null;

    const originalModes = item.modes;

    // Se o item exige um modo específico diferente do atual, ignora
    if (item.requiredMode && item.requiredMode !== combatMode) {
      return null;
    }

    let effectiveData = item;
    if (hasModes && originalModes) {
      const modeData = originalModes[combatMode];
      if (!modeData) return null;
      effectiveData = { ...item, ...modeData };
    }

    const itemId = effectiveData.ID || effectiveData.Name;
    const defaultFallback = type === 'attack'
      ? (localization?.['UI.Combat.AttackFallback'] || 'Ataque')
      : (localization?.['UI.Combat.WeaponFallback'] || 'Arma');

    const itemName = effectiveData.Name || localization?.[itemId] || itemId || defaultFallback;

    const normalized = {
      ID: String(effectiveData.ID || effectiveData.Name || ''),
      Name: String(itemName),
      Description: typeof effectiveData.Description === 'object' ? JSON.stringify(effectiveData.Description) : String(effectiveData.Description || ''),
      Dices: typeof effectiveData.Dices === 'object' ? JSON.stringify(effectiveData.Dices) : String(effectiveData.Dices ?? '1'),
      LoadTime: typeof effectiveData.LoadTime === 'object' ? '0' : String(effectiveData.LoadTime ?? '0'),
      Damage: typeof effectiveData.Damage === 'object' ? '0' : String(effectiveData.Damage ?? '0'),
      Effects: typeof effectiveData.Effects === 'object' ? JSON.stringify(effectiveData.Effects) : String(effectiveData.Effects || ''),
      type,
      category,
      modes: originalModes,
      activeMode: hasModes && originalModes ? combatMode : null
    };

    Object.keys(effectiveData).forEach((key) => {
      if (key !== 'modes' && (typeof effectiveData[key] !== 'object' || effectiveData[key] === null)) {
        normalized[key] = effectiveData[key];
      }
    });

    return normalized;
  };

  // 1. Ataques sem limite
  if (Array.isArray(selections.attacks)) {
    selections.attacks.forEach((attack) => {
      const processed = normalizeItem(attack, localization?.['UI.Combat.AttackCategory'] || 'Ataques', 'attack');
      if (processed) weaponsList.push(processed);
    });
  }

  // 2. Armas primárias
  if (Array.isArray(selections.weapons)) {
    selections.weapons.forEach((weapon) => {
      const processed = normalizeItem(weapon, localization?.['UI.Combat.WeaponCategory'] || 'Armas', 'weapon');
      if (processed) weaponsList.push(processed);
    });
  }

  // 3. Armas e Ataques copiados pelo Copiador
  const copycatData = selections.copycatAssignments || playerData?.selections?.copycatAssignments;
  if (copycatData) {
    if (copycatData.attacks) {
      Object.values(copycatData.attacks).forEach((item) => {
        const processed = normalizeItem(item, localization?.['UI.Combat.CopiedAttacks'] || 'Copiado - Ataques', 'attack');
        if (processed) weaponsList.push(processed);
      });
    }
    if (copycatData.weapons) {
      Object.values(copycatData.weapons).forEach((item) => {
        const processed = normalizeItem(item, localization?.['UI.Combat.CopiedWeapons'] || 'Copiado - Armas', 'weapon');
        if (processed) weaponsList.push(processed);
      });
    }
  }

  return weaponsList;
}