Promise.all([fetch("GameEconomyData.json").then((r) => r.json()), fetch("LocalizationPortuguese.json").then((r) => r.json())]).then(
  ([gameData, localization]) => {
    const characterSelection = document.getElementById("characterSelection")
    if (!characterSelection) return
    characterSelection.innerHTML = ""
    // Remover flex-column e alinhar com flex-row em telas grandes
    characterSelection.classList.remove("flex-column")
    characterSelection.classList.add("d-flex", "flex-wrap", "justify-content-center")

    /*
    gameData.ActorDefinitions.sort((a, b) => {
      const nameA = localization[`Character.Name.${a.ID}`] || a.ID
      const nameB = localization[`Character.Name.${b.ID}`] || b.ID
      return nameA.localeCompare(nameB)
    })*/

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
          <div class="card-header">${localization[`Characteristic.Title`]}</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Characteristic.DodgePoints`]}: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.OportunityAttack`]}: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.ExplorationItens`]}: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.DefenseDices`]}: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">${localization[`Characteristic.Tecnique`]}</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Terrain.Dessert`]}: </b>${actor.Tecnique.Desert || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.City`]}: </b>${actor.Tecnique.City || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.Junkyard`]}: </b>${actor.Tecnique.Landfill || "Não definido"}</li>
            <li class="list-group-item"><b>${localization[`Terrain.Mountain`]}: </b>${actor.Tecnique.Mountain || "Não definido"}</li>
          </ul>
        </div>
      </div>
      <div class='mb-4 border-top px-3'>
        <h5 class="text-secondary mb-2 text-center">${localization[`Characteristic.Reivolk.Title`] || ''}</h5>
        <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h5>
        <div class='col-12 text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ''}</div>
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
      btn.textContent = localization[`Characteristic.Select`]
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
          btn.textContent = localization[`Characteristic.Selected`]
        } else {
          card.classList.remove("border-3", borderColor, "shadow")
          card.classList.add("border-secondary")
          card.style.background = ""
          card.style.color = ""
          btn.textContent = localization[`Characteristic.Select`]
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

  // Função genérica para criar cards de seleção
  function createSelectionCards({
    dataArray, // Array de IDs
    numberToSelect, // Quantos podem ser selecionados
    defArray, // Array de definições (ex: gameData.AttackDefinitions)
    defType,
    color, // 'danger', 'success', 'info', 'primary', 'warning'
    title, // Título da seção
    getName, // Função para obter nome
    getDesc, // Função para obter descrição
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
      // Corrige chamada das funções getName e getDesc
      const name = typeof getName === 'function' ? getName(id, def) : id
      const desc = typeof getDesc === 'function' ? getDesc(def) : ""
      // Determina o tipo para o data-type
      let dataType = '';
      switch (defType) {
        case 'Attack': dataType = 'ataque'; break;
        case 'Weapon': dataType = 'arma'; break;
        case 'Power': dataType = 'poder'; break;
        case 'Device': dataType = 'dispositivo'; break;
        case 'Passive': dataType = 'passiva'; break;
        case 'Special': dataType = 'especial'; break;
        case 'PassiveSpecial': dataType = 'especialPassiva'; break;
        default: dataType = defType.toLowerCase(); break;
      }
      card.innerHTML = `
        <div class="card-body">
        <h5 class="card-title text-${color}">${name}</h5>
        <p class="card-text">${desc}</p>
        <button class="btn btn-outline-${color} select-btn w-100 mt-2" data-type="${dataType}">${localization[`Characteristic.Select`]}</button>
        </div>`
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
    title: `${localization[`Characteristic.Attack.Title`]}`,
    getName: (id) => `${localization[`${id}`] || id}`,
    getDesc: (def) => `
    <b>${localization[`AttackBase.Damage`]}:</b> ${def.Damage}
    <br><b>${localization[`AttackBase.Distance`]}:</b> ${def.MinimumDistance == def.MaximumDistance ? def.MinimumDistance : `${def.MinimumDistance} - ${def.MaximumDistance}`}<br>
    <b>${localization[`AttackBase.Dices`]}:</b> ${def.Dices}
    <br><b>${localization[`AttackBase.LoadTime`]}:</b> ${def.LoadTime || 0}
    <br><b>${localization[`AttackBase.Terrain`]}:</b> ${(def.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'}
    ${def.SpecialDescription ? `<br>${localization[`${def.SpecialDescription}`] || ""}` : ""}`,
    getAbbr: null,
    borderColor: 'border-danger',
  })

  // Cards de Armas
  createSelectionCards({
    dataArray: actor.WeaponsData,
    numberToSelect: actor.NumberOfWeapons,
    defArray: gameData.AttackDefinitions,
    defType: 'Weapon',
    color: 'danger',
    title: `${localization[`Characteristic.Weapon.Title`]}`,
    getName: (id) => `${localization[`${id}`] || id}`,
    getDesc: (def) => `
    <b>${localization[`AttackBase.Damage`]}:</b>
    ${def.Damage}<br><b>${localization[`AttackBase.Distance`]}:</b> ${def.MinimumDistance == def.MaximumDistance ? def.MinimumDistance : `${def.MinimumDistance} - ${def.MaximumDistance}`}<br>
    <b>${localization[`AttackBase.Dices`]}:</b> ${def.Dices}<br>
    <b>${localization[`AttackBase.LoadTime`]}:</b> ${def.LoadTime || 0}<br>
    <b>${localization[`AttackBase.Terrain`]}:</b> ${(def.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'}<br>
    ${def.SpecialDescription ? `${localization[`${def.SpecialDescription}`] || ""}` : ""}`,
    getAbbr: null,
    borderColor: 'border-danger',
  })

  // Cards de Passivas
  createSelectionCards({
    dataArray: actor.PassivesData,
    numberToSelect: actor.NumberOfPassives,
    defArray: gameData.PassiveDefinitions,
    defType: 'Passive',
    color: 'success',
    title: `${localization[`Characteristic.Passive.Title`]}`,
    getName: (id) => `${localization[`${id}`] || formatFallback(id)}`,
    getDesc: (def) => localization[`${def.Description}`] || "Sem descrição.",
    borderColor: 'border-success'
  })

  // Cards de Dispositivos
  createSelectionCards({
    dataArray: actor.DevicesData,
    numberToSelect: actor.NumberOfDevices,
    defArray: gameData.ConsumableDefinitions,
    defType: 'Device',
    color: 'info',
    title: `${localization[`Characteristic.Device.Title`]}`,
    getName: (id, def) => `${(def.TriggerType || []).map(a => localization[`AttackBase.TriggerType.${a}`] || a).join(" / ") || 'N/A'} ${(localization[`${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`${def.Description}`] || "",
    borderColor: 'border-info'
  })

  // Cards de Poderes
  createSelectionCards({
    dataArray: actor.PowersData,
    numberToSelect: actor.NumberOfPowers,
    defArray: gameData.ConsumableDefinitions,
    defType: 'Power',
    color: 'primary',
    title: `${localization[`Characteristic.Power.Title`]}`,
    getName: (id, def) => `${(def.TriggerType || []).map(a => localization[`AttackBase.TriggerType.${a}`] || a).join(" / ") || 'N/A'} ${(localization[`${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`${def.Description}`] || "",
    borderColor: 'border-primary'
  })

  // Cards de Habilidades Especiais
  createSelectionCards({
    dataArray: actor.SpecialAbilitiesData,
    numberToSelect: actor.NumberOfSpecialAbilities,
    defArray: gameData.ConsumableDefinitions,
    defType: 'Special',
    color: 'warning',
    title: `${localization[`Characteristic.SpecialAbility.Title`]}`,
    getName: (id, def) => `${(def.TriggerType || []).map(a => localization[`AttackBase.TriggerType.${a}`] || a).join(" / ") || 'N/A'} ${(localization[`${id}`] || formatFallback(id)).trim()}`,
    getDesc: (def) => localization[`${def.Description}`] || "",
    borderColor: 'border-warning'
  })

  // Cards de Habilidades Especiais Nativas
  createSelectionCards({
    dataArray: actor.PassiveSpecialAbilitiesData,
    numberToSelect: actor.NumberOfPassiveSpecialAbilities,
    defArray: gameData.PassiveDefinitions,
    defType: 'PassiveSpecial',
    color: 'warning', // mesma cor das habilidades especiais
    title: `${localization[`Characteristic.PassiveSpecialAbility.Title`]}`,
    getName: (id) => `${localization[`${id}`] || formatFallback(id)}`,
    getDesc: (def) => localization[`${def.Description}`] || "Sem descrição.",
    borderColor: 'border-warning'
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
      { data: actor.UnlimitedAttacksData, num: actor.NumberOfUnlimitedAttacks, type: 'ataque' },
      { data: actor.WeaponsData, num: actor.NumberOfWeapons, type: 'arma' },
      { data: actor.PowersData, num: actor.NumberOfPowers, type: 'poder' },
      { data: actor.PassivesData, num: actor.NumberOfPassives, type: 'passiva' },
      { data: actor.PassiveSpecialAbilitiesData, num: actor.NumberOfPassiveSpecialAbilities, type: 'especialPassiva' },
      { data: actor.SpecialAbilitiesData, num: actor.NumberOfSpecialAbilities, type: 'especial' },
      { data: actor.DevicesData, num: actor.NumberOfDevices, type: 'dispositivo' },
    ]
    return checks.every(({ data, num, type }) => {
      if (data && num) {
        return container.querySelectorAll(`.select-btn.active[data-type="${type}"]`).length === num
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

  // Corrige: garantir que o botão de criar personagem funcione mesmo após re-renderizações
  createBtn.onclick = function () {
    // Seleciona apenas os botões ativos dentro do container atual
    const selecionados = Array.from(container.querySelectorAll(".select-btn.active"));
    // Coleta escolhas detalhadas
    function getSelectedID({ card, type, dataArray }) {
      const title = card.querySelector(".card-title").textContent.trim()
      let locName
      const attack = dataArray.find((a) => {
        if (type == "Consumable" ) {
          locName = `${(a.TriggerType || []).map(item => localization[`AttackBase.TriggerType.${item}`] || item).join(" / ")} ${localization[a.ID]}`
        } else {locName = localization[a.ID]}
        return title === locName
      })
      console.log(title)
      if (!attack) return ""
      return attack
    }
    // Seleções detalhadas
    const ataques = selecionados.filter(btn => btn.dataset.type === "ataque").map(btn => getSelectedID({card: btn.closest(".card"), type: "Attack", dataArray: gameData.AttackDefinitions}))
    const armas = selecionados.filter(btn => btn.dataset.type === "arma").map(btn => getSelectedID({card: btn.closest(".card"), type: "Attack", dataArray: gameData.AttackDefinitions}))
    const passivas = selecionados.filter(btn => btn.dataset.type === "passiva").map(btn => getSelectedID({card: btn.closest(".card"), type: "Passive", dataArray: gameData.PassiveDefinitions}))
    const poderesObjs = selecionados.filter(btn => btn.dataset.type === "poder").map(btn => getSelectedID({card: btn.closest(".card"), type: "Consumable", dataArray: gameData.ConsumableDefinitions}))
    const dispositivosObjs = selecionados.filter(btn => btn.dataset.type === "dispositivo").map(btn => getSelectedID({card: btn.closest(".card"), type: "Consumable", dataArray: gameData.ConsumableDefinitions}))
    const especiaisObjs = selecionados.filter(btn => btn.dataset.type === "especial").map(btn => getSelectedID({card: btn.closest(".card"), type: "Consumable", dataArray: gameData.ConsumableDefinitions}))
    const especiaisNativasObjs = selecionados.filter(btn => btn.dataset.type === "especialPassiva").map(btn => getSelectedID({card: btn.closest(".card"), type: "Passive", dataArray: gameData.PassiveDefinitions}))

    console.log("Ataques:", poderesObjs)
    // Limpa container
    container.innerHTML = ""
    // Rola para o topo da página ao criar personagem
    window.scrollTo(0, 0)
    // Mostra ficha final
    const ficha = document.createElement("div")
    ficha.className = "card col-12 col-md-12 mx-auto my-5 p-4"

    // Lista de contadores automatizados
    const contadores = [
      criarContador({ id: "vida", valorInicial: 20, min: 0, max: 999, titulo: localization[`Characteristic.Health`] }),
      criarContador({ id: "esquiva", valorInicial: 0, min: 0, max: 10, titulo: localization[`Characteristic.DodgePoints`] }),
      criarContador({ id: "oport", valorInicial: 0, min: 0, max: 10, titulo: localization[`Characteristic.OportunityAttack`] }),
      criarContador({ id: "item", valorInicial: 0, min: 0, max: 99, titulo: localization[`Characteristic.ExplorationItens`] })
    ]

  function createShownCard({
    id,
    defType,
    title,
    desc,
    color, // 'danger', 'success', 'info', 'primary', 'warning'
    borderColor, // Cor da borda
    addButton = false, // Se deve aplicar seleção limitada
    textButton = "Usar"
  }) {
    return `
            <div class='col-12 col-md-3'>
              <div class='card ${borderColor} h-100' style='background: var(--bs-gray-800, #212529); color: #fff;'>
                <div class='card-body p-2'>
                  <div class='fw-bold text-${color} mb-1'>${title}</div>
                  <div class='small mb-2'>${desc}</div>
                  ${addButton ? `<button class='btn btn-sm btn-outline-${color} use-${defType}-btn''>${textButton}</button>` : ''}
                </div>
              </div>
            </div>`
  }
    ficha.innerHTML = `
      <h2 class='text-center mb-4'>Ficha do Personagem</h2>
      <h3 class='text-center mb-3'>${`${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})` || actor.ID}</h3>
      <div class='mb-3 row justify-content-center text-center'>
        ${contadores.map(c => c.html).join('')}
      </div>
      <div class="card col-sm-7 mx-auto my-3 p-0">
      <div class="row g-0">
        <div class="col-12 col-md-6 border-end">
          <div class="card-header">${localization[`Characteristic.Title`]}</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>${localization[`Characteristic.DodgePoints`]}: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.OportunityAttack`]}: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.ExplorationItens`]}: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>${localization[`Characteristic.DefenseDices`]}: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">${localization[`Characteristic.Tecnique`]}</div>
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
        <h4 class='text-danger'>${localization[`Characteristic.Attack.Title`]}:</h4>
        <div class='row g-2 mb-2 justify-content-center'>
          ${ataques.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'attack',
              title: localization[content.ID],
              desc: `
              <b>${localization[`AttackBase.Damage`]}:</b> ${content.Damage}
              <br><b>${localization[`AttackBase.Distance`]}:</b> ${content.MinimumDistance == content.MaximumDistance ? content.MinimumDistance : `${content.MinimumDistance} - ${content.MaximumDistance}`}<br>
              <b>${localization[`AttackBase.Dices`]}:</b> ${content.Dices}
              <br><b>${localization[`AttackBase.LoadTime`]}:</b> ${content.LoadTime || 0}
              <br><b>${localization[`AttackBase.Terrain`]}:</b> ${(content.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'}
              ${content.SpecialDescription ? `<br>${localization[`${content.SpecialDescription}`] || ""}` : ""}`,
              color: 'danger',
              borderColor: 'border-danger'
            })
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        armas.length > 0
          ? `
        <h4 class='text-danger'>${localization[`Characteristic.Weapon.Title`]}:</h4>
        <div class='row g-2 mb-2 justify-content-center'>
          ${armas.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'weapon',
              title: localization[content.ID],
              desc: `
              <b>${localization[`AttackBase.Damage`]}:</b> ${content.Damage}
              <br><b>${localization[`AttackBase.Distance`]}:</b> ${content.MinimumDistance == content.MaximumDistance ? content.MinimumDistance : `${content.MinimumDistance} - ${content.MaximumDistance}`}<br>
              <b>${localization[`AttackBase.Dices`]}:</b> ${content.Dices}
              <br><b>${localization[`AttackBase.LoadTime`]}:</b> ${content.LoadTime || 0}
              <br><b>${localization[`AttackBase.Terrain`]}:</b> ${(content.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join(" / ") || 'N/A'}
              ${content.SpecialDescription ? `<br>${localization[`${content.SpecialDescription}`] || ""}` : ""}`,
              color: 'danger',
              borderColor: 'border-danger'
            })
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        passivas.length > 0
          ? `
        <h4 class='text-success'>${localization[`Characteristic.Passive.Title`]}:</h4>
        <div class='row g-2 mb-2 justify-content-center'>
          ${passivas.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'passive',
              title: localization[content.ID],
              desc: `${localization[`${content.Description}`] || ""}`,
              color: 'success',
              borderColor: 'border-success'
            })
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        dispositivosObjs.length > 0
          ? `
        <h4 class='text-info'>${localization[`Characteristic.Device.Title`]}:</h4>
        <div id='devices-list' class='row g-2 mb-2 justify-content-center'>
          ${dispositivosObjs.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'device',
              title: localization[content.ID],
              desc: `${localization[`${content.Description}`] || ""}`,
              color: 'info',
              borderColor: 'border-info',
              addButton: true,
              textButton: localization[`Characteristic.Use`]
            })
          }).join("")}
        </div>
        <div class='text-center mb-4'><button id='recover-devices' class='btn btn-sm btn-info'>${localization[`Characteristic.RecoverDevices`]}</button></div>
      `
          : ""
      }
      ${
        poderesObjs.length > 0
          ? `
        <h4 class='text-primary'>${localization[`Characteristic.Power.Title`]}:</h4>
        <div id='powers-list' class='row g-2 mb-2 justify-content-center'>
          ${poderesObjs.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'power',
              title: localization[content.ID],
              desc: `${localization[`${content.Description}`] || ""}`,
              color: 'primary',
              borderColor: 'border-primary',
              addButton: true,
              textButton: localization[`Characteristic.Use`]

            })
          }).join("")}
        </div>
        <div class='text-center mb-4'><button id='recover-powers' class='btn btn-sm btn-primary'>${localization[`Characteristic.RecoverPowers`]}</button></div>
      `
          : ""
      }
      ${
        especiaisObjs.length > 0
          ? `
        <h4 class='text-warning'>${localization[`Characteristic.SpecialAbility.Title`]}</h4>
        <div id='specials-list' class='row g-2 mb-2 justify-content-center'>
          ${especiaisObjs.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'special',
              title: localization[content.ID],
              desc: `${localization[`${content.Description}`] || ""}`,
              color: 'warning',
              borderColor: 'border-warning',
              addButton: true,
              textButton: localization[`Characteristic.Use`]
            })
          }).join("")}
        </div>
        <div class='text-center mb-4'><button id='recover-specials' class='btn btn-sm btn-warning'>${localization[`Characteristic.RecoverSpecials`]}</button></div>
      `
          : ""
      }
      ${
        especiaisNativasObjs.length > 0
          ? `
        <h4 class='text-warning'>${localization[`Characteristic.PassiveSpecialAbility.Title`]}:</h4>
        <div id='specials-native-list' class='row g-2 mb-2 justify-content-center'>
          ${especiaisNativasObjs.map((content) => {
            return createShownCard({
              id: content.ID,
              defType: 'specialPassive',
              title: localization[content.ID],
              desc: `${localization[`${content.Description}`] || ""}`,
              color: 'warning',
              borderColor: 'border-warning'
            })
          }).join("")}
        </div>
      `
          : ""
      }
      ${
        actor.SpecialCharacteristics && Array.isArray(actor.SpecialCharacteristics)
          ? `<div class='row g-2 mb-2 gap-3 d-flex flex-wrap justify-content-center'>
            ${actor.SpecialCharacteristics.map((id, idx) => {
              console.log(id)
              console.log(gameData.SpecialDefinitions)
              const spec = gameData.SpecialDefinitions.find((s) => s.ID === id) // Garante que o ID exista
              console.log(spec)
                if (spec.Type === 'textbox') {
                  return `
                  <div class='col-12 col-md-5 mb-3 mb-md-0 d-flex justify-content-center'>
                    <div class='card bg-dark text-white w-100'>
                      <div class='card-body p-2 d-flex flex-column align-items-center'>
                        <div class='fw-bold mb-1'>${localization[`${spec.Title}`] || spec.Title}</div>
                        <div class='input-group flex-nowrap justify-content-center'>
                          <textarea rows='4' class='form-control w-75 mb-2 rounded shadow-sm' id='special-textbox-${idx}' placeholder='${spec.Placeholder || 'Digite aqui...'}'></textarea>
                        </div>
                      </div>
                    </div>
                  </div>
      `;
                }
                if (spec.Type === 'counter') {
                  const cont = criarContador({
                    id: `special-counter-${idx}`,
                    valorInicial: spec.InitialValue || 0,
                    min: spec.Min || 0,
                    max: spec.Max || 99,
                    titulo: localization[`${spec.Title}`] || spec.Title
                  });
                  if (!window._specialCounters) window._specialCounters = [];
                  window._specialCounters.push({ id: `special-counter-${idx}`, min: spec.Min || 0, max: spec.Max || 99 });
                  return cont.html;
                }
                /*if (spec.Type === 'toggle') {
                  return `<div class='my-4 d-flex flex-column align-items-center justify-content-center'>
                    <div class='form-check form-switch mb-2'>
                      <input class='form-check-input' type='checkbox' id='special-toggle-${idx}'>
                      <label class='form-check-label' for='special-toggle-${idx}'>${localization[`${spec.Title}`] || spec.Title}</label>
                    </div>
                  </div>`;
                }*/
                return '';
              }).join('')}
            </div>`
          : ''
      }
      <div class='mb-4 mt-4 border-top pt-3'>
        <h5 class="text-secondary mb-2 text-center">${localization[`Characteristic.Reivolk.Title`] || ''}</h5>
        <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h5>
        <div class='text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ""}</div>
      </div>
      <div class='text-center mt-4'><button class='btn btn-secondary' onclick='location.reload()'>Reiniciar</button></div>
    `
    // Automatiza todos os controladores
    contadores.forEach(c => setupIncrementDecrement(ficha, c.id, c.min, c.max))
    // Automatiza contadores especiais (SpecialCharacteristics)
    if (window._specialCounters) {
      window._specialCounters.forEach(c => setupIncrementDecrement(ficha, c.id, c.min, c.max));
      window._specialCounters = undefined;
    }
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

// Função que retorna o HTML de um contador customizável e funcional
// Agora retorna um objeto com html e dados do contador
function criarContador({ id, valorInicial = 20, min = 0, max = 999, titulo = 'Básico' }) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = `
    <div class='col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center'>
        <div class='card-body p-2 d-flex flex-column align-items-center'>
          <div class='fw-bold mb-1' style='font-size:0.95em;'>${titulo}</div>
          <div class='input-group flex-nowrap justify-content-center'>
            <button class='btn btn-outline-danger btn-sm' type='button' id='${id}-menos'>-</button>
            <input type='number' class='form-control text-center mx-1' id='${id}' value='${valorInicial}' min='${min}' max='${max}' style='width:60px; text-align:center; font-size:1em;'>
            <button class='btn btn-outline-success btn-sm' type='button' id='${id}-mais'>+</button>
          </div>
        </div>
      </div>
    </div>
  `
  return { html: tempDiv.innerHTML, id, min, max}
}