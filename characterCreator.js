// Utilitários globais
const Utils = {
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
}

// Template unificado para cards de características
function createCharacteristicCard(actor, localization) {
  return `
    <div class="card col-sm-10 my-3 p-0">
      <div class="row g-0">
        <div class="col-12 col-md-6 border-end">
          <div class="card-header">${localization['Characteristic.Title']}</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization['Characteristic.DodgePoints']}: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>${localization['Characteristic.OportunityAttack']}: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>${localization['Characteristic.ExplorationItens']}: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>${localization['Characteristic.DefenseDices']}: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">${localization['Characteristic.Tecnique']}</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization['Terrain.Dessert']}: </b>${actor.Tecnique.Desert || localization['Characteristic.NotDefined'] || 'Não definido'}</li>
            <li class="list-group-item"><b>${localization['Terrain.City']}: </b>${actor.Tecnique.City || localization['Characteristic.NotDefined'] || 'Não definido'}</li>
            <li class="list-group-item"><b>${localization['Terrain.Junkyard']}: </b>${actor.Tecnique.Landfill || localization['Characteristic.NotDefined'] || 'Não definido'}</li>
            <li class="list-group-item"><b>${localization['Terrain.Mountain']}: </b>${actor.Tecnique.Mountain || localization['Characteristic.NotDefined'] || 'Não definido'}</li>
          </ul>
        </div>
      </div>
      <div class='mb-4 border-top px-3'>
        <h5 class="text-secondary mb-2 text-center">${localization['Characteristic.Reivolk.Title']}</h5>
        <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`]}</h5>
        <div class='col-12 text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`]}</div>
      </div>
    </div>
  `;
}

Promise.all([fetch("GameEconomyData.json").then((r) => r.json()), fetch("LocalizationPortuguese.json").then((r) => r.json())]).then(
  ([gameData, localization]) => {
    const characterSelection = document.getElementById("characterSelection")
    if (!characterSelection) return
    characterSelection.innerHTML = ""
    characterSelection.classList.remove("flex-column")
    characterSelection.classList.add("d-flex", "flex-wrap", "justify-content-center")

    gameData.ActorDefinitions.forEach((actor) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.id = actor.ID
      btn.className = "btn btn-outline-light text-center col-auto my-1"
      btn.textContent = `${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})` || actor.ID
      btn.addEventListener("click", () => renderCharacter(actor, gameData, localization))
      characterSelection.appendChild(btn)
    })
  }
)

function renderCharacter(actor, gameData, localization) {
  const container = document.getElementById("characterContainer") || document.body
  container.innerHTML = ""

  // Título
  const rowTitle = document.createElement("div")
  rowTitle.className = "row justify-content-center text-center"
  rowTitle.innerHTML = `
  <div class="col-12"><h1>${localization[`Character.Name.${actor.ID}`] || actor.ID}</h1></div>
  <div class="col-12"><h3>${localization[`Character.Title.${actor.ID}`] || actor.ID}</h3></div>
  ${localization[`Character.Description.${actor.ID}`] ? `<div class="col-10 mb-3 px-3">${localization[`Character.Description.${actor.ID}`]}</div>` : ""}
  ${actor.SpecialDescription ? `<div class="col-12">${localization[`Character.${actor.SpecialDescription}`]}</div>` : ""}
  `
  container.appendChild(rowTitle)

  // Card principal
  const rowCard = document.createElement("div")
  rowCard.className = "row justify-content-center"
  rowCard.innerHTML = createCharacteristicCard(actor, localization)
  container.appendChild(rowCard)

  // Configuração centralizada de tipos de seleção com mapeamento direto
  const selectionConfigs = {
    attack: { data: actor.UnlimitedAttacksData, number: actor.NumberOfUnlimitedAttacks, definitions: gameData.AttackDefinitions, color: 'danger' },
    weapon: { data: actor.WeaponsData, number: actor.NumberOfWeapons, definitions: gameData.AttackDefinitions, color: 'danger' },
    passive: { data: actor.PassivesData, number: actor.NumberOfPassives, definitions: gameData.PassiveDefinitions, color: 'success' },
    device: { data: actor.DevicesData, number: actor.NumberOfDevices, definitions: gameData.ConsumableDefinitions, color: 'info' },
    power: { data: actor.PowersData, number: actor.NumberOfPowers, definitions: gameData.ConsumableDefinitions, color: 'primary' },
    special: { data: actor.SpecialAbilitiesData, number: actor.NumberOfSpecialAbilities, definitions: gameData.ConsumableDefinitions, color: 'warning' },
    passiveSpecial: { data: actor.PassiveSpecialAbilitiesData, number: actor.NumberOfPassiveSpecialAbilities, definitions: gameData.PassiveDefinitions, color: 'warning' }
  }

  // Aplicar configurações específicas de cada tipo
  Object.entries(selectionConfigs).forEach(([type, config]) => {
    config.title = localization[`Characteristic.${type === 'attack' ? 'Attack' : 
                                   type === 'weapon' ? 'Weapon' : 
                                   type === 'passive' ? 'Passive' : 
                                   type === 'device' ? 'Device' : 
                                   type === 'power' ? 'Power' : 
                                   type === 'special' ? 'SpecialAbility' : 
                                   'PassiveSpecialAbility'}.Title`]
    
    if (['attack', 'weapon'].includes(type)) {
      config.getName = (id) => localization[id] || id
      config.getDesc = (def) => {
        // Para personagens com modos, mostrar descrição dual mode na seleção
        if (actor.mode1 && actor.mode2 && def.modes) {
          return Utils.createDualModeDescription(def, localization, actor);
        }
        return Utils.createAttackDescription(def, localization);
      }
    } else if (['device', 'power', 'special'].includes(type)) {
      config.getName = (id, def) => Utils.createTriggerName(id, def, localization)
      config.getDesc = (def) => {
        // Para personagens com modos, mostrar restrições de modo
        if (actor.mode1 && actor.mode2 && def.modeRestriction) {
          return Utils.createModeRestrictedDescription(def, localization, actor);
        }
        return localization[def.Description] || "";
      }
    } else {
      config.getName = (id) => localization[id] || Utils.formatFallback(id)
      config.getDesc = (def) => {
        // Para personagens com modos, mostrar restrições de modo também em passivas
        if (actor.mode1 && actor.mode2 && def.modeRestriction && ['passive', 'passiveSpecial'].includes(type)) {
          return Utils.createModeRestrictedDescription(def, localization, actor);
        }
        return localization[def.Description] || "Sem descrição.";
      }
    }
  })

  // Função auxiliar para seleção limitada
  function setupLimitedSelection(row, maxSelectable, borderColor) {
    const buttons = row.querySelectorAll(".select-btn")
    buttons.forEach((btn) => {
      const card = btn.closest(".card")
      card.classList.remove("border-3", "border-danger", "border-primary", "border-success", "border-warning")
      card.classList.add("border", "border-secondary")
      btn.textContent = localization['Characteristic.Select']
      btn.classList.remove("active")
      btn.disabled = false
      card.classList.remove("bg-dark", "opacity-75", "shadow")
      
      btn.addEventListener("click", function () {
        btn.classList.toggle("active")
        if (btn.classList.contains("active")) {
          card.classList.remove("border-secondary")
          card.classList.add("border-3", borderColor, "shadow")
          card.style.background = "var(--bs-gray-800)"
          card.style.color = "#fff"
          btn.textContent = localization['Characteristic.Selected']
        } else {
          card.classList.remove("border-3", borderColor, "shadow")
          card.classList.add("border-secondary")
          card.style.background = ""
          card.style.color = ""
          btn.textContent = localization['Characteristic.Select']
        }
        
        const selected = row.querySelectorAll(".select-btn.active")
        if (selected.length >= maxSelectable) {
          buttons.forEach((b) => {
            if (!b.classList.contains("active")) {
              b.disabled = true
              b.closest(".card").classList.add("bg-dark", "opacity-75")
            }
          })
        } else {
          buttons.forEach((b) => {
            b.disabled = false
            b.closest(".card").classList.remove("bg-dark", "opacity-75")
          })
        }
      })
    })
  }

  // Função simplificada para criar cards de seleção
  function createSelectionCards(type, config) {
    if (!config.data || !config.data.length) return null
    
    const row = document.createElement("div")
    row.className = "row justify-content-center"
    row.innerHTML = `<h3 class='text-${config.color} text-center my-3'>${config.title} (Escolha ${config.number})</h3>`
    
    config.data.forEach((id) => {
      const card = document.createElement("div")
      card.className = "card col-10 col-md-4 m-2"
      const def = (config.definitions || []).find((d) => d.ID === id) || {}
      const name = typeof config.getName === 'function' ? config.getName(id, def) : id
      const desc = typeof config.getDesc === 'function' ? config.getDesc(def) : ""
      
      card.innerHTML = `
        <div class="card-body">
          <h5 class="card-title text-${config.color}">${name}</h5>
          <p class="card-text">${desc}</p>
          <button class="btn btn-outline-${config.color} select-btn w-100 mt-2" data-type="${type}">${localization['Characteristic.Select']}</button>
        </div>`
      row.appendChild(card)
    })
    
    container.appendChild(row)
    setupLimitedSelection(row, config.number || 1, `border-${config.color}`)
    return row
  }

  // Criar todas as seções de seleção
  Object.entries(selectionConfigs).forEach(([type, config]) => {
    createSelectionCards(type, config)
  })

  // Adiciona botão de criar personagem
  const createBtnRow = document.createElement("div")
  createBtnRow.className = "row justify-content-center my-4"
  const createBtn = document.createElement("button")
  createBtn.className = "btn btn-lg btn-success col-8"
  createBtn.textContent = "Criar Personagem"
  createBtn.disabled = true
  createBtnRow.appendChild(createBtn)
  container.appendChild(createBtnRow)

  // Verificação simplificada das seleções
  function checkSelections() {
    const isComplete = Object.entries(selectionConfigs).every(([type, config]) => {
      if (config.data && config.number) {
        return container.querySelectorAll(`.select-btn.active[data-type="${type}"]`).length === config.number
      }
      return true
    })
    createBtn.disabled = !isComplete
  }

  // Adiciona listeners para atualizar o botão
  container.querySelectorAll(".select-btn").forEach((btn) => {
    btn.addEventListener("click", checkSelections)
  })
  checkSelections()

  // Função auxiliar para obter seleções de um tipo específico
  function getSelectedByType(type, definitions) {
    return Array.from(container.querySelectorAll(`.select-btn.active[data-type="${type}"]`))
      .map(btn => {
        const title = btn.closest(".card").querySelector(".card-title").textContent.trim()
        return definitions.find((def) => {
          const locName = selectionConfigs[type].getName(def.ID, def)
          return title === locName
        })
      })
      .filter(Boolean)
  }

  // Evento do botão criar personagem
  createBtn.onclick = function () {
    // Coleta todas as seleções usando a configuração existente
    const selections = Object.fromEntries(
      Object.entries(selectionConfigs).map(([type, config]) => [
        type === 'attack' ? 'attacks' : 
        type === 'weapon' ? 'weapons' : 
        type === 'passive' ? 'passives' : 
        type === 'passiveSpecial' ? 'passiveSpecials' : 
        `${type}s`,
        getSelectedByType(type, config.definitions)
      ])
    )

    // Limpa container e mostra ficha final
    container.innerHTML = ""
    window.scrollTo(0, 0)
    createCharacterSheet(actor, selections, localization, gameData, container)
  }
}  // Função para criar a ficha final do personagem
function createCharacterSheet(actor, selections, localization, gameData, container) {
  const ficha = document.createElement("div")
  ficha.className = "card col-12 col-md-12 mx-auto my-5 p-4"

  // Contadores básicos
  const counters = [
    { id: "vida", initial: 20, min: 0, max: 999, title: localization['Characteristic.Health'] },
    { id: "esquiva", initial: 0, min: 0, max: 10, title: localization['Characteristic.DodgePoints'] },
    { id: "oport", initial: 0, min: 0, max: 10, title: localization['Characteristic.OportunityAttack'] },
    { id: "item", initial: 0, min: 0, max: 99, title: localization['Characteristic.ExplorationItens'] }
  ]

  // Configuração centralizada dos tipos de itens na ficha
  const itemSections = [
    { key: 'attacks', title: localization['Characteristic.Attack.Title'], color: 'danger', type: 'attack' },
    { key: 'weapons', title: localization['Characteristic.Weapon.Title'], color: 'danger', type: 'weapon' },
    { key: 'passives', title: localization['Characteristic.Passive.Title'], color: 'success', type: 'passive' },
    { key: 'devices', title: localization['Characteristic.Device.Title'], color: 'info', type: 'device', useButton: true },
    { key: 'powers', title: localization['Characteristic.Power.Title'], color: 'primary', type: 'power', useButton: true },
    { key: 'specials', title: localization['Characteristic.SpecialAbility.Title'], color: 'warning', type: 'special', useButton: true },
    { key: 'passiveSpecials', title: localization['Characteristic.PassiveSpecialAbility.Title'], color: 'warning', type: 'passiveSpecial' }
  ]

  // Função para criar card de item na ficha
  function createShownCard({ title, desc, color, addButton = false, defType = '', textButton = "Usar", item, isTransformed = false }) {
    return `
      <div class='col-12 col-md-3'>
        <div class='card border-${color} h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
          <div class='card-body p-2'>
            <div class='fw-bold text-${color} mb-1'>${title}</div>
            <div class='small mb-2'>${desc}</div>
            ${addButton ? `<button class='btn btn-sm btn-outline-${color} use-${defType}-btn' data-item='${item?.ID || ''}'>${textButton}</button>` : ''}
          </div>
        </div>
      </div>`
  }

  // Função para criar seção de itens
  function createItemSection(items, title, color, defType = '', addButton = false) {
    if (!items || items.length === 0) return ''
    
    return `
      <h4 class='text-${color}'>${title}:</h4>
      <div class='row g-2 mb-2 justify-content-center' data-section='${defType}'>
        ${items.map((item) => {
          const currentMode = window.currentMode || 'mode1';
          const desc = defType === 'attack' || defType === 'weapon' 
            ? (Utils.modeSystem.hasModes(actor) && item.modes 
                ? Utils.createDualModeDescription(item, localization, actor)
                : Utils.createAttackDescription(item, localization, currentMode))
            : (Utils.modeSystem.hasModes(actor) && ['power', 'passive', 'special', 'passiveSpecial'].includes(defType)
                ? Utils.createModeRestrictedDescription(item, localization, actor)
                : localization[item.Description] || "")
          
          // Verificar se item deve estar bloqueado
          const isBlocked = Utils.modeSystem.hasModes(actor) 
            ? !Utils.modeSystem.canUseItem(item, currentMode)
            : (Utils.transformationSystem.hasTransformation(actor) && 
               !Utils.transformationSystem.canUseItem(item, window.isTransformed || false, actor));
          
          const blockedClass = isBlocked ? 'opacity-50' : '';
          const blockedText = isBlocked ? ' (Bloqueado neste modo)' : '';
          
          return `
            <div class='col-12 col-md-3'>
              <div class='card border-${color} h-100 ${blockedClass}' style='background: var(--bs-gray-800); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-${color} mb-1'>${localization[item.ID]}${blockedText}</div>
                  <div class='small mb-2'>${desc}</div>
                  ${addButton && !isBlocked ? `<button class='btn btn-sm btn-outline-${color} use-${defType}-btn' data-item='${item.ID}'>${localization['Characteristic.Use']}</button>` : ''}
                </div>
              </div>
            </div>`
        }).join("")}
      </div>
      ${addButton ? `<div class='text-center mb-4'><button id='recover-${defType}s' class='btn btn-sm btn-${color}'>${localization[`Characteristic.Recover${defType.charAt(0).toUpperCase() + defType.slice(1)}s`]}</button></div>` : ''}
    `
  }

  ficha.innerHTML = `
    <h2 class='text-center mb-4'>Ficha do Personagem</h2>
    <h3 class='text-center mb-3'>${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})</h3>
    ${localization[`Character.Description.${actor.ID}`] ? `<div class=' col-10 mb-4 px-3'>${localization[`Character.Description.${actor.ID}`]}</div>` : ""}
    
    ${Utils.transformationSystem.hasTransformation(actor) ? `
      <div class='text-center mb-3'>
        <div class='btn-group' role='group'>
          ${Utils.modeSystem.hasModes(actor) ? 
            Utils.modeSystem.getModes(actor).map((mode, index) => `
              <input type='radio' class='btn-check' name='transformation-mode' id='mode-${mode}' ${index === 0 ? 'checked' : ''} autocomplete='off'>
              <label class='btn btn-outline-${mode === 'mode2' ? 'danger' : 'warning'}' for='mode-${mode}'>
                ${Utils.modeSystem.getModeName(actor, mode, localization)}
              </label>
            `).join('') : `
              <input type='radio' class='btn-check' name='transformation-mode' id='mode-mode1' checked autocomplete='off'>
              <label class='btn btn-outline-warning' for='mode-mode1'>Modo Normal</label>
              <input type='radio' class='btn-check' name='transformation-mode' id='mode-mode2' autocomplete='off'>
              <label class='btn btn-outline-danger' for='mode-mode2'>Modo Transformado</label>
            `
          }
        </div>
        <div class='mt-2 small text-muted'>
          ${Utils.transformationSystem.getTransformationName(actor, localization)}
        </div>
      </div>
    ` : ''}
    
    <div class='mb-3 row justify-content-center text-center'>
      ${counters.map(c => createCounter(c).html).join('')}
    </div>
    <div class="row justify-content-center">${createCharacteristicCard(actor, localization)}</div>
    
    <div id='character-items'>
      ${itemSections.map(section => 
        createItemSection(selections[section.key], section.title, section.color, section.type, section.useButton)
      ).join('')}
    </div>
    
    ${createSpecialCharacteristics(actor, localization, gameData)}
    
    <div class='mb-4 mt-4 border-top pt-3'>
      <h5 class="text-secondary mb-2 text-center">${localization['Characteristic.Reivolk.Title']}</h5>
      <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`]}</h5>
      <div class='text-light text-center'>${localization[`Character.Reivolk.${actor.ID}.Description`]}</div>
    </div>
    
    <div class='text-center mt-4'><button class='btn btn-secondary' onclick='resetCharacterState()'>Reiniciar</button></div>
  `

  // Configurar contadores
  counters.forEach(c => setupIncrementDecrement(ficha, c.id, c.min, c.max))
  
  // Configurar contadores especiais se existirem
  if (window._specialCounters) {
    window._specialCounters.forEach(c => setupIncrementDecrement(ficha, c.id, c.min, c.max))
    window._specialCounters = undefined
  }

  // Configurar sistema de transformação
  if (Utils.transformationSystem.hasTransformation(actor)) {
    setupTransformationSystem(ficha, actor, selections, localization, itemSections)
  }

  container.appendChild(ficha)

  // Configurar botões de usar/recuperar automaticamente
  itemSections.filter(s => s.useButton).forEach(section => {
    setupUseRecoverButtons(ficha, `.use-${section.type}-btn`, `#recover-${section.type}s`)
  })
}

