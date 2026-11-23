import React, { useEffect, useRef } from 'react';
import WeaponSelectorList from './WeaponSelectorList';
import SwapDefenderControl from './SwapDefenderControl';

/**
 * ============================================================================
 * FASE 1 DO COMBATE: SELEÇÃO DE ARMA DO DEFENSOR (CombatWeaponSelection.jsx)
 * ============================================================================
 * - Se o combate for "Ataque Único" (sem revidar), inicia a rolagem automaticamente.
 * - Para o Defensor: mostra a lista de armas para revidar ou o botão "Não Retaliar".
 * - Para o Atacante: mostra o status de espera (1v1 ou Multi-Alvo).
 * - Para Espectadores: informa quem está atacando quem.
 * ============================================================================
 */

// Insere o nome em negrito exatamente na posição de {name} na string localizada
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
  onAutoStartSingleAttack,
  swapTargets = [],
  onSwapDefender,
  onEndCombat,
  localization = {}
}) => {
  const autoStartedCombatIdRef = useRef(null);
  const isAttacker = Boolean(currentPlayer?.id && currentPlayer.id === combat?.attacker_id);
  const isDefender = Boolean(currentPlayer?.id && currentPlayer.id === combat?.defender_id);

  // Se o combate não permite contra-ataque (Ataque Único), apenas o atacante inicia a rolagem 1 única vez
  useEffect(() => {
    if (
      isAttacker &&
      combat?.id &&
      !combat.allow_counter_attack &&
      combat.status === 'pending' &&
      autoStartedCombatIdRef.current !== combat.id
    ) {
      autoStartedCombatIdRef.current = combat.id;
      onAutoStartSingleAttack();
    }
  }, [isAttacker, combat?.id, combat?.allow_counter_attack, combat?.status, onAutoStartSingleAttack]);

  if (!combat) return null;

  if (!combat.allow_counter_attack) {
    return (
      <div className="text-white text-center py-3">
        {localization?.['UI.Combat.Initiating'] || 'Iniciando combate...'}
      </div>
    );
  }

  // 1. VISÃO DO DEFENSOR: Escolher arma para revidar
  if (isDefender) {
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

  // 2. VISÃO DO ATACANTE: Aguardando Defensor(es)
  if (isAttacker) {
    const isMultiDefender = combatGroup.length > 1;

    if (isMultiDefender) {
      return (
        <>
          <div className="alert alert-info">
            <h6 className="mb-1">
              {localization?.['UI.Combat.MultiTarget'] || '⚔️ Combate Multi-Alvo'}
            </h6>
            <p className="mb-0">
              <strong>{combat.attack_data?.Name}</strong> vs {combatGroup.length}{' '}
              {localization?.['UI.Combat.Defenders'] || 'defensores'}
            </p>
          </div>

          <div className="d-flex flex-column gap-2 mb-3">
            {combatGroup.map((gc) => {
              const statusLabel = gc.status === 'cancelled'
                ? `❌ ${localization?.['UI.Combat.StatusCancelled'] || 'Cancelado'}`
                : gc.combat_phase === 'weapon_selection'
                ? `⏳ ${localization?.['UI.Combat.StatusChoosing'] || 'Escolhendo arma...'}`
                : gc.combat_phase === 'rolling'
                ? (gc.round_data?.[0]?.defender?.rolled
                    ? `✅ ${localization?.['UI.Combat.StatusDefended'] || 'Defendeu'}`
                    : `🎲 ${localization?.['UI.Combat.StatusWaitingDefense'] || 'Aguardando defesa'}`)
                : `📊 ${localization?.['UI.Combat.StatusFinished'] || 'Finalizado'}`;

              return (
                <div key={gc.id} className="card border-secondary bg-dark">
                  <div className="card-body p-2">
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <span className="text-white small fw-bold">🛡️ {gc.defender_name}</span>
                      <span className="text-muted small">{statusLabel}</span>
                    </div>
                    {gc.defender_weapon && (
                      <small className="text-warning d-block mt-1">
                        {localization?.['UI.Combat.WeaponLabel'] || 'Arma:'} {gc.defender_weapon.Name}
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <SwapDefenderControl
            swapTargets={swapTargets}
            onSwapDefender={onSwapDefender}
            localization={localization}
          />

          <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
            {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
          </button>
        </>
      );
    }

    const waitingChoiceTemplate =
      localization?.['UI.Combat.WaitingWeaponChoice'] || 'Aguardando {name} escolher sua arma...';

    return (
      <>
        <div className="alert alert-info">
          <h6 className="mb-1">
            {localization?.['UI.Combat.WaitingDefender'] || '⚔️ Aguardando Defensor...'}
          </h6>
          <p className="mb-0">
            {renderWithBoldName(waitingChoiceTemplate, combat.defender_name)}
          </p>
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

  // 3. VISÃO DO ESPECTADOR
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
        <small>
          {renderWithBoldName(waitingRetaliateTemplate, combat.defender_name)}
        </small>
      </p>
      <div className="text-center mt-2">👀 ⏳</div>
    </div>
  );
};

export default CombatWeaponSelection;