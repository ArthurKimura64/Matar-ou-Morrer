import React from 'react';
import BaseModal from '../../components/BaseModal';
import WeaponSelectorList from './WeaponSelectorList';

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
}) => (
  <>
    {/* 1. Modal de Trocar Arma Durante o Combate */}
    <BaseModal
      show={showWeaponChange}
      onClose={onCloseWeaponChange}
      title={localization?.['UI.Combat.WeaponChangeTitle'] || '⚔️ Trocar Arma'}
      borderVariant="warning"
      maxWidth="420px"
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCloseWeaponChange}>
            {localization?.['UI.Combat.Cancel'] || 'Cancelar'}
          </button>
          <button
            type="button"
            className="btn btn-warning btn-sm fw-bold"
            disabled={!tempWeapon}
            onClick={() => tempWeapon && onConfirmWeaponChange(tempWeapon)}
          >
            {localization?.['UI.Combat.ConfirmChange'] || 'Confirmar troca'}
          </button>
        </>
      }
    >
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
    </BaseModal>

    {/* 2. Modal de Ataque de Oportunidade (Espectadores) */}
    <BaseModal
      show={Boolean(showOpportunityAttack && combat)}
      onClose={onCloseOpportunityAttack}
      title={localization?.['UI.Combat.OpportunityTitle'] || '⚡ Ataque de Oportunidade'}
      borderVariant="warning"
      maxWidth="420px"
      footer={
        <button
          type="button"
          className="btn btn-warning w-100 fw-bold"
          disabled={!opportunityWeapon || !opportunityTarget}
          onClick={onConfirmOpportunityAttack}
        >
          {localization?.['UI.Combat.ConfirmOpportunity'] || '⚡ Confirmar Ataque de Oportunidade'}
        </button>
      }
    >
      <div className="alert alert-info py-2 px-2 mb-3">
        <small>
          {localization?.['UI.Combat.OpportunityHint'] ||
            '💡 Escolha uma arma e um alvo (atacante ou defensor)'}
        </small>
      </div>

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
            ⚔️ {combat?.attacker_name}
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-fill ${opportunityTarget === 'defender' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => onSelectOpportunityTarget('defender')}
          >
            🛡️ {combat?.defender_name}
          </button>
        </div>
      </section>

      <section className="mb-1" aria-label="Escolha da arma">
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
    </BaseModal>
  </>
);

export default CombatModals;