// Função para configurar o sistema de modos/transformação
function setupTransformationSystem(ficha, actor, selections, localization, itemSections) {
  if (Utils.modeSystem.hasModes(actor)) {
    window.currentMode = Utils.modeSystem.getModes(actor)[0];
  } else {
    window.isTransformed = false;
    window.currentMode = 'mode1';
  }
  if (!window.usedItemsState) window.usedItemsState = new Set();
  const modeButtons = Array.from(ficha.querySelectorAll('input[name="transformation-mode"]'));
  function saveButtonStates() {
    ficha.querySelectorAll('.use-device-btn, .use-power-btn, .use-special-btn').forEach(btn => {
      if (btn.disabled && btn.textContent.trim() === 'Usado') {
        const itemId = btn.getAttribute('data-item');
        if (itemId) window.usedItemsState.add(itemId);
      }
    });
  }
  function restoreButtonStates() {
    ficha.querySelectorAll('.use-device-btn, .use-power-btn, .use-special-btn').forEach(btn => {
      const itemId = btn.getAttribute('data-item');
      if (itemId && window.usedItemsState.has(itemId)) {
        btn.disabled = true;
        btn.textContent = 'Usado';
        btn.closest('.card').classList.add('bg-dark', 'opacity-75');
      }
    });
  }
  function refreshItemsDisplay() {
    saveButtonStates();
    itemSections.forEach(section => {
      const sectionElement = ficha.querySelector(`[data-section="${section.type}"]`);
      if (!sectionElement || !selections[section.key]?.length) return;
      sectionElement.innerHTML = selections[section.key].map(item =>
        renderItemCard({ item, section, actor, localization, currentMode: window.currentMode, isTransformed: window.isTransformed, useButton: section.useButton })
      ).join("");
    });
    itemSections.filter(s => s.useButton).forEach(section => {
      setupUseRecoverButtons(ficha, `.use-${section.type}-btn`, `#recover-${section.type}s`)
    });
    restoreButtonStates();
  }
  function handleModeChange() {
    const selectedButton = modeButtons.find(btn => btn.checked);
    if (selectedButton) {
      const modeId = selectedButton.id.replace('mode-', '');
      window.currentMode = modeId;
      window.isTransformed = Utils.modeSystem.hasModes(actor) ? modeId !== 'mode1' : modeId === 'mode2' || modeId === 'transformed';
      refreshItemsDisplay();
    }
  }
  modeButtons.forEach(btn => btn.addEventListener('change', handleModeChange));
}

