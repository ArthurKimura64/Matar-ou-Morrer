/**
 * Compacta seleções para salvar apenas IDs no banco (reduz drasticamente o JSONB)
 * e reconstrói os objetos completos em memória usando o GameEconomyData carregado.
 */

const SELECTION_LIST_KEYS = [
  'attacks', 'weapons', 'passives', 'devices', 'powers', 'specials', 'passiveSpecials',
  'attack', 'weapon', 'passive', 'device', 'power', 'special', 'passiveSpecial'
];

function extractId(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  return item.ID || item.id || null;
}

export function buildDefinitionsIndex(gameData) {
  if (gameData?.indexes?.definitionsMap) {
    return gameData.indexes.definitionsMap;
  }

  const index = new Map();
  if (!gameData) return index;

  const lists = [
    gameData.AttackDefinitions,
    gameData.PassiveDefinitions,
    gameData.ConsumableDefinitions,
    gameData.SpecialDefinitions
  ];

  lists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((def) => {
      if (def?.ID) index.set(def.ID, def);
    });
  });

  return index;
}

export function serializeSelections(selections) {
  if (!selections || typeof selections !== 'object') return {};

  const compact = {};

  SELECTION_LIST_KEYS.forEach((key) => {
    if (Array.isArray(selections[key])) {
      compact[key] = selections[key].map(extractId).filter(Boolean);
    }
  });

  if (selections.copycatAssignments && typeof selections.copycatAssignments === 'object') {
    const compactCopycat = {};
    Object.entries(selections.copycatAssignments).forEach(([catKey, slotsObj]) => {
      if (!slotsObj || typeof slotsObj !== 'object') return;
      const cleanSlots = {};
      Object.entries(slotsObj).forEach(([slotKey, item]) => {
        const id = extractId(item);
        if (id) cleanSlots[slotKey] = id;
      });
      if (Object.keys(cleanSlots).length > 0) {
        compactCopycat[catKey] = cleanSlots;
      }
    });
    if (Object.keys(compactCopycat).length > 0) {
      compact.copycatAssignments = compactCopycat;
    }
  }

  if (Array.isArray(selections.convertedPowers) && selections.convertedPowers.length > 0) {
    compact.convertedPowers = selections.convertedPowers.map(extractId).filter(Boolean);
  }

  return compact;
}

export function hydrateSelections(rawSelections, gameData) {
  if (!rawSelections || typeof rawSelections !== 'object') return {};

  const defIndex = buildDefinitionsIndex(gameData);
  const resolveItem = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') return defIndex.get(entry) || { ID: entry };
    if (entry.ID && defIndex.has(entry.ID)) return defIndex.get(entry.ID);
    return entry;
  };

  const hydrated = {};

  SELECTION_LIST_KEYS.forEach((key) => {
    if (Array.isArray(rawSelections[key])) {
      hydrated[key] = rawSelections[key].map(resolveItem).filter(Boolean);
    }
  });

  if (rawSelections.copycatAssignments && typeof rawSelections.copycatAssignments === 'object') {
    const hydratedCopycat = {};
    Object.entries(rawSelections.copycatAssignments).forEach(([catKey, slotsObj]) => {
      if (!slotsObj || typeof slotsObj !== 'object') return;
      const resolvedSlots = {};
      Object.entries(slotsObj).forEach(([slotKey, entry]) => {
        const item = resolveItem(entry);
        if (item) resolvedSlots[slotKey] = item;
      });
      hydratedCopycat[catKey] = resolvedSlots;
    });
    hydrated.copycatAssignments = hydratedCopycat;
  }

  if (Array.isArray(rawSelections.convertedPowers)) {
    hydrated.convertedPowers = rawSelections.convertedPowers.map(extractId).filter(Boolean);
  }

  return hydrated;
}

/**
 * Remove anotações privadas (_notes e strings legadas) antes de gravar
 * additional_counters na tabela pública players.
 */
export function stripNotesFromAdditionalCounters(additionalCounters) {
  if (!additionalCounters || typeof additionalCounters !== 'object') return {};
  const clean = {};
  Object.entries(additionalCounters).forEach(([key, val]) => {
    if (key !== '_notes' && typeof val === 'object' && val !== null && val.current !== undefined) {
      clean[key] = val;
    }
  });
  return clean;
}

/**
 * Calcula apenas os números públicos (total e disponível) de cada categoria
 * para exibir na sidebar de jogadores sem revelar nenhuma carta secreta.
 */
export function buildPublicCharacteristicsSummary({
  actor,
  selections = {},
  usedItems = [],
  unlockedItems = [],
  copycatAssignments = null,
  convertedPowers = null
}) {
  const usedSet = usedItems instanceof Set ? usedItems : new Set(usedItems || []);
  const unlockedSet = unlockedItems instanceof Set ? unlockedItems : new Set(unlockedItems || []);
  const copycat = copycatAssignments || selections?.copycatAssignments || {};
  const convertedSet =
    convertedPowers instanceof Set
      ? convertedPowers
      : new Set(Array.isArray(convertedPowers) ? convertedPowers : selections?.convertedPowers || []);

  const summary = {
    attacks: { total: Number(actor?.NumberOfUnlimitedAttacks) || 0, available: 0 },
    weapons: { total: Number(actor?.NumberOfWeapons) || 0, available: 0 },
    passives: { total: Number(actor?.NumberOfPassives) || 0, available: 0 },
    devices: { total: Number(actor?.NumberOfDevices) || 0, available: 0 },
    powers: { total: Number(actor?.NumberOfPowers) || 0, available: 0 },
    specials: { total: Number(actor?.NumberOfSpecialAbilities) || 0, available: 0 },
    passiveSpecials: { total: Number(actor?.NumberOfPassiveSpecialAbilities) || 0, available: 0 }
  };

  const basePowers = Array.isArray(selections?.powers) ? selections.powers : [];
  const convertedPowerItems = basePowers.filter((item) => {
    const id = extractId(item);
    return id && convertedSet.has(id);
  });

  Object.keys(summary).forEach((key) => {
    const baseItems = Array.isArray(selections?.[key]) ? selections[key] : [];
    const copiedItems = Object.values(copycat[key] || {}).filter(Boolean);
    const copiedIds = new Set(copiedItems.map(extractId).filter(Boolean));
    let effectiveItems = [...baseItems, ...copiedItems];

    if (convertedPowerItems.length > 0) {
      if (key === 'powers') {
        effectiveItems = effectiveItems.filter((item) => !convertedSet.has(extractId(item)));
        summary[key].total = Math.max(0, effectiveItems.length);
      } else if (key === 'passives') {
        effectiveItems = [...effectiveItems, ...convertedPowerItems];
        summary[key].total = Math.max(summary[key].total, effectiveItems.length);
      }
    } else if (summary[key].total === 0) {
      summary[key].total = effectiveItems.length;
    }

    if (key === 'passiveSpecials') {
      summary[key].available = effectiveItems.filter((item) => unlockedSet.has(extractId(item))).length;
    } else if (key === 'specials') {
      summary[key].available = effectiveItems.filter((item) => {
        const id = extractId(item);
        return id && (copiedIds.has(id) || unlockedSet.has(id)) && !usedSet.has(id);
      }).length;
    } else {
      const usedCount = effectiveItems.filter((item) => usedSet.has(extractId(item))).length;
      summary[key].available = Math.max(0, effectiveItems.length - usedCount);
    }
  });

  return summary;
}