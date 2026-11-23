import React from 'react';
import WeaponSelectorList from './WeaponSelectorList';
import { useEscapeKey } from '../../hooks/useEscapeKey';

/**
 * ============================================================================
 * MODAIS DE COMBATE (CombatModals.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * Renderiza os 2 modais flutuantes do sistema de combate:
 * 1. Modal de Trocar Arma (para participantes trocarem de arma no meio da luta).
 * 2. Modal de Ataque de Oportunidade (para espectadores atacarem um dos lados).
 * ============================================================================
 */
const CombatModals = ({
  showWeaponChange,
  onCloseWeaponChange,
  tempWeapon,
  onSelectTempWeapon,
  onConfirmWeaponChange,
  showOpportunityAttack,
  onCloseOpportunityAttack,
  opportunityTarget,
  onSelectOpportunityTarget,
  opportunityWeapon,
  onSelectOpportunityWeapon,
  onConfirmOpportunityAttack,
  combat,
  availableAttacks = [],
  customAttack,
  onChangeCustomAttack,
  actor,
  combatMode,
  localization = {}
}) => {
  useEscapeKey(showWeaponChange, onCloseWeaponChange);
  useEscapeKey(showOpportunityAttack, onCloseOpportunityAttack);

  return (
    <>
      {/* 1. Modal de Trocar Arma Durante o Combate */}
      {showWeaponChange && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000 }}
            onClick={onCloseWeaponChange}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="weapon-change-modal-title"
            className="position-fixed top-50 start-50 translate-middle bg-dark border border-warning rounded p-3"
            style={{ zIndex: 2001, maxWidth: '400px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
          >
            <header className="d-flex justify-content-between align-items-center mb-3">
              <h5 id="weapon-change-modal-title" className="text-warning mb-0">
                {localization?.['UI.Combat.WeaponChangeTitle'] || '⚔️ Trocar Arma'}
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white"
                aria-label="Fechar"
                onClick={onCloseWeaponChange}
              />
            </header>

            <div className="alert alert-info py-2 px-2 mb-3">
              <small>
                {localization?.['UI.Combat.WeaponChangeHint'] ||
                  '💡 A alteração permanece até o fim do combate'}
              </small>
            </div>

            <WeaponSelectorList
              weapons={availableAttacks}
              selectedWeapon={tempWeapon}
              onSelectWeapon={onSelectTempWeapon}
              customAttack={customAttack}
              onChangeCustomAttack={onChangeCustomAttack}
              actor={actor}
              combatMode={combatMode}
              localization={localization}
              accentColor="warning"
            />

            <footer className="d-flex gap-2 mt-3">
              <button type="button" className="btn btn-secondary flex-fill" onClick={onCloseWeaponChange}>
                {localization?.['UI.Combat.Cancel'] || 'Cancelar'}
              </button>
              <button
                type="button"
                className="btn btn-warning flex-fill"
                disabled={!tempWeapon}
                onClick={() => tempWeapon && onConfirmWeaponChange(tempWeapon)}
              >
                {localization?.['UI.Combat.ConfirmChange'] || 'Confirmar troca'}
              </button>
            </footer>
          </div>
        </>
      )}

      {/* 2. Modal de Ataque de Oportunidade (Espectadores) */}
      {showOpportunityAttack && combat && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000 }}
            onClick={onCloseOpportunityAttack}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-attack-modal-title"
            className="position-fixed top-50 start-50 translate-middle bg-dark border border-warning rounded p-3"
            style={{ zIndex: 2001, maxWidth: '400px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
          >
            <header className="d-flex justify-content-between align-items-center mb-3">
              <h5 id="opportunity-attack-modal-title" className="text-warning mb-0">
                {localization?.['UI.Combat.OpportunityTitle'] || '⚡ Ataque de Oportunidade'}
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white"
                aria-label="Fechar"
                onClick={onCloseOpportunityAttack}
              />
            </header>

            <div className="alert alert-info py-2 px-2 mb-3">
              <small>
                {localization?.['UI.Combat.OpportunityHint'] ||
                  '💡 Escolha uma arma e um alvo (atacante ou defensor)'}
              </small>
            </div>

            {/* Escolha do Alvo */}
            <section className="mb-3" aria-label="Escolha do alvo">
              <label className="text-white mb-2 small d-block">
                <strong>{localization?.['UI.Combat.ChooseTarget'] || '1️⃣ Escolha o Alvo:'}</strong>
              </label>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill ${opportunityTarget === 'attacker' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => onSelectOpportunityTarget('attacker')}
                >
                  ⚔️ {combat.attacker_name}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill ${opportunityTarget === 'defender' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => onSelectOpportunityTarget('defender')}
                >
                  🛡️ {combat.defender_name}
                </button>
              </div>
            </section>

            {/* Escolha da Arma */}
            <section className="mb-3" aria-label="Escolha da arma">
              <label className="text-white mb-2 small d-block">
                <strong>{localization?.['UI.Combat.ChooseWeaponLabel'] || '2️⃣ Escolha sua Arma:'}</strong>
              </label>
              <WeaponSelectorList
                weapons={availableAttacks}
                selectedWeapon={opportunityWeapon}
                onSelectWeapon={onSelectOpportunityWeapon}
                customAttack={customAttack}
                onChangeCustomAttack={onChangeCustomAttack}
                actor={actor}
                combatMode={combatMode}
                localization={localization}
                accentColor="warning"
              />
            </section>

            <footer>
              <button
                type="button"
                className="btn btn-warning w-100"
                disabled={!opportunityWeapon || !opportunityTarget}
                onClick={onConfirmOpportunityAttack}
              >
                {localization?.['UI.Combat.ConfirmOpportunity'] || '⚡ Confirmar Ataque de Oportunidade'}
              </button>
            </footer>
          </div>
        </>
      )}
    </>
  );
};

export default CombatModals;