// Função para criar características especiais
function createSpecialCharacteristics(actor, localization, gameData) {
  if (!actor.SpecialCharacteristics || !Array.isArray(actor.SpecialCharacteristics)) return ''
  
  const specialTypes = {
    textbox: (spec, idx) => `
      <div class='col-12 col-md-5 mb-3 mb-md-0 d-flex justify-content-center'>
        <div class='card bg-dark text-white w-100'>
          <div class='card-body p-2 d-flex flex-column align-items-center'>
            <div class='fw-bold mb-1'>${localization[spec.Title] || spec.Title}</div>
            <div class='input-group flex-nowrap justify-content-center'>
              <textarea rows='4' class='form-control w-75 mb-2 rounded shadow-sm' id='special-textbox-${idx}' placeholder='${spec.Placeholder || 'Digite aqui...'}'></textarea>
            </div>
          </div>
        </div>
      </div>`,
    
    counter: (spec, idx) => {
      const counter = createCounter({
        id: `special-counter-${idx}`,
        initial: spec.InitialValue || 0,
        min: spec.Min || 0,
        max: spec.Max || 99,
        title: localization[spec.Title] || spec.Title
      })
      
      if (!window._specialCounters) window._specialCounters = []
      window._specialCounters.push({ id: `special-counter-${idx}`, min: spec.Min || 0, max: spec.Max || 99 })
      return counter.html
    }
  }
  
  return `<div class='row g-2 mb-2 gap-3 d-flex flex-wrap justify-content-center'>
    ${actor.SpecialCharacteristics.map((id, idx) => {
      const spec = gameData.SpecialDefinitions.find((s) => s.ID === id)
      if (!spec || !specialTypes[spec.Type]) return ''
      return specialTypes[spec.Type](spec, idx)
    }).join('')}
  </div>`
}

