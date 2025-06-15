Promise.all([
  fetch('GameEconomyData.json').then(r => r.json()),
  fetch('LocalizationPortuguese.json').then(r => r.json())
]).then(([gameData, localization]) => {
  const characterSelection = document.getElementById('characterSelection');
  if (!characterSelection) return;
  characterSelection.innerHTML = '';
  characterSelection.classList.add('d-flex', 'flex-column', 'align-items-center');

  gameData.ActorDefinitions.forEach(actor => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = actor.ID;
    btn.className = 'btn btn-outline-light text-center col-6 col-sm-4 col-md-3 col-lg-2 my-2';
    const locKey = `Character.Name.${actor.ID}`;
    btn.textContent = localization[locKey] || actor.ID;
    btn.addEventListener('click', () => renderCharacter(actor, gameData, localization));
    characterSelection.appendChild(btn);
  });
});

function renderCharacter(actor, gameData, localization) {
  const container = document.getElementById('characterContainer') || document.body;
  container.innerHTML = '';

  // Título
  const rowTitle = document.createElement('div');
  rowTitle.className = 'row justify-content-center text-center';
  rowTitle.innerHTML = `<div class="col-12"><h1>${localization[`Character.Name.${actor.ID}`] || actor.ID}</h1></div>`;
  container.appendChild(rowTitle);

  // Card principal
  const rowCard = document.createElement('div');
  rowCard.className = 'row justify-content-center';
  rowCard.innerHTML = `
    <div class="card col-sm-10 my-3">
      <div class="row">
        <ul class="list-group list-group-flush col-12 col-md-5">
          <li class="list-group-item"><b>Pontos de Esquiva: </b>10</li>
          <li class="list-group-item"><b>Ataque de Oportunidade: </b>8</li>
          <li class="list-group-item"><b>Itens de Exploração: </b>2</li>
          <li class="list-group-item"><b>Dados de Defesa: </b>2</li>
        </ul>
        <div class="d-none d-md-flex col-md-1 justify-content-center align-items-center">
          <div class="vr" style="height: 100%; width:2px;"></div>
        </div>
        <div class="d-flex d-md-none col-12 px-0 justify-content-center align-items-center my-2">
          <div style="height:2px; width:100%; background:var(--bs-border-color);"></div>
        </div>
        <div class="col-12 col-md-6 d-flex flex-column align-items-center justify-content-center">
          <h6 class="text-secondary mb-2 text-center">${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h6>
          <h5 class="mb-2 text-info text-center">${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h5>
          <p class="text-light px-2">${localization[`Character.Reivolk.${actor.ID}.Description`] || ''}</p>
        </div>
      </div>
    </div>
  `;
  container.appendChild(rowCard);

  // Função auxiliar para seleção limitada
  function setupLimitedSelection(row, maxSelectable, borderColor) {
    const buttons = row.querySelectorAll('.select-btn');
    buttons.forEach(btn => {
      // Corrige borda inicial para cinza
      const card = btn.closest('.card');
      card.classList.remove('border-3', 'border-danger', 'border-primary', 'border-success', 'border-warning');
      card.classList.add('border', 'border-secondary');
      btn.textContent = 'Selecionar';
      btn.classList.remove('active');
      btn.disabled = false;
      card.classList.remove('bg-dark', 'opacity-75', 'shadow');
      // Evento de seleção
      btn.addEventListener('click', function() {
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          card.classList.remove('border-secondary');
          card.classList.add('border-3', borderColor, 'shadow');
          btn.textContent = 'Selecionado';
        } else {
          card.classList.remove('border-3', borderColor, 'shadow');
          card.classList.add('border-secondary');
          btn.textContent = 'Selecionar';
        }
        const selected = row.querySelectorAll('.select-btn.active');
        if (selected.length >= maxSelectable) {
          buttons.forEach(b => {
            if (!b.classList.contains('active')) {
              b.disabled = true;
              b.closest('.card').classList.add('bg-dark', 'opacity-75');
            }
          });
        } else {
          buttons.forEach(b => {
            b.disabled = false;
            b.closest('.card').classList.remove('bg-dark', 'opacity-75');
          });
        }
      });
    });
  }

  // Função para formatar fallback amigável
  function formatFallback(id) {
    return id.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }

  // Função para obter TriggerType abreviado
  function getTriggerAbbr(type) {
    if (!type) return '';
    if (type === 'Passive') return '(P)';
    if (type === 'BeforeAttack') return '(A)';
    if (type === 'AfterAttack') return '(D)';
    return '';
  }

  // Cards de Ataques sem Limites
  if (actor.UnlimitedAttacksData && actor.UnlimitedAttacksData.length) {
    const rowAttacks = document.createElement('div');
    rowAttacks.className = 'row justify-content-center';
    rowAttacks.innerHTML = `<h3 class='text-danger text-center my-3'>Ataques Sem Limites <span class="fs-6">(Escolha ${actor.NumberOfUnlimitedAttacks})</span></h3>`;
    actor.UnlimitedAttacksData.forEach(attackId => {
      const attack = gameData.AttackDefinitions.find(a => a.ID === attackId);
      if (!attack) return;
      const card = document.createElement('div');
      card.className = 'card col-12 col-md-5 m-2';
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-danger\">${localization[`Attack.${attackId}`] || attackId}</h5>
          <p class=\"card-text\">
            <b>Dano:</b> ${attack.Damage} <br>
            <b>Distância:</b> ${attack.MinimumDistance} - ${attack.MaximumDistance} <br>
            <b>Dados:</b> ${attack.Dices} <br>
            <b>Tempo de Recarga:</b> ${attack.LoadTime || 0} segundos <br>
            ${attack.SpecialDescription ? `<i>${localization[`Attack.${attackId}.SpecialDescription`] || ''}</i>` : ''}
          </p>
          <button class=\"btn btn-outline-danger select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `;
      rowAttacks.appendChild(card);
    });
    container.appendChild(rowAttacks);
    setupLimitedSelection(rowAttacks, actor.NumberOfUnlimitedAttacks || 1, 'border-danger');
  }
  // Cards de Poderes
  if (actor.PowersData && actor.PowersData.length) {
    const rowPowers = document.createElement('div');
    rowPowers.className = 'row justify-content-center';
    rowPowers.innerHTML = `<h3 class='text-primary text-center my-3'>Poderes <span class="fs-6">(Escolha ${actor.NumberOfPowers})</span></h3>`;
    actor.PowersData.forEach(powerId => {
      const card = document.createElement('div');
      card.className = 'card col-12 col-md-5 m-2';
      const powerDef = (gameData.ConsumableDefinitions || []).find(p => p.ID === powerId) || {};
      const abbr = getTriggerAbbr(powerDef.TriggerType);
      const name = `${abbr} ${(localization[`Consumable.${powerId}`] || formatFallback(powerId)).trim()}`;
      const desc = localization[`Consumable.${powerId}.Description`] || '';
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-primary\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-primary select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `;
      rowPowers.appendChild(card);
    });
    container.appendChild(rowPowers);
    setupLimitedSelection(rowPowers, actor.NumberOfPowers || 1, 'border-primary');
  }
  // Cards de Passivas
  if (actor.PassivesData && actor.PassivesData.length) {
    const rowPassives = document.createElement('div');
    rowPassives.className = 'row justify-content-center';
    rowPassives.innerHTML = `<h3 class='text-success text-center my-3'>Passivas <span class="fs-6">(Escolha ${actor.NumberOfPassives})</span></h3>`;
    actor.PassivesData.forEach(passiveId => {
      const card = document.createElement('div');
      card.className = 'card col-12 col-md-5 m-2';
      const passiveDef = (gameData.PassiveDefinitions || []).find(p => p.ID === passiveId) || {};
      const abbr = getTriggerAbbr(passiveDef.TriggerType);
      const name = `${abbr} ${(localization[`Passive.${passiveId}`] || formatFallback(passiveId)).trim()}`;
      const desc = localization[`Passive.${passiveId}.Description`] || 'Sem descrição.';
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-success\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-success select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `;
      rowPassives.appendChild(card);
    });
    container.appendChild(rowPassives);
    setupLimitedSelection(rowPassives, actor.NumberOfPassives || 1, 'border-success');
  }
  // Cards de Habilidades Especiais
  if (actor.SpecialAbilitiesData && actor.SpecialAbilitiesData.length) {
    const rowSpecials = document.createElement('div');
    rowSpecials.className = 'row justify-content-center';
    rowSpecials.innerHTML = `<h3 class='text-warning text-center my-3'>Habilidades Especiais <span class=\"fs-6\">(Escolha ${actor.NumberOfSpecialAbilities})</span></h3>`;
    actor.SpecialAbilitiesData.forEach(specialId => {
      const card = document.createElement('div');
      card.className = 'card col-12 col-md-5 m-2';
      const specialDef = (gameData.SpecialAbilityDefinitions || []).find(s => s.ID === specialId) || {};
      const abbr = getTriggerAbbr(specialDef.TriggerType);
      const name = `${abbr} ${(localization[`Special.${specialId}`] || formatFallback(specialId)).trim()}`;
      const desc = localization[`Special.${specialId}.Description`] || 'Sem descrição.';
      card.innerHTML = `
        <div class=\"card-body\">
          <h5 class=\"card-title text-warning\">${name}</h5>
          <p class=\"card-text\">${desc}</p>
          <button class=\"btn btn-outline-warning select-btn w-100 mt-2\">Selecionar</button>
        </div>
      `;
      rowSpecials.appendChild(card);
    });
    container.appendChild(rowSpecials);
    setupLimitedSelection(rowSpecials, actor.NumberOfSpecialAbilities || 1, 'border-warning');
  }
  // Adiciona botão de criar personagem ao final
  const createBtnRow = document.createElement('div');
  createBtnRow.className = 'row justify-content-center my-4';
  const createBtn = document.createElement('button');
  createBtn.className = 'btn btn-lg btn-success';
  createBtn.textContent = 'Criar Personagem';
  createBtn.onclick = function() {
    // Coleta escolhas detalhadas
    function getAttackInfo(card) {
      const title = card.querySelector('.card-title').textContent;
      const attack = gameData.AttackDefinitions.find(a => title.includes(localization[`Attack.${a.ID}`] || a.ID));
      if (!attack) return '';
      return `<b>${localization[`Attack.${attack.ID}`] || attack.ID}</b><br>
        Dano: ${attack.Damage}<br>
        Distância: ${attack.MinimumDistance} - ${attack.MaximumDistance}<br>
        Dados: ${attack.Dices}<br>
        Tempo de Recarga: ${attack.LoadTime || 0} segundos<br>
        ${attack.SpecialDescription ? `<i>${localization[`Attack.${attack.ID}.SpecialDescription`] || ''}</i><br>` : ''}`;
    }
    function getPowerInfo(card) {
      const title = card.querySelector('.card-title').textContent;
      const id = (gameData.ConsumableDefinitions || []).find(p => title.includes(localization[`Consumable.${p.ID}`] || p.ID))?.ID;
      return id ? `<b>${localization[`Consumable.${id}`] || id}</b><br>${localization[`Consumable.${id}.Description`] || ''}` : card.querySelector('.card-title').textContent;
    }
    function getPassiveInfo(card) {
      const title = card.querySelector('.card-title').textContent;
      const id = (gameData.PassiveDefinitions || []).find(p => title.includes(localization[`Passive.${p.ID}`] || p.ID))?.ID;
      return id ? `<b>${localization[`Passive.${id}`] || id}</b><br>${localization[`Passive.${id}.Description`] || 'Sem descrição.'}` : card.querySelector('.card-title').textContent;
    }
    function getSpecialInfo(card) {
      const title = card.querySelector('.card-title').textContent;
      const id = (gameData.SpecialAbilityDefinitions || []).find(s => title.includes(localization[`Special.${s.ID}`] || s.ID))?.ID;
      return id ? `<b>${localization[`Special.${id}`] || id}</b><br>${localization[`Special.${id}.Description`] || 'Sem descrição.'}` : card.querySelector('.card-title').textContent;
    }
    // Seleções detalhadas
    const ataques = Array.from(document.querySelectorAll('.row .card .btn-outline-danger.select-btn.active')).map(btn => getAttackInfo(btn.closest('.card')));
    const poderes = Array.from(document.querySelectorAll('.row .card .btn-outline-primary.select-btn.active')).map(btn => getPowerInfo(btn.closest('.card')));
    const passivas = Array.from(document.querySelectorAll('.row .card .btn-outline-success.select-btn.active')).map(btn => getPassiveInfo(btn.closest('.card')));
    const especiais = Array.from(document.querySelectorAll('.row .card .btn-outline-warning.select-btn.active')).map(btn => getSpecialInfo(btn.closest('.card')));
    // Limpa container
    container.innerHTML = '';
    // Mostra ficha final
    const ficha = document.createElement('div');
    ficha.className = 'card col-12 col-md-8 mx-auto my-5 p-4';
    ficha.innerHTML = `
      <h2 class='text-center mb-4'>Ficha do Personagem</h2>
      <h3 class='text-center mb-3'>${localization[`Character.Name.${actor.ID}`] || actor.ID}</h3>
      <div class='mb-3'>
        <b>Pontos de Esquiva:</b> 10<br>
        <b>Ataque de Oportunidade:</b> 8<br>
        <b>Itens de Exploração:</b> 2<br>
        <b>Dados de Defesa:</b> 2<br>
      </div>
      <div class='mb-4'>
        <h5 class='text-info mb-1'>${localization[`Character.Reivolk.${actor.ID}.Title`] || ''}</h5>
        <div class='text-light'>${localization[`Character.Reivolk.${actor.ID}.Description`] || ''}</div>
      </div>
      <h4 class='text-danger'>Ataques Sem Limites:</h4>
      <ul>${ataques.map(a => `<li>${a}</li>`).join('')}</ul>
      <h4 class='text-primary'>Poderes:</h4>
      <ul>${poderes.map(p => `<li>${p}</li>`).join('')}</ul>
      <h4 class='text-success'>Passivas:</h4>
      <ul>${passivas.map(pv => `<li>${pv}</li>`).join('')}</ul>
      <h4 class='text-warning'>Habilidades Especiais:</h4>
      <ul>${especiais.map(e => `<li>${e}</li>`).join('')}</ul>
      <div class='text-center mt-4'><button class='btn btn-secondary' onclick='location.reload()'>Reiniciar</button></div>
    `;
    container.appendChild(ficha);
  };
  createBtnRow.appendChild(createBtn);
  container.appendChild(createBtnRow);
}