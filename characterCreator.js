Promise.all([fetch("GameEconomyData.json").then((r) => r.json()), fetch("LocalizationPortuguese.json").then((r) => r.json())]).then(
  ([gameData, localization]) => {
    const characterSelection = document.getElementById("characterSelection")
    if (!characterSelection) return
    characterSelection.innerHTML = ""
    characterSelection.classList.add("d-flex", "flex-column", "align-items-center")

    gameData.ActorDefinitions.forEach((actor) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.id = actor.ID
      btn.className = "btn btn-outline-light text-center col-6 col-sm-4 col-md-3 col-lg-2 my-2"
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
  ${actor.SpecialDescription ?`<div class="col-12">${localization[`Character.${actor.SpecialDescription}`]}</div>`: ""}
  `
  container.appendChild(rowTitle)

  // Card principal
  const rowCard = document.createElement("div")
  rowCard.className = "row justify-content-center"
  rowCard.innerHTML = `
    <div class="card col-sm-10 my-3 p-0">
      <div class="row g-0">
        <div class="col-12 col-md-6 border-end">
          <div class="card-header">Características</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Characteristic.DodgePoints`]}: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.OportunityAttack`]}: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.ExplorationItens`]}: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.DefenseDices`]}: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">Técnica</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Terrain.Dessert`]}: </b>${actor.Tecnique.Desert || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.City`]}: </b>${actor.Tecnique.City || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.Junkyard`]}: </b>${actor.Tecnique.Landfill || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.Mountain`]}: </b>${actor.Tecnique.Mountain || "Não definido"}</li>
          </ul>
        </div>
      </div>
      <div class='mb-4 mt-4 border-top pt-3'>
        <h5 class="text-secondary mb-2 text-center">Modo Reivolk</h5>
        <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h5>
        <div class='text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ''}</div>
      </div>
    </div>
  `
  container.appendChild(rowCard)

  // Função auxiliar para seleção limitada
  function setupLimitedSelection(row, maxSelectable, borderColor) {
    const buttons = row.querySelectorAll(".select-btn")
    buttons.forEach((btn) => {
      // Corrige borda inicial para cinza
      const card = btn.closest(".card")
      card.classList.remove("border-3", "border-danger", "border-primary", "border-success", "border-warning")
      card.classList.add("border", "border-secondary")
      btn.textContent = "Selecionar"
      btn.classList.remove("active")
      btn.disabled = false
      card.classList.remove("bg-dark", "opacity-75", "shadow")
      // Evento de seleção
      btn.addEventListener("click", function () {
        btn.classList.toggle("active")
        if (btn.classList.contains("active")) {
          card.classList.remove("border-secondary")
          card.classList.add("border-3", borderColor, "shadow")
          card.style.background = "var(--bs-gray-800)" // Bootstrap gray-900
          card.style.color = "#fff"
          btn.textContent = "Selecionado"
        } else {
          card.classList.remove("border-3", borderColor, "shadow")
          card.classList.add("border-secondary")
          card.style.background = ""
          card.style.color = ""
          btn.textContent = "Selecionar"
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

  // Função para formatar fallback amigável
  function formatFallback(id) {
    return id
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim()
  }

  // Função para obter TriggerType abreviado
  function getTriggerAbbr(type) {
    if (!type) return ""
    if (type === "Passive") return "(P)"
    if (type === "BeforeAttack") return "(A)"
    if (type === "AfterAttack") return "(D)"
    return ""
  }

  // Função genérica para criar cards de seleção
  function createSelectionCards({
    dataArray, // Array de IDs
    numberToSelect, // Quantos podem ser selecionados
    defArray, // Array de definições (ex: gameData.AttackDefinitions)
    defType, // 'Attack', 'Passive', 'Consumable', 'Special'
    color, // 'danger', 'success', 'info', 'primary', 'warning'
    title, // Título da seção
    getName, // Função para obter nome
    getDesc, // Função para obter descrição
    getAbbr, // Função para obter abreviação
    borderColor, // Cor da borda
    setupSelection = true // Se deve aplicar seleção limitada
  }) {
    if (!dataArray || !dataArray.length) return null
    const row = document.createElement("div")
    row.className = "row justify-content-center"
    row.innerHTML = `<h3 class='text-${color} text-center my-3'>${title} (Escolha ${numberToSelect})</h3>`
    dataArray.forEach((id) => {
      const card = document.createElement("div")
      card.className = "card col-10 col-md-4 m-2"
      const def = (defArray || []).find((d) => d.ID === id) || {}
      const abbr = getAbbr ? getAbbr(def.TriggerType) : ""
      const name = getName ? getName(id, def, abbr) : id
      const desc = getDesc ? getDesc(def) : ""
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-${color}\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-${color} select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `
      row.appendChild(card)
    })
    container.appendChild(row)
    if (setupSelection) setupLimitedSelection(row, numberToSelect || 1, borderColor || `border-${color}`)
    return row
  }

  // Cards de Ataques sem Limites
  createSelectionCards({
    dataArray: actor.UnlimitedAttacksData,
    numberToSelect: actor.NumberOfUnlimitedAttacks,
    defArray: gameData.AttackDefinitions,
    defType: 'Attack',
    color: 'danger',
    title: 'Ataques Sem Limites',
    getName: (id) => localization[`Attack.${id}`] || id,
    getDesc: (def) => `<b>${localization[`AttackBase.Damage`]}:</b> ${def.Damage} <br><b>${localization[`AttackBase.Distance`]}:</b> ${def.MinimumDistance == def.MaximumDistance ? def.MinimumDistance : `${def.MinimumDistance} - ${def.MaximumDistance}`}<br><b>${localization[`AttackBase.Dices`]}:</b> ${def.Dices} <br><b>${localization[`AttackBase.LoadTime`]}:</b> ${def.LoadTime || 0}<br><b>${localization[`AttackBase.Terrain`]}:</b> ${(def.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'} <br>${def.SpecialDescription ? `${localization[`Attack.${def.SpecialDescription}`] || ""}` : ""}`,
    getAbbr: null,
    borderColor: 'border-danger',
  })

  // Cards de Armas (Weapons)
  if (actor.WeaponsData && actor.WeaponsData.length) {
    createSelectionCards({
      dataArray: actor.WeaponsData,
      numberToSelect: actor.NumberOfWeapons,
      defArray: gameData.AttackDefinitions.filter(a => a.TriggerType === 'Weapon'),
      defType: 'Weapon',
      color: 'light', // branco
      title: 'Armas',
      getName: (id) => localization[`Attack.${id}`] || id,
      getDesc: (def) => `<b>${localization[`AttackBase.Damage`]}:</b> ${def.Damage} <br><b>${localization[`AttackBase.Distance`]}:</b> ${def.MinimumDistance == def.MaximumDistance ? def.MinimumDistance : `${def.MinimumDistance} - ${def.MaximumDistance}`}<br><b>${localization[`AttackBase.Dices`]}:</b> ${def.Dices} <br><b>${localization[`AttackBase.LoadTime`]}:</b> ${def.LoadTime || 0}<br><b>${localization[`AttackBase.Terrain`]}:</b> ${(def.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'} <br>${def.SpecialDescription ? `${localization[`Attack.${def.SpecialDescription}`] || ""}` : ""}`,
      getAbbr: null,
      borderColor: 'border-light',
    })
  }

  // Cards de Passivas
  createSelectionCards({
    dataArray: actor.PassivesData,
    numberToSelect: actor.NumberOfPassives,
    defArray: gameData.PassiveDefinitions,
    defType: 'Passive',
    color: 'success',
    title: 'Passivas',
    getName: (id, def, abbr) => `${getTriggerAbbr(def.TriggerType)} ${(localization[`Passive.${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`Passive.${def.Description}`] || "Sem descrição.",
    getAbbr: getTriggerAbbr,
    borderColor: 'border-success',
  })

  // Cards de Dispositivos
  createSelectionCards({
    dataArray: actor.DevicesData,
    numberToSelect: actor.NumberOfDevices,
    defArray: gameData.ConsumableDefinitions,
    defType: 'Consumable',
    color: 'info',
    title: 'Dispositivos',
    getName: (id, def, abbr) => `${getTriggerAbbr(def.TriggerType)} ${(localization[`Consumable.${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`Consumable.${def.Description}`] || "",
    getAbbr: getTriggerAbbr,
    borderColor: 'border-info',
  })

  // Cards de Poderes
  createSelectionCards({
    dataArray: actor.PowersData,
    numberToSelect: actor.NumberOfPowers,
    defArray: gameData.ConsumableDefinitions,
    defType: 'Consumable',
    color: 'primary',
    title: 'Poderes',
    getName: (id, def, abbr) => `${getTriggerAbbr(def.TriggerType)} ${(localization[`Consumable.${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`Consumable.${def.Description}`] || "",
    getAbbr: getTriggerAbbr,
    borderColor: 'border-primary',
  })

  // Cards de Habilidades Especiais
  createSelectionCards({
    dataArray: actor.SpecialAbilitiesData,
    numberToSelect: actor.NumberOfSpecialAbilities,
    defArray: gameData.ConsumableDefinitions,
    defType: 'Special',
    color: 'warning',
    title: 'Habilidades Especiais',
    getName: (id, def, abbr) => `${getTriggerAbbr(def.TriggerType)} ${(localization[`Consumable.${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`Consumable.${def.Description}`] || "Sem descrição.",
    getAbbr: getTriggerAbbr,
    borderColor: 'border-warning',
  })

  // Adiciona botão de criar personagem ao final
  const createBtnRow = document.createElement("div")
  createBtnRow.className = "row justify-content-center my-4"
  const createBtn = document.createElement("button")
  createBtn.className = "btn btn-lg btn-success col-8"
  createBtn.textContent = "Criar Personagem"
  createBtn.disabled = true
  createBtnRow.appendChild(createBtn)
  container.appendChild(createBtnRow)

  // Função utilitária para checar se todos os limites de seleção foram atingidos
  function allSelectionsOk(actor, container) {
    const checks = [
      { data: actor.UnlimitedAttacksData, num: actor.NumberOfUnlimitedAttacks, cls: '.btn-outline-danger.select-btn.active' },
      { data: actor.PowersData, num: actor.NumberOfPowers, cls: '.btn-outline-primary.select-btn.active' },
      { data: actor.PassivesData, num: actor.NumberOfPassives, cls: '.btn-outline-success.select-btn.active' },
      { data: actor.SpecialAbilitiesData, num: actor.NumberOfSpecialAbilities, cls: '.btn-outline-warning.select-btn.active' },
      { data: actor.DevicesData, num: actor.NumberOfDevices, cls: '.btn-outline-info.select-btn.active' },
    ]
    return checks.every(({ data, num, cls }) => {
      if (data && num) {
        return container.querySelectorAll(cls).length === num
      }
      return true
    })
  }

  // Função para checar se todos os limites foram atingidos
  function checkSelections() {
    createBtn.disabled = !allSelectionsOk(actor, container)
  }

  // Adiciona listeners para atualizar o botão
  container.querySelectorAll(".select-btn").forEach((btn) => {
    btn.addEventListener("click", checkSelections)
  })
  checkSelections()

  // Função para coletar informações detalhadas e mostrar ficha final
  createBtn.onclick = function () {
    // Coleta escolhas detalhadas
    function getAttackInfo(card) {
      const title = card.querySelector(".card-title").textContent.trim()
      const attack = gameData.AttackDefinitions.find((a) => {
        const locName = localization[`Attack.${a.ID}`] || a.ID
        return title === locName
      })
      if (!attack) return ""
      const ambients = (attack.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ")
      return `<b>${localization[`Attack.${attack.ID}`] || attack.ID}</b><br>
        ${localization[`AttackBase.Damage`]}: ${attack.Damage}<br>
        ${localization[`AttackBase.Distance`]}: ${attack.MinimumDistance == attack.MaximumDistance ? attack.MinimumDistance : `${attack.MinimumDistance} - ${attack.MaximumDistance}`}<br>
        ${localization[`AttackBase.Dices`]}: ${attack.Dices}<br>
        ${localization[`AttackBase.LoadTime`]}: ${attack.LoadTime || 0}<br>
        ${localization[`AttackBase.Terrain`]}: ${ambients || 'N/A'}<br>
        ${attack.SpecialDescription ? `${localization[`Attack.${attack.SpecialDescription}`] || ""}<br>` : ""}`
    }
    function getPowerObj(card) {
      const title = card.querySelector(".card-title").textContent.trim()
      const def = (gameData.ConsumableDefinitions || []).find((p) => {
        const locName = `${getTriggerAbbr(p.TriggerType)} ${(localization[`Consumable.${p.ID}`] || p.ID).trim()}`
        return title === locName
      }) || {}
      const abbr = getTriggerAbbr(def.TriggerType)
      const id = def.ID || title
      return {
        id,
        name: `${abbr} ${localization[`Consumable.${id}`] || id}`,
        desc: id ? localization[`Consumable.${def.Description}`] || "" : ""
      }
    }
    function getPassiveInfo(card) {
      const title = card.querySelector(".card-title").textContent
      const passiveDef = (gameData.PassiveDefinitions || []).find((p) => title.includes(localization[`Passive.${p.ID}`] || p.ID))
      if (passiveDef) {
        const abbr = getTriggerAbbr(passiveDef.TriggerType)
        const name = `${abbr} ${localization[`Passive.${passiveDef.ID}`] || passiveDef.ID}`
        const desc = localization[`Passive.${passiveDef.Description}`] || "Sem descrição."
        return `<b>${name}</b><br>${desc}`
      }
      return card.querySelector(".card-title").textContent
    }
    function getSpecialObj(card) {
      const title = card.querySelector(".card-title").textContent
      const def = (gameData.SpecialAbilityDefinitions || []).find((s) => title.includes(localization[`Special.${s.ID}`] || s.ID)) || {}
      const abbr = getTriggerAbbr(def.TriggerType)
      const id = def.ID || title
      return {
        id,
        name: `${abbr} ${localization[`Special.${id}`] || id}`,
        desc: id ? localization[`Special.${def.Description}`] || "Sem descrição." : ""
      }
    }
    // Seleções detalhadas
    const ataques = Array.from(document.querySelectorAll(".row .card .btn-outline-danger.select-btn.active")).map((btn) =>
      getAttackInfo(btn.closest(".card"))
    )
    // Armas
    const armas = Array.from(document.querySelectorAll(".row .card .btn-outline-light.select-btn.active")).map((btn) =>
      getAttackInfo(btn.closest(".card"))
    )
    const poderesObjs = Array.from(document.querySelectorAll(".row .card .btn-outline-primary.select-btn.active")).map((btn) =>
      getPowerObj(btn.closest(".card"))
    )
    const dispositivosObjs = Array.from(document.querySelectorAll(".row .card .btn-outline-info.select-btn.active")).map((btn) =>
      getPowerObj(btn.closest(".card"))
    )
    const passivas = Array.from(document.querySelectorAll(".row .card .btn-outline-success.select-btn.active")).map((btn) =>
      getPassiveInfo(btn.closest(".card"))
    )
    const especiaisObjs = Array.from(document.querySelectorAll(".row .card .btn-outline-warning.select-btn.active")).map((btn) =>
      getSpecialObj(btn.closest(".card"))
    )
    // Limpa container
    container.innerHTML = ""
    // Rola para o topo da página ao criar personagem
    window.scrollTo(0, 0)
    // Mostra ficha final
    const ficha = document.createElement("div")
    ficha.className = "card col-12 col-md-12 mx-auto my-5 p-4"
    ficha.innerHTML = `
      <h2 class='text-center mb-4'>Ficha do Personagem</h2>
      <h3 class='text-center mb-3'>${`${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})` || actor.ID}</h3>
      <div class='mb-3 row justify-content-center text-center'>
        <div class='col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center'>
          <div class='card bg-dark text-white w-100' style='max-width:220px;'>
            <div class='card-body p-2 d-flex flex-column align-items-center'>
              <div class='fw-bold mb-1' style='font-size:0.95em;'>Vida</div>
              <div class='input-group flex-nowrap justify-content-center'>
                <button class='btn btn-outline-danger btn-sm' type='button' id='vida-menos'>-</button>
                <input type='number' class='form-control text-center mx-1' id='vida' value='20' min='0' max='999' style='width:60px; text-align:center; font-size:1em;'>
                <button class='btn btn-outline-success btn-sm' type='button' id='vida-mais'>+</button>
              </div>
            </div>
          </div>
        </div>
        <div class='col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center'>
          <div class='card bg-dark text-white w-100' style='max-width:220px;'>
            <div class='card-body p-2 d-flex flex-column align-items-center'>
              <div class='fw-bold mb-1' style='font-size:0.95em;'>${localization[`Characteristic.DodgePoints`]}</div>
              <div class='input-group flex-nowrap justify-content-center'>
                <button class='btn btn-outline-danger btn-sm' type='button' id='esquiva-menos'>-</button>
                <input type='number' class='form-control text-center mx-1' id='esquiva' value='0' min='0' max='10' style='width:60px; text-align:center; font-size:1em;'>
                <button class='btn btn-outline-success btn-sm' type='button' id='esquiva-mais'>+</button>
              </div>
            </div>
          </div>
        </div>
        <div class='col-12 col-md-3 d-flex justify-content-center'>
          <div class='card bg-dark text-white w-100' style='max-width:220px;'>
            <div class='card-body p-2 d-flex flex-column align-items-center'>
              <div class='fw-bold mb-1' style='font-size:0.95em;'>${localization[`Characteristic.OportunityAttack`]}</div>
              <div class='input-group flex-nowrap justify-content-center'>
                <button class='btn btn-outline-danger btn-sm' type='button' id='oport-menos'>-</button>
                <input type='number' class='form-control text-center mx-1' id='oport' value="0" min='0' max='10' style='width:60px; text-align:center; font-size:1em;'>
                <button class='btn btn-outline-success btn-sm' type='button' id='oport-mais'>+</button>
              </div>
            </div>
          </div>
        </div>
        <div class='col-12 col-md-3 d-flex justify-content-center'>
          <div class='card bg-dark text-white w-100' style='max-width:220px;'>
            <div class='card-body p-2 d-flex flex-column align-items-center'>
              <div class='fw-bold mb-1' style='font-size:0.95em;'>${localization[`Characteristic.ExplorationItens`]}</div>
              <div class='input-group flex-nowrap justify-content-center'>
                <button class='btn btn-outline-danger btn-sm' type='button' id='item-menos'>-</button>
                <input type='number' class='form-control text-center mx-1' id='item' value='0' min='0' max='99' style='width:60px; text-align:center; font-size:1em;'>
                <button class='btn btn-outline-success btn-sm' type='button' id='item-mais'>+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="card col-sm-7 mx-auto my-3 p-0">
      <div class="row g-0">
        <div class="col-12 col-md-6 border-end">
          <div class="card-header">Características</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Characteristic.DodgePoints`]}: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.OportunityAttack`]}: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.ExplorationItens`]}: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.DefenseDices`]}: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">Técnica</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Terrain.Dessert`]}: </b>${actor.Tecnique.Desert || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.City`]}: </b>${actor.Tecnique.City || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.Junkyard`]}: </b>${actor.Tecnique.Landfill || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.Mountain`]}: </b>${actor.Tecnique.Mountain || "Não definido"}</li>
          </ul>
        </div>
      </div>
    </div>
      ${
        ataques.length > 0
          ? `
        <h4 class='text-danger'>Ataques Sem Limites:</h4>
        <div class='row g-2 mb-2 justify-content-center'>
          ${ataques.map((a, idx) => {
            // Extrai o título do ataque (primeira linha em <b>...</b>)
            const match = a.match(/<b>(.*?)<\/b>/)
            const title = match ? match[1] : ''
            const resto = a.replace(/<b>.*?<\/b><br>/, '')
            return `
            <div class='col-12 col-md-3'>
              <div class='card border-danger h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-danger mb-1'>${title}</div>
                  <div>${resto}</div>
                </div>
              </div>
            </div>`
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        armas.length > 0
          ? `
        <h4 class='text-light'>Armas:</h4>
        <div class='row g-2 mb-2 justify-content-center'>
          ${armas.map((a, idx) => {
            const match = a.match(/<b>(.*?)<\/b>/)
            const title = match ? match[1] : ''
            const resto = a.replace(/<b>.*?<\/b><br>/, '')
            return `
            <div class='col-12 col-md-3'>
              <div class='card border-light h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-light mb-1'>${title}</div>
                  <div>${resto}</div>
                </div>
              </div>
            </div>`
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        passivas.length > 0
          ? `
        <h4 class='text-success'>Passivas:</h4>
        <div class='row g-2 mb-2 justify-content-center'>
          ${passivas.map((pv) => {
            const match = pv.match(/<b>(.*?)<\/b>/)
            const title = match ? match[1] : ''
            const resto = pv.replace(/<b>.*?<\/b><br>/, '')
            return `
            <div class='col-12 col-md-3'>
              <div class='card border-success h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-success mb-1'>${title}</div>
                  <div>${resto}</div>
                </div>
              </div>
            </div>`
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        dispositivosObjs.length > 0
          ? `
        <h4 class='text-info'>Dispositivos:</h4>
        <div id='devices-list' class='row g-2 mb-2 justify-content-center'>
          ${dispositivosObjs
            .map(
              (d, i) => `
            <div class='col-12 col-md-3'>
              <div class='card border-info h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-info mb-1'>${d.name}</div>
                  <div class='small mb-2'>${d.desc}</div>
                  <button class='btn btn-sm btn-outline-info use-device-btn' data-idx='${i}'>Usar</button>
                </div>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <div class='text-center mb-4'><button id='recover-devices' class='btn btn-sm btn-info'>Recuperar Dispositivos</button></div>
      `
          : ""
      }
      ${
        poderesObjs.length > 0
          ? `
        <h4 class='text-primary'>Poderes:</h4>
        <div id='powers-list' class='row g-2 mb-2 justify-content-center'>
          ${poderesObjs
            .map(
              (p, i) => `
            <div class='col-12 col-md-3'>
              <div class='card border-primary h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-primary mb-1'>${p.name}</div>
                  <div class='small mb-2'>${p.desc}</div>
                  <button class='btn btn-sm btn-outline-primary use-power-btn' data-idx='${i}'>Usar</button>
                </div>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <div class='text-center mb-4'><button id='recover-powers' class='btn btn-sm btn-primary'>Recuperar Poderes</button></div>
      `
          : ""
      }
      ${
        especiaisObjs.length > 0
          ? `
        <h4 class='text-warning'>Habilidades Especiais:</h4>
        <div id='specials-list' class='row g-2 mb-2 justify-content-center'>
          ${especiaisObjs
            .map(
              (e, i) => `
            <div class='col-12 col-md-3'>
              <div class='card border-warning h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-warning mb-1'>${e.name}</div>
                  <div class='small mb-2'>${e.desc}</div>
                  <button class='btn btn-sm btn-outline-warning use-special-btn' data-idx='${i}'>Usar</button>
                </div>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <div class='text-center mb-4'><button id='recover-specials' class='btn btn-sm btn-warning'>Recuperar Habilidades Especiais</button></div>
      `
          : ""
      }
      <!-- Special Customization Block -->
    ${
      actor.SpecialCharacteristics && Array.isArray(actor.SpecialCharacteristics)
        ? actor.SpecialCharacteristics.map((spec, idx) => {
            if (spec.Type === 'textbox') {
              return `<div class='my-4 d-flex flex-column align-items-center justify-content-center'>
    <label class='form-label fw-bold text-center w-100'>${localization[`Character.${spec.Title}`] || spec.Title}</label>
    <textarea rows='8' class='form-control w-75 mb-2' placeholder='Digite sua customização...'></textarea>
  </div>`;
            }
            if (spec.Type === 'counter') {
              return `<div class='my-4 d-inline-block mx-2 align-top'>
    <label class='form-label fw-bold text-center w-100'>${localization[`Character.${spec.Title}`] || spec.Title}</label>
    <div class='d-flex align-items-center justify-content-center' style='width:220px;'>
      <button class='btn btn-outline-secondary btn-sm me-2' type='button' onclick='this.nextElementSibling.stepDown()'>-</button>
      <input type='number' class='form-control text-center mx-1' value='0' min='0' max='999' style='width:80px; font-size:1.2em;'>
      <button class='btn btn-outline-secondary btn-sm ms-2' type='button' onclick='this.previousElementSibling.stepUp()'>+</button>
    </div>
  </div>`;
            }
            if (spec.Type === 'toggle') {
              return `<div class='my-4 d-flex flex-column align-items-center justify-content-center'>
    <div class='form-check form-switch mb-2'>
      <input class='form-check-input' type='checkbox' id='custom-toggle'>
      <label class='form-check-label' for='custom-toggle'>${localization[`Character.${spec.Title}`] || spec.Title}</label>
    </div>
  </div>`;
            }
            return '';
          }).join('')
        : ''
    }
      <div class='mb-4 mt-4 border-top pt-3'>
        <h5 class="text-secondary mb-2 text-center">Modo Reivolk</h5>
        <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h5>
        <div class='text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ""}</div>
      </div>
      <div class='text-center mt-4'><button class='btn btn-secondary' onclick='location.reload()'>Reiniciar</button></div>
    `
    // Controladores de número
    setupIncrementDecrement(ficha, "vida", 0, 999)
    setupIncrementDecrement(ficha, "esquiva", 0, 10)
    setupIncrementDecrement(ficha, "item", 0, 99)
    setupIncrementDecrement(ficha, "oport", 0, 10)
    container.appendChild(ficha)
    // Lógica dos botões Usar/Recuperar
    setupUseRecoverButtons(ficha, ".use-power-btn", "#recover-powers")
    setupUseRecoverButtons(ficha, ".use-special-btn", "#recover-specials")
    setupUseRecoverButtons(ficha, ".use-device-btn", "#recover-devices")
  }
  createBtnRow.appendChild(createBtn)
  container.appendChild(createBtnRow)
}

// Função utilitária para criar controles de incremento/decremento
function setupIncrementDecrement(ficha, id, min, max) {
  ficha.querySelector(`#${id}-menos`).onclick = () => {
    const input = ficha.querySelector(`#${id}`)
    input.value = Math.max(parseInt(input.value) - 1, min)
  }
  ficha.querySelector(`#${id}-mais`).onclick = () => {
    const input = ficha.querySelector(`#${id}`)
    input.value = Math.min(parseInt(input.value) + 1, max)
  }
}

// Função utilitária para criar botões de "Usar" e "Recuperar" para poderes, dispositivos e especiais
function setupUseRecoverButtons(ficha, btnClass, recoverBtnId) {
  ficha.querySelectorAll(btnClass).forEach((btn) => {
    btn.addEventListener("click", function () {
      btn.disabled = true
      btn.textContent = "Usado"
      btn.closest(".card").classList.add("bg-dark", "opacity-75")
    })
  })
  const recoverBtn = ficha.querySelector(recoverBtnId)
  if (recoverBtn) {
    recoverBtn.addEventListener("click", function () {
      ficha.querySelectorAll(btnClass).forEach((btn) => {
        btn.disabled = false
        btn.textContent = "Usar"
        btn.closest(".card").classList.remove("bg-dark", "opacity-75")
      })
    })
  }
}