// Função simplificada para criar contador
function createCounter({ id, initial = 20, min = 0, max = 999, title = 'Básico' }) {
  return {
    html: `
      <div class='col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center'>
        <div class='card-body p-2 d-flex flex-column align-items-center'>
          <div class='fw-bold mb-1' style='font-size:0.95em;'>${title}</div>
          <div class='input-group flex-nowrap justify-content-center'>
            <button class='btn btn-outline-danger btn-sm' type='button' id='${id}-menos'>-</button>
            <input type='number' class='form-control text-center mx-1' id='${id}' value='${initial}' min='${min}' max='${max}' style='width:60px; text-align:center; font-size:1em;'>
            <button class='btn btn-outline-success btn-sm' type='button' id='${id}-mais'>+</button>
          </div>
        </div>
      </div>`,
    id, min, max
  }
}

// Função utilitária para configurar incremento/decremento
function setupIncrementDecrement(container, id, min, max) {
  container.querySelector(`#${id}-menos`).onclick = () => {
    const input = container.querySelector(`#${id}`)
    input.value = Math.max(parseInt(input.value) - 1, min)
  }
  container.querySelector(`#${id}-mais`).onclick = () => {
    const input = container.querySelector(`#${id}`)
    input.value = Math.min(parseInt(input.value) + 1, max)
  }
}

