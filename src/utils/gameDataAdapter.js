/**
 * ============================================================================
 * ADAPTADOR DE DADOS DO JOGO (gameDataAdapter.js)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * Padroniza em memória os arquivos `GameEconomyData.json` e
 * `LocalizationPortuguese.json` assim que o jogo carrega, SEM modificar os
 * arquivos JSON originais (mantendo compatibilidade com sistemas externos).
 *
 * O que ele garante para o resto do código React:
 * 1. Campos numéricos de personagens nunca vêm como string vazia ("") ou NaN.
 * 2. Regras em texto no campo de defesa (ex: Energz) ganham:
 *    - `defenseDices: 0` (número seguro para cálculos de combate)
 *    - `defenseRuleText: "Não joga dados..."` (texto pronto para exibição)
 *    mantendo `NumberOfDefenseDices` original preservado para compatibilidade.
 * 3. Todas as traduções do Localization viram strings (ex: 21 -> "21"),
 *    evitando erros ao chamar `.trim()` ou `.toLowerCase()`.
 * ============================================================================
 */

function toSafeInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const str = String(value ?? '').trim();
  if (str === '') return fallback;
  const parsed = parseInt(str, 10);
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Normaliza o `GameEconomyData.json` em memória.
 */
export function adaptGameData(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return {
      ActorDefinitions: [],
      PassiveDefinitions: [],
      AttackDefinitions: [],
      ConsumableDefinitions: [],
      SpecialDefinitions: []
    };
  }

  const normalizedActors = toSafeArray(rawData.ActorDefinitions).map((actor) => {
    const rawDefense = actor.NumberOfDefenseDices;
    const isDefenseRuleText = typeof rawDefense === 'string' && Number.isNaN(parseInt(rawDefense, 10));

    return {
      ...actor,
      Difficulty: toSafeInt(actor.Difficulty, 2),
      Generation: toSafeInt(actor.Generation, 1),
      DodgePoints: toSafeInt(actor.DodgePoints, 0),
      OportunityAttacks: toSafeInt(actor.OportunityAttacks, 0),
      ExplorationItens: toSafeInt(actor.ExplorationItens, 0),
      NumberOfUnlimitedAttacks: toSafeInt(actor.NumberOfUnlimitedAttacks, 0),
      NumberOfWeapons: toSafeInt(actor.NumberOfWeapons, 0),
      NumberOfPassives: toSafeInt(actor.NumberOfPassives, 0),
      NumberOfPowers: toSafeInt(actor.NumberOfPowers, 0),
      NumberOfDevices: toSafeInt(actor.NumberOfDevices, 0),
      NumberOfSpecialAbilities: toSafeInt(actor.NumberOfSpecialAbilities, 0),
      NumberOfPassiveSpecialAbilities: toSafeInt(actor.NumberOfPassiveSpecialAbilities, 0),

      // Campos padronizados para facilitar leitura nos componentes
      defenseDices: isDefenseRuleText ? 0 : toSafeInt(rawDefense, 0),
      defenseRuleText: isDefenseRuleText ? rawDefense.trim() : null,

      // Garante que listas nunca sejam undefined
      Tecnique: actor.Tecnique || {},
      UnlimitedAttacksData: toSafeArray(actor.UnlimitedAttacksData),
      WeaponsData: toSafeArray(actor.WeaponsData),
      PassivesData: toSafeArray(actor.PassivesData),
      PowersData: toSafeArray(actor.PowersData),
      DevicesData: toSafeArray(actor.DevicesData),
      SpecialAbilitiesData: toSafeArray(actor.SpecialAbilitiesData),
      PassiveSpecialAbilitiesData: toSafeArray(actor.PassiveSpecialAbilitiesData),
      SpecialCharacteristics: toSafeArray(actor.SpecialCharacteristics)
    };
  });

  const passiveDefinitions = toSafeArray(rawData.PassiveDefinitions);
  const attackDefinitions = toSafeArray(rawData.AttackDefinitions);
  const consumableDefinitions = toSafeArray(rawData.ConsumableDefinitions);
  const specialDefinitions = toSafeArray(rawData.SpecialDefinitions);

  // Monta os índices rápidos uma única vez no carregamento do jogo
  const definitionsMap = new Map();
  [attackDefinitions, passiveDefinitions, consumableDefinitions, specialDefinitions].forEach((list) => {
    list.forEach((def) => {
      if (def?.ID) definitionsMap.set(def.ID, def);
    });
  });

  const ownerActorMap = new Map();
  const actorDataFields = [
    'UnlimitedAttacksData',
    'WeaponsData',
    'PassivesData',
    'DevicesData',
    'PowersData',
    'SpecialAbilitiesData',
    'PassiveSpecialAbilitiesData'
  ];

  normalizedActors.forEach((act) => {
    actorDataFields.forEach((field) => {
      act[field].forEach((id) => {
        if (!ownerActorMap.has(id)) ownerActorMap.set(id, act);
      });
    });
  });

  return {
    ...rawData,
    ActorDefinitions: normalizedActors,
    PassiveDefinitions: passiveDefinitions,
    AttackDefinitions: attackDefinitions,
    ConsumableDefinitions: consumableDefinitions,
    SpecialDefinitions: specialDefinitions,
    indexes: {
      definitionsMap,
      ownerActorMap
    }
  };
}

/**
 * Garante que todos os valores do `LocalizationPortuguese.json` sejam strings.
 * Ex: "Character.Name.Vinteum": 21 vira "21".
 */
export function adaptLocalization(rawLocalization) {
  if (!rawLocalization || typeof rawLocalization !== 'object') return {};

  const normalized = {};
  Object.entries(rawLocalization).forEach(([key, value]) => {
    normalized[key] = value === null || value === undefined ? '' : String(value);
  });
  return normalized;
}