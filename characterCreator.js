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
      const locKey = `Character.Name.${actor.ID}`
      btn.textContent = localization[locKey] || actor.ID
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
  rowTitle.innerHTML = `<div class="col-12"><h1>${localization[`Character.Name.${actor.ID}`] || actor.ID}</h1></div>`
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
            <li class="list-group-item"><b>Pontos de Esquiva: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>Ataque de Oportunidade: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>Itens de Exploração: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>Dados de Defesa: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">Técnica</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>Deserto: </b>${actor.Tecnique.Desert || "Não definido"}</li>
            <li class="list-group-item"><b>Cidade: </b>${actor.Tecnique.City || "Não definido"}</li>
            <li class="list-group-item"><b>Lixão: </b>${actor.Tecnique.Landfill || "Não definido"}</li>
            <li class="list-group-item"><b>Montanha: </b>${actor.Tecnique.Mountain || "Não definido"}</li>
          </ul>
        </div>
      </div>
      <div class='mb-4 mt-4 border-top pt-3'>
        <h5 class="text-secondary mb-2 text-center">Modo Reivolk</h5>
        <h5 class='text-info mb-1'>${localization[`Character.Reivolk.${actor.ID}`] || ""}</h5>
        <div class='text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ""}</div>
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

  // Cards de Ataques sem Limites
  if (actor.UnlimitedAttacksData && actor.UnlimitedAttacksData.length) {
    const rowAttacks = document.createElement("div")
    rowAttacks.className = "row justify-content-center"
    rowAttacks.innerHTML = `<h3 class='text-danger text-center my-3'>Ataques Sem Limites <span class="fs-6">(Escolha ${actor.NumberOfUnlimitedAttacks})</span></h3>`
    actor.UnlimitedAttacksData.forEach((attackId) => {
      const attack = gameData.AttackDefinitions.find((a) => a.ID === attackId)
      if (!attack) return
      const card = document.createElement("div")
      card.className = "card col-10 col-md-5 m-2"
      const ambients = (attack.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join("/")
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-danger\">${localization[`Attack.${attackId}`] || attackId}</h5>
          <p class=\"card-text\">
            <b>Dano:</b> ${attack.Damage} <br>
            <b>Distância:</b> ${attack.MinimumDistance} - ${attack.MaximumDistance} <br>
            <b>Dados:</b> ${attack.Dices} <br>
            <b>Tempo de Recarga:</b> ${attack.LoadTime || 0} segundos <br>
            <b>Terreno:</b> ${ambients || 'N/A'} <br>
            ${attack.SpecialDescription ? `<i>${localization[`Attack.${attack.SpecialDescription}`] || ""}</i>` : ""}
          </p>
          <button class=\"btn btn-outline-danger select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `
      rowAttacks.appendChild(card)
    })
    container.appendChild(rowAttacks)
    setupLimitedSelection(rowAttacks, actor.NumberOfUnlimitedAttacks || 1, "border-danger")
  }

  // Cards de Passivas
  if (actor.PassivesData && actor.PassivesData.length) {
    const rowPassives = document.createElement("div")
    rowPassives.className = "row justify-content-center"
    rowPassives.innerHTML = `<h3 class='text-success text-center my-3'>Passivas <span class="fs-6">(Escolha ${actor.NumberOfPassives})</span></h3>`
    actor.PassivesData.forEach((passiveId) => {
      const card = document.createElement("div")
      card.className = "card col-10 col-md-5 m-2"
      const passiveDef = (gameData.PassiveDefinitions || []).find((p) => p.ID === passiveId) || {}
      const abbr = getTriggerAbbr(passiveDef.TriggerType)
      const name = `${abbr} ${(localization[`Passive.${passiveId}`] || formatFallback(passiveId)).trim()}`
      const desc = localization[`Passive.${passiveDef.Description}`] || "Sem descrição."
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-success\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-success select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `
      rowPassives.appendChild(card)
    })
    container.appendChild(rowPassives)
    setupLimitedSelection(rowPassives, actor.NumberOfPassives || 1, "border-success")
  }

  // Cards de Dispositivos
  if (actor.DevicesData && actor.DevicesData.length) {
    const rowDevices = document.createElement("div")
    rowDevices.className = "row justify-content-center"
    rowDevices.innerHTML = `<h3 class='text-info text-center my-3'>Dispositivos <span class="fs-6">(Escolha ${actor.NumberOfDevices})</span></h3>`
    actor.DevicesData.forEach((deviceId) => {
      const card = document.createElement("div")
      card.className = "card col-10 col-md-5 m-2"
      const deviceDef = (gameData.ConsumableDefinitions || []).find((d) => d.ID === deviceId) || {}
      const abbr = getTriggerAbbr(deviceDef.TriggerType)
      const name = `${abbr} ${(localization[`Consumable.${deviceId}`] || formatFallback(deviceId)).trim()}`
      const desc = localization[`Consumable.${deviceDef.Description}`] || ""
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-info\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-info select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `
      rowDevices.appendChild(card)
    })
    container.appendChild(rowDevices)
    setupLimitedSelection(rowDevices, actor.NumberOfDevices || 1, "border-info")
  }

  // Cards de Poderes
  if (actor.PowersData && actor.PowersData.length) {
    const rowPowers = document.createElement("div")
    rowPowers.className = "row justify-content-center"
    rowPowers.innerHTML = `<h3 class='text-primary text-center my-3'>Poderes <span class="fs-6">(Escolha ${actor.NumberOfPowers})</span></h3>`
    actor.PowersData.forEach((powerId) => {
      const card = document.createElement("div")
      card.className = "card col-10 col-md-5 m-2"
      const powerDef = (gameData.ConsumableDefinitions || []).find((p) => p.ID === powerId) || {}
      const abbr = getTriggerAbbr(powerDef.TriggerType)
      const name = `${abbr} ${(localization[`Consumable.${powerId}`] || formatFallback(powerId)).trim()}`
      const desc = localization[`Consumable.${powerDef.Description}`] || ""
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-primary\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-primary select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `
      rowPowers.appendChild(card)
    })
    container.appendChild(rowPowers)
    setupLimitedSelection(rowPowers, actor.NumberOfPowers || 1, "border-primary")
  }

  // Cards de Habilidades Especiais
  if (actor.SpecialAbilitiesData && actor.SpecialAbilitiesData.length) {
    const rowSpecials = document.createElement("div")
    rowSpecials.className = "row justify-content-center"
    rowSpecials.innerHTML = `<h3 class='text-warning text-center my-3'>Habilidades Especiais <span class=\"fs-6\">(Escolha ${actor.NumberOfSpecialAbilities})</span></h3>`
    actor.SpecialAbilitiesData.forEach((specialId) => {
      const card = document.createElement("div")
      card.className = "card col-10 col-md-5 m-2"
      const specialDef = (gameData.SpecialAbilityDefinitions || []).find((s) => s.ID === specialId) || {}
      const abbr = getTriggerAbbr(specialDef.TriggerType)
      const name = `${abbr} ${(localization[`Special.${specialId}`] || formatFallback(specialId)).trim()}`
      const desc = localization[`Special.${specialDef.Description}`] || "Sem descrição."
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-warning\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-warning select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `
      rowSpecials.appendChild(card)
    })
    container.appendChild(rowSpecials)
    setupLimitedSelection(rowSpecials, actor.NumberOfSpecialAbilities || 1, "border-warning")
  }

  // Adiciona botão de criar personagem ao final
  const createBtnRow = document.createElement("div")
  createBtnRow.className = "row justify-content-center my-4"
  const createBtn = document.createElement("button")
  createBtn.className = "btn btn-lg btn-success"
  createBtn.textContent = "Criar Personagem"
  createBtn.disabled = true
  createBtnRow.appendChild(createBtn)
  container.appendChild(createBtnRow)

  // Função para checar se todos os limites foram atingidos
  function checkSelections() {
    let ok = true
    if (actor.UnlimitedAttacksData && actor.NumberOfUnlimitedAttacks)
      ok = ok && container.querySelectorAll(".btn-outline-danger.select-btn.active").length === actor.NumberOfUnlimitedAttacks
    if (actor.PowersData && actor.NumberOfPowers)
      ok = ok && container.querySelectorAll(".btn-outline-primary.select-btn.active").length === actor.NumberOfPowers
    if (actor.PassivesData && actor.NumberOfPassives)
      ok = ok && container.querySelectorAll(".btn-outline-success.select-btn.active").length === actor.NumberOfPassives
    if (actor.SpecialAbilitiesData && actor.NumberOfSpecialAbilities)
      ok = ok && container.querySelectorAll(".btn-outline-warning.select-btn.active").length === actor.NumberOfSpecialAbilities
    if (actor.DevicesData && actor.NumberOfDevices)
      ok = ok && container.querySelectorAll(".btn-outline-info.select-btn.active").length === actor.NumberOfDevices
    createBtn.disabled = !ok
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
      const ambients = (attack.Ambient || []).map(a => localization[`Ambient.${a}`] || a).join("/")
      return `<b>${localization[`Attack.${attack.ID}`] || attack.ID}</b><br>
        Dano: ${attack.Damage}<br>
        Distância: ${attack.MinimumDistance} - ${attack.MaximumDistance}<br>
        Dados: ${attack.Dices}<br>
        Tempo de Recarga: ${attack.LoadTime || 0} segundos<br>
        Terreno: ${ambients || 'N/A'}<br>
        ${attack.SpecialDescription ? `<i>${localization[`Attack.${attack.SpecialDescription}`] || ""}</i><br>` : ""}`
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
    // Mostra ficha final
    const ficha = document.createElement("div")
    ficha.className = "card col-10 col-md-10 mx-auto my-5 p-4"
    ficha.innerHTML = `
      <h2 class='text-center mb-4'>Ficha do Personagem</h2>
      <h3 class='text-center mb-3'>${localization[`Character.Name.${actor.ID}`] || actor.ID}</h3>
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
              <div class='fw-bold mb-1' style='font-size:0.95em;'>Pulo/Esquiva Usados</div>
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
              <div class='fw-bold mb-1' style='font-size:0.95em;'>Itens de Exploração</div>
              <div class='input-group flex-nowrap justify-content-center'>
                <button class='btn btn-outline-danger btn-sm' type='button' id='item-menos'>-</button>
                <input type='number' class='form-control text-center mx-1' id='item' value='0' min='0' max='99' style='width:60px; text-align:center; font-size:1em;'>
                <button class='btn btn-outline-success btn-sm' type='button' id='item-mais'>+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="card col-sm-10 my-3 p-0">
      <div class="row g-0">
        <div class="col-12 col-md-6 border-end">
          <div class="card-header">Características</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>Pontos de Esquiva: </b>${actor.DodgePoints}</li>
            <li class="list-group-item"><b>Ataque de Oportunidade: </b>${actor.OportunityAttacks}</li>
            <li class="list-group-item"><b>Itens de Exploração: </b>${actor.ExplorationItens}</li>
            <li class="list-group-item"><b>Dados de Defesa: </b>${actor.NumberOfDefenseDices}</li>
          </ul>
        </div>
        <div class="col-12 col-md-6">
          <div class="card-header">Técnica</div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item"><b>Deserto: </b>${actor.Tecnique.Desert || "Não definido"}</li>
            <li class="list-group-item"><b>Cidade: </b>${actor.Tecnique.City || "Não definido"}</li>
            <li class="list-group-item"><b>Lixão: </b>${actor.Tecnique.Landfill || "Não definido"}</li>
            <li class="list-group-item"><b>Montanha: </b>${actor.Tecnique.Mountain || "Não definido"}</li>
          </ul>
        </div>
      </div>
      <div class='mb-4 mt-4 border-top pt-3'>
        <h5 class="text-secondary mb-2 text-center">Modo Reivolk</h5>
        <h5 class='text-info mb-1'>${localization[`Character.Reivolk.${actor.ID}`] || ""}</h5>
        <div class='text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ""}</div>
      </div>
    </div>
      ${
        ataques.length > 0
          ? `
        <h4 class='text-danger'>Ataques Sem Limites:</h4>
        <div class='row g-2 mb-2'>
          ${ataques.map((a, idx) => {
            // Extrai o título do ataque (primeira linha em <b>...</b>)
            const match = a.match(/<b>(.*?)<\/b>/)
            const title = match ? match[1] : ''
            const resto = a.replace(/<b>.*?<\/b><br>/, '')
            return `
            <div class='col-12 col-md-6'>
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
        poderesObjs.length > 0
          ? `
        <h4 class='text-primary'>Poderes:</h4>
        <div id='powers-list' class='row g-2 mb-2'>
          ${poderesObjs
            .map(
              (p, i) => `
            <div class='col-12 col-md-6'>
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
        passivas.length > 0
          ? `
        <h4 class='text-success'>Passivas:</h4>
        <div class='row g-2 mb-2'>
          ${passivas.map((pv) => {
            const match = pv.match(/<b>(.*?)<\/b>/)
            const title = match ? match[1] : ''
            const resto = pv.replace(/<b>.*?<\/b><br>/, '')
            return `
            <div class='col-12 col-md-6'>
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
        especiaisObjs.length > 0
          ? `
        <h4 class='text-warning'>Habilidades Especiais:</h4>
        <div id='specials-list' class='row g-2 mb-2'>
          ${especiaisObjs
            .map(
              (e, i) => `
            <div class='col-12 col-md-6'>
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
      ${
        dispositivosObjs.length > 0
          ? `
        <h4 class='text-info'>Dispositivos:</h4>
        <div id='devices-list' class='row g-2 mb-2'>
          ${dispositivosObjs
            .map(
              (d, i) => `
            <div class='col-12 col-md-6'>
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
      <div class='mb-4 mt-4 border-top pt-3'>
        <h5 class="text-secondary mb-2 text-center">Modo Reivolk</h5>
        <h5 class='text-info mb-1'>${localization[`Character.Reivolk.${actor.ID}`] || ""}</h5>
        <div class='text-light text-center"'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ""}</div>
      </div>
      <div class='text-center mt-4'><button class='btn btn-secondary' onclick='location.reload()'>Reiniciar</button></div>
    `
    // Controladores de número
    ficha.querySelector("#vida-menos").onclick = () => {
      const input = ficha.querySelector("#vida")
      input.value = Math.max(parseInt(input.value) - 1, parseInt(input.min))
    }
    ficha.querySelector("#vida-mais").onclick = () => {
      const input = ficha.querySelector("#vida")
      input.value = Math.min(parseInt(input.value) + 1, parseInt(input.max))
    }
    ficha.querySelector("#esquiva-menos").onclick = () => {
      const input = ficha.querySelector("#esquiva")
      input.value = Math.max(parseInt(input.value) - 1, parseInt(input.min))
    }
    ficha.querySelector("#esquiva-mais").onclick = () => {
      const input = ficha.querySelector("#esquiva")
      input.value = Math.min(parseInt(input.value) + 1, parseInt(input.max))
    }
    ficha.querySelector("#item-menos").onclick = () => {
      const input = ficha.querySelector("#item")
      input.value = Math.max(parseInt(input.value) - 1, parseInt(input.min))
    }
    ficha.querySelector("#item-mais").onclick = () => {
      const input = ficha.querySelector("#item")
      input.value = Math.min(parseInt(input.value) + 1, parseInt(input.max))
    }
    container.appendChild(ficha)
    // Lógica dos botões Usar/Recuperar
    ficha.querySelectorAll(".use-power-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        btn.disabled = true
        btn.textContent = "Usado"
        btn.closest(".card").classList.add("bg-dark", "opacity-75")
      })
    })
    const recoverPowersBtn = ficha.querySelector("#recover-powers")
    if (recoverPowersBtn) {
      recoverPowersBtn.addEventListener("click", function () {
        ficha.querySelectorAll(".use-power-btn").forEach((btn) => {
          btn.disabled = false
          btn.textContent = "Usar"
          btn.closest(".card").classList.remove("bg-dark", "opacity-75")
        })
      })
    }
    ficha.querySelectorAll(".use-special-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        btn.disabled = true
        btn.textContent = "Usado"
        btn.closest(".card").classList.add("bg-dark", "opacity-75")
      })
    })
    const recoverSpecialsBtn = ficha.querySelector("#recover-specials")
    if (recoverSpecialsBtn) {
      recoverSpecialsBtn.addEventListener("click", function () {
        ficha.querySelectorAll(".use-special-btn").forEach((btn) => {
          btn.disabled = false
          btn.textContent = "Usar"
          btn.closest(".card").classList.remove("bg-dark", "opacity-75")
        })
      })
    }
    ficha.querySelectorAll(".use-device-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        btn.disabled = true
        btn.textContent = "Usado"
        btn.closest(".card").classList.add("bg-dark", "opacity-75")
      })
    })
    const recoverDevicesBtn = ficha.querySelector("#recover-devices")
    if (recoverDevicesBtn) {
      recoverDevicesBtn.addEventListener("click", function () {
        ficha.querySelectorAll(".use-device-btn").forEach((btn) => {
          btn.disabled = false
          btn.textContent = "Usar"
          btn.closest(".card").classList.remove("bg-dark", "opacity-75")
        })
      })
    }
  }
  createBtnRow.appendChild(createBtn)
  container.appendChild(createBtnRow)
}