// Função utilitária para botões de usar/recuperar
function setupUseRecoverButtons(container, btnClass, recoverBtnId) {
  container.querySelectorAll(btnClass).forEach((btn) => {
    btn.addEventListener("click", function () {
      const itemId = btn.getAttribute('data-item');
      
      btn.disabled = true
      btn.textContent = "Usado"
      btn.closest(".card").classList.add("bg-dark", "opacity-75")
      
      // Adicionar ao estado persistente
      if (itemId && window.usedItemsState) {
        window.usedItemsState.add(itemId);
      }
    })
  })
  
  const recoverBtn = container.querySelector(recoverBtnId)
  if (recoverBtn) {
    recoverBtn.addEventListener("click", function () {
      container.querySelectorAll(btnClass).forEach((btn) => {
        const itemId = btn.getAttribute('data-item');
        
        btn.disabled = false
        btn.textContent = "Usar"
        btn.closest(".card").classList.remove("bg-dark", "opacity-75")
        
        // Remover do estado persistente
        if (itemId && window.usedItemsState) {
          window.usedItemsState.delete(itemId);
        }
      })
    })
  }
}

// Função para limpar estado e reiniciar
function resetCharacterState() {
  // Limpar estado de itens usados
  if (window.usedItemsState) {
    window.usedItemsState.clear();
  }
  
  // Limpar variáveis globais
  window.currentMode = undefined;
  window.isTransformed = undefined;
  window._specialCounters = undefined;
  
  // Recarregar a página
  location.reload();
}

