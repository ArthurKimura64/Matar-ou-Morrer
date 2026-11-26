import React from 'react';
import WeaponSelectorList from './WeaponSelectorList';
import SwapDefenderControl from './SwapDefenderControl';

const renderWithBoldName = (template, name) => {
  const safeTemplate = String(template || '');
  const safeName = name || '';

  if (!safeTemplate.includes('{name}')) {
    return (
      <>
        {safeTemplate} <strong>{safeName}</strong>
      </>
    );
  }

  const parts = safeTemplate.split('{name}');
  return parts.map((part, idx) => (
    <React.Fragment key={idx}>
      {part}
      {idx < parts.length - 1 && <strong>{safeName}</strong>}
    </React.Fragment>
  ));
};

const CombatWeaponSelection = ({
  combat,
  combatGroup = [],
  currentPlayer,
  currentPlayerData,
  combatMode,
  availableWeapons = [],
  selectedWeapon,
  onSelectWeapon,
  customAttack,
  onChangeCustomAttack,
  onConfirmDefenseWeapon,
  swapTargets = [],
  onSwapDefender,
  onEndCombat,
  localization = {}
}) => {
  if (!combat) return null;

  const activeGroup = combatGroup.filter((gc) => gc.status !== 'cancelled');
  const isMultiDefender = activeGroup.length > 1;
  const myDefenderRow = activeGroup.find((gc) => gc.defender_id === currentPlayer?.id) || null;
  const isAttacker = Boolean(currentPlayer?.id && currentPlayer.id === combat.attacker_id);
  const isDefenderChoosing = Boolean(
    myDefenderRow
      ? myDefenderRow.combat_phase === 'weapon_selection'
      : currentPlayer?.id && currentPlayer.id === combat.defender_id && combat.combat_phase === 'weapon_selection'
  );
  const isGroupParticipant = isAttacker || Boolean(myDefenderRow);

  if (!combat.allow_counter_attack) {
    return (
      <div className="text-white text-center py-3">
        {localization?.['UI.Combat.Initiating'] || 'Iniciando combate...'}
      </div>
    );
  }

  // 1. VISÃO DO DEFENSOR QUE AINDA PRECISA ESCOLHER ARMA
  if (isDefenderChoosing) {
    const actor = currentPlayerData?.character?.actor;
    return (
      <>
        <div className="alert alert-warning">
          <h6 className="mb-1">
            {localization?.['UI.Combat.CombatStartedTitle'] || '⚔️ Combate Iniciado!'}
          </h6>
          <p className="mb-0">
            <strong>{combat.attacker_name}</strong>{' '}
            {localization?.['UI.Combat.AttackingYouWith'] || 'está atacando você com'}{' '}
            <strong>{combat.attack_data?.Name}</strong>!
          </p>
        </div>

        <div className="mb-3">
          <h6 className="text-white mb-2">
            {localization?.['UI.Combat.ChooseWeapon'] || '✓ Escolha sua arma para revidar:'}
          </h6>
          <WeaponSelectorList
            weapons={availableWeapons}
            selectedWeapon={selectedWeapon}
            onSelectWeapon={onSelectWeapon}
            customAttack={customAttack}
            onChangeCustomAttack={onChangeCustomAttack}
            actor={actor}
            combatMode={combatMode}
            localization={localization}
            accentColor="success"
          />
        </div>

        <button
          type="button"
          className="btn btn-success w-100 mb-2"
          onClick={() => onConfirmDefenseWeapon(false)}
          disabled={!selectedWeapon}
        >
          {localization?.['UI.Combat.ConfirmWeapon'] || 'Confirmar Arma'}
        </button>

        <button
          type="button"
          className="btn btn-warning w-100 mb-2"
          onClick={() => onConfirmDefenseWeapon(true)}
        >
          {localization?.['UI.Combat.NoRetaliation'] || '❌ Não Retaliar'}
        </button>

        {!isMultiDefender && (
          <SwapDefenderControl
            swapTargets={swapTargets}
            onSwapDefender={onSwapDefender}
            localization={localization}
          />
        )}

        <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
          {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
        </button>
      </>
    );
  }

  // 2. MULTI-ALVO: ESPERA UNIFICADA (Atacante, Defensores que já escolheram e Espectadores)
  if (isMultiDefender) {
    return (
      <>
        <div className="alert alert-info">
          <h6 className="mb-1">
            {localization?.['UI.Combat.MultiTarget'] || '⚔️ Combate Multi-Alvo'}
          </h6>
          <p className="mb-0 small">
            <strong>{combat.attacker_name}</strong> usando{' '}
            <strong>{combat.attack_data?.Name}</strong> contra {activeGroup.length} defensores.
            Aguardando todos escolherem a reação...
          </p>
        </div>

        <div className="d-flex flex-column gap-2 mb-3">
          {activeGroup.map((gc) => {
            const isReady = gc.combat_phase !== 'weapon_selection';
            const weaponLabel = gc.defender_weapon?.Name || 'Não retaliar';

            return (
              <div
                key={gc.id}
                className={`card border-secondary ${isReady ? 'bg-success bg-opacity-25' : 'bg-dark'}`}
              >
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <span className="text-white small fw-bold">🛡️ {gc.defender_name}</span>
                    <span className="text-muted small">
                      {isReady ? '✅ Pronto' : `⏳ ${localization?.['UI.Combat.StatusChoosing'] || 'Escolhendo arma...'}`}
                    </span>
                  </div>
                  {isReady && (
                    <small className="text-warning d-block mt-1">
                      {localization?.['UI.Combat.WeaponLabel'] || 'Arma:'} {weaponLabel}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isGroupParticipant && (
          <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
            {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
          </button>
        )}
      </>
    );
  }

  // 3. 1v1: VISÃO DO ATACANTE
  if (isAttacker) {
    const waitingChoiceTemplate =
      localization?.['UI.Combat.WaitingWeaponChoice'] || 'Aguardando {name} escolher sua arma...';

    return (
      <>
        <div className="alert alert-info">
          <h6 className="mb-1">
            {localization?.['UI.Combat.WaitingDefender'] || '⚔️ Aguardando Defensor...'}
          </h6>
          <p className="mb-0">{renderWithBoldName(waitingChoiceTemplate, combat.defender_name)}</p>
          <div className="text-center mt-2">⏳</div>
        </div>

        <SwapDefenderControl
          swapTargets={swapTargets}
          onSwapDefender={onSwapDefender}
          localization={localization}
        />

        <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
          {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
        </button>
      </>
    );
  }

  // 4. 1v1: VISÃO DO ESPECTADOR
  const waitingRetaliateTemplate =
    localization?.['UI.Combat.WaitingWeaponRetaliate'] ||
    'Aguardando {name} escolher uma arma para revidar...';

  return (
    <div className="alert alert-secondary">
      <h6 className="mb-2">
        {localization?.['UI.Combat.InProgressSpectator'] || '⚔️ Combate em Andamento'}
      </h6>
      <p className="mb-2">
        <strong>{combat.attacker_name}</strong>{' '}
        {localization?.['UI.Combat.AttackedWith'] || 'atacou'}{' '}
        <strong>{combat.defender_name}</strong>{' '}
        {localization?.['UI.Combat.With'] || 'com'}{' '}
        <strong>{combat.attack_data?.Name}</strong>!
      </p>
      <p className="mb-0 text-muted">
        <small>{renderWithBoldName(waitingRetaliateTemplate, combat.defender_name)}</small>
      </p>
      <div className="text-center mt-2">👀 ⏳</div>
    </div>
  );
};

export default CombatWeaponSelection;