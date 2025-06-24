// Utilitários globais
const Utils = {
  getLocalized: (localization, key, fallback = '') => localization[key] || fallback,
  
  formatFallback: (id) => id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim(),

  createAttackDescription: (def, localization) => `
    <b>${localization['AttackBase.Damage']}:</b> ${def.Damage}
    <br><b>${localization['AttackBase.Distance']}:</b> ${def.MinimumDistance == def.MaximumDistance ? def.MinimumDistance : `${def.MinimumDistance} - ${def.MaximumDistance}`}
    <br><b>${localization['AttackBase.Dices']}:</b> ${def.Dices}
    <br><b>${localization['AttackBase.LoadTime']}:</b> ${def.LoadTime || 0}
    <br><b>${localization['AttackBase.Terrain']}:</b> ${(def.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'}
    ${def.SpecialDescription ? `<br>${localization[def.SpecialDescription] || ""}` : ""}`,

  createTriggerName: (id, def, localization) => 
    `${(def.TriggerType || []).map(a => localization[`AttackBase.TriggerType.${a}`] || a).join(" / ") || 'N/A'} ${(localization[id] || Utils.formatFallback(id)).trim()}`
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
            <li class="list-group-item"><b>${localization['Terrain.Dessert']}: </b>${actor.Tecnique.Desert || "Não definido"}</li>
            <li class="list-group-item"><b>${localization['Terrain.City']}: </b>${actor.Tecnique.City || "Não definido"}</li>
            <li class="list-group-item"><b>${localization['Terrain.Junkyard']}: </b>${actor.Tecnique.Landfill || "Não definido"}</li>
            <li class="list-group-item"><b>${localization['Terrain.Mountain']}: </b>${actor.Tecnique.Mountain || "Não definido"}</li>
          </ul>
        </div>
      </div>
      <div class='mb-4 border-top px-3'>
        <h5 class="text-secondary mb-2 text-center">${Utils.getLocalized(localization, 'Characteristic.Reivolk.Title')}</h5>
        <h5 class="mb-2 text-info text-center">${Utils.getLocalized(localization, `Character.Reivolk.${actor.ID}.Title`)}</h5>
        <div class='col-12 text-light text-center"'>${Utils.getLocalized(localization, `Character.Reivolk.${actor.ID}.Description`)}</div>
      </div>
    </div>
  `
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
      btn.textContent = `${Utils.getLocalized(localization, `Character.Name.${actor.ID}`)} (${Utils.getLocalized(localization, `Character.Title.${actor.ID}`)})` || actor.ID
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
  <div class="col-12"><h1>${Utils.getLocalized(localization, `Character.Name.${actor.ID}`, actor.ID)}</h1></div>
  <div class="col-12"><h3>${Utils.getLocalized(localization, `Character.Title.${actor.ID}`, actor.ID)}</h3></div>
  ${Utils.getLocalized(localization, `Character.Description.${actor.ID}`) ? `<div class="col-10 mb-3 px-3">${Utils.getLocalized(localization, `Character.Description.${actor.ID}`)}</div>` : ""}
  ${actor.SpecialDescription ? `<div class="col-12">${Utils.getLocalized(localization, `Character.${actor.SpecialDescription}`)}</div>` : ""}
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
      config.getName = (id) => Utils.getLocalized(localization, id, id)
      config.getDesc = (def) => Utils.createAttackDescription(def, localization)
    } else if (['device', 'power', 'special'].includes(type)) {
      config.getName = (id, def) => Utils.createTriggerName(id, def, localization)
      config.getDesc = (def) => Utils.getLocalized(localization, def.Description, "")
    } else {
      config.getName = (id) => Utils.getLocalized(localization, id, Utils.formatFallback(id))
      config.getDesc = (def) => Utils.getLocalized(localization, def.Description, "Sem descrição.")
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
}

// Função para criar a ficha final do personagem
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
  function createShownCard({ title, desc, color, addButton = false, defType = '', textButton = "Usar" }) {
    return `
      <div class='col-12 col-md-3'>
        <div class='card border-${color} h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
          <div class='card-body p-2'>
            <div class='fw-bold text-${color} mb-1'>${title}</div>
            <div class='small mb-2'>${desc}</div>
            ${addButton ? `<button class='btn btn-sm btn-outline-${color} use-${defType}-btn'>${textButton}</button>` : ''}
          </div>
        </div>
      </div>`
  }

  // Função para criar seção de itens
  function createItemSection(items, title, color, defType = '', addButton = false) {
    if (!items || items.length === 0) return ''
    
    return `
      <h4 class='text-${color}'>${title}:</h4>
      <div class='row g-2 mb-2 justify-content-center'>
        ${items.map((item) => {
          const desc = defType === 'attack' || defType === 'weapon' 
            ? Utils.createAttackDescription(item, localization)
            : Utils.getLocalized(localization, item.Description, "")
          
          return createShownCard({
            title: Utils.getLocalized(localization, item.ID),
            desc,
            color,
            addButton,
            defType,
            textButton: localization['Characteristic.Use']
          })
        }).join("")}
      </div>
      ${addButton ? `<div class='text-center mb-4'><button id='recover-${defType}s' class='btn btn-sm btn-${color}'>${localization[`Characteristic.Recover${defType.charAt(0).toUpperCase() + defType.slice(1)}s`]}</button></div>` : ''}
    `
  }

  ficha.innerHTML = `
    <h2 class='text-center mb-4'>Ficha do Personagem</h2>
    <h3 class='text-center mb-3'>${Utils.getLocalized(localization, `Character.Name.${actor.ID}`)} (${Utils.getLocalized(localization, `Character.Title.${actor.ID}`)})</h3>
    ${Utils.getLocalized(localization, `Character.Description.${actor.ID}`) ? `<div class=' col-10 mb-4 px-3'>${Utils.getLocalized(localization, `Character.Description.${actor.ID}`)}</div>` : ""}
    
    <div class='mb-3 row justify-content-center text-center'>
      ${counters.map(c => createCounter(c).html).join('')}
    </div>
    <div class="row justify-content-center">${createCharacteristicCard(actor, localization)}</div>
    
    ${itemSections.map(section => 
      createItemSection(selections[section.key], section.title, section.color, section.type, section.useButton)
    ).join('')}
    
    ${createSpecialCharacteristics(actor, localization, gameData)}
    
    <div class='mb-4 mt-4 border-top pt-3'>
      <h5 class="text-secondary mb-2 text-center">${Utils.getLocalized(localization, 'Characteristic.Reivolk.Title')}</h5>
      <h5 class="mb-2 text-info text-center">${Utils.getLocalized(localization, `Character.Reivolk.${actor.ID}.Title`)}</h5>
      <div class='text-light text-center'>${Utils.getLocalized(localization, `Character.Reivolk.${actor.ID}.Description`)}</div>
    </div>
    
    <div class='text-center mt-4'><button class='btn btn-secondary' onclick='location.reload()'>Reiniciar</button></div>
  `

  // Configurar contadores
  counters.forEach(c => setupIncrementDecrement(ficha, c.id, c.min, c.max))
  
  // Configurar contadores especiais se existirem
  if (window._specialCounters) {
    window._specialCounters.forEach(c => setupIncrementDecrement(ficha, c.id, c.min, c.max))
    window._specialCounters = undefined
  }

  container.appendChild(ficha)

  // Configurar botões de usar/recuperar automaticamente
  itemSections.filter(s => s.useButton).forEach(section => {
    setupUseRecoverButtons(ficha, `.use-${section.type}-btn`, `#recover-${section.type}s`)
  })
}

// Função para criar características especiais
function createSpecialCharacteristics(actor, localization, gameData) {
  if (!actor.SpecialCharacteristics || !Array.isArray(actor.SpecialCharacteristics)) return ''
  
  const specialTypes = {
    textbox: (spec, idx) => `
      <div class='col-12 col-md-5 mb-3 mb-md-0 d-flex justify-content-center'>
        <div class='card bg-dark text-white w-100'>
          <div class='card-body p-2 d-flex flex-column align-items-center'>
            <div class='fw-bold mb-1'>${Utils.getLocalized(localization, spec.Title, spec.Title)}</div>
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
        title: Utils.getLocalized(localization, spec.Title, spec.Title)
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
      btn.disabled = true
      btn.textContent = "Usado"
      btn.closest(".card").classList.add("bg-dark", "opacity-75")
    })
  })
  
  const recoverBtn = container.querySelector(recoverBtnId)
  if (recoverBtn) {
    recoverBtn.addEventListener("click", function () {
      container.querySelectorAll(btnClass).forEach((btn) => {
        btn.disabled = false
        btn.textContent = "Usar"
        btn.closest(".card").classList.remove("bg-dark", "opacity-75")
      })
    })
  }
}