// Função utilitária para checar se item está bloqueado
function isItemBlocked(item, actor, currentMode, isTransformed) {
  return Utils.modeSystem.hasModes(actor)
    ? !Utils.modeSystem.canUseItem(item, currentMode)
    : (Utils.transformationSystem.hasTransformation(actor) && !Utils.transformationSystem.canUseItem(item, isTransformed, actor));
}

// Função utilitária para renderizar card de item
function renderItemCard({ item, section, actor, localization, currentMode, isTransformed, useButton }) {
  const desc = ['attack', 'weapon'].includes(section.type)
    ? (Utils.modeSystem.hasModes(actor) && item.modes
        ? Utils.createDualModeDescription(item, localization, actor)
        : Utils.createAttackDescription(item, localization, currentMode))
    : (Utils.modeSystem.hasModes(actor) && ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
        ? Utils.createModeRestrictedDescription(item, localization, actor)
        : localization[item.Description] || "");
  const blocked = isItemBlocked(item, actor, currentMode, isTransformed);
  return `
    <div class='col-12 col-md-3'>
      <div class='card border-${section.color} h-100${blocked ? ' opacity-50' : ''}' style='background: var(--bs-gray-800); color: #fff;'>
        <div class='card-body p-2'>
          <div class='fw-bold text-${section.color} mb-1'>${localization[item.ID]}${blocked ? ' (Bloqueado neste modo)' : ''}</div>
          <div class='small mb-2'>${desc}</div>
          ${useButton && !blocked ? `<button class='btn btn-sm btn-outline-${section.color} use-${section.type}-btn' data-item='${item.ID}'>${localization['Characteristic.Use']}</button>` : ''}
        </div>
      </div>
    </div>`;
}