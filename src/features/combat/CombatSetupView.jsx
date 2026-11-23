import React from 'react';
import WeaponSelectorList from './WeaponSelectorList';

/**
 * ============================================================================
 * TELA DE CONFIGURAÇÃO DE NOVO COMBATE (CombatSetupView.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * Permite ao jogador iniciar um novo combate em 3 passos:
 * 1. Escolher seu Ataque ou Arma
 * 2. Escolher um ou mais Alvos (Defensores)
 * 3. Configurar opções (Ataque único / Ataques de oportunidade)
 * ============================================================================
 */
const CombatSetupView = ({
  matchStatus,
  currentPlayerData,
  combatMode,
  onChangeCombatMode,
  availableAttacks,
  selectedAttack,
  onSelectAttack,
  customAttack,
  onChangeCustomAttack,
  availableTargets,
  selectedDefenders,
  onToggleDefender,
  allowCounterAttack,
  onChangeAllowCounterAttack,
  allowOpportunityAttacks,
  onChangeAllowOpportunityAttacks,
  loading,
  onStartCombat,
  localization = {}
}) => {
  // 1. Verifica se a partida já foi iniciada
  if (matchStatus !== 'in_progress') {
    return (
      <div className="alert alert-info">
        <p className="mb-0">
          {localization?.['UI.Combat.StartMatchRequired'] || '🏁 Inicie uma partida antes de iniciar combates!'}
        </p>
      </div>
    );
  }

  // 2. Verifica se o jogador já montou seu personagem
  if (!currentPlayerData?.character?.selections) {
    return (
      <div className="alert alert-warning">
        <p className="mb-0">
          {localization?.['UI.Combat.CreateCharacterRequired'] || '⚠️ Você precisa criar um personagem antes de iniciar combates!'}
        </p>
      </div>
    );
  }

  const actor = currentPlayerData?.character?.actor;
  const hasModes = Boolean(actor?.mode1 && actor?.mode2);
  const mode1Name = localization?.[actor?.mode1] || actor?.mode1 || 'Modo 1';
  const mode2Name = localization?.[actor?.mode2] || actor?.mode2 || 'Modo 2';

  return (
    <>
      {/* Alternância de Modo (apenas para personagens com 2 modos) */}
      {hasModes && (
        <div className="mode-switch-section mb-3">
          <div className="mode-switch-title">
            {localization?.['UI.Combat.CombatMode'] || '🔀 Modo de Combate'}
          </div>
          <div className="btn-group" role="group">
            <button
              type="button"
              className={`btn ${combatMode === 'mode1' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => onChangeCombatMode('mode1')}
            >
              {mode1Name}
            </button>
            <button
              type="button"
              className={`btn ${combatMode === 'mode2' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => onChangeCombatMode('mode2')}
            >
              {mode2Name}
            </button>
          </div>
          <div className="mode-info-text">
            {localization?.['UI.Combat.ModeDefinesHint'] || '✨ Define ataques/armas e estatísticas disponíveis'}
          </div>
        </div>
      )}

      {/* Passo 1: Selecionar Ataque/Arma */}
      <div className="mb-4">
        <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
          {localization?.['UI.Combat.SelectAttackSection'] || '1️⃣ Selecione seu Ataque/Arma'}
        </h6>
        <WeaponSelectorList
          weapons={availableAttacks}
          selectedWeapon={selectedAttack}
          onSelectWeapon={onSelectAttack}
          customAttack={customAttack}
          onChangeCustomAttack={onChangeCustomAttack}
          actor={actor}
          combatMode={combatMode}
          localization={localization}
          accentColor="success"
        />
      </div>

      {/* Passo 2: Selecionar Alvo(s) */}
      <div className="mb-4">
        <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
          {localization?.['UI.Combat.SelectTargetSection'] || '2️⃣ Selecione o(s) Alvo(s)'}
        </h6>

        {availableTargets.length === 0 ? (
          <div className="alert alert-info">
            <small>{localization?.['UI.Combat.NoTargetsAvailable'] || 'Nenhum jogador disponível para combate no momento.'}</small>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {availableTargets.map((player) => {
              const isSelected = selectedDefenders.includes(player.id);
              const charName =
                player.character_name ||
                player.character?.actor?.Name ||
                player.character?.actor?.ID ||
                (localization?.['UI.Combat.CharacterFallback'] || 'Personagem');

              return (
                <div
                  key={player.id}
                  className={`card border ${isSelected ? 'border-primary bg-primary bg-opacity-25' : 'border-secondary'} cursor-pointer`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onToggleDefender(player.id)}
                >
                  <div className="card-body p-2 d-flex flex-row justify-content-between align-items-center text-start gap-2">
                    <div className="text-start">
                      <h6 className="text-white mb-0 small">{player.name}</h6>
                      <small className="text-muted" style={{ fontSize: '11px' }}>
                        {charName}
                      </small>
                    </div>
                    {isSelected && <span className="text-primary fw-bold flex-shrink-0">✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Passo 3: Opções de Combate */}
      <div className="mb-4">
        <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
          {localization?.['UI.Combat.OptionsSection'] || '3️⃣ Opções de Combate'}
        </h6>

        <div className="form-check form-switch mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="singleAttack"
            checked={!allowCounterAttack}
            onChange={(e) => onChangeAllowCounterAttack(!e.target.checked)}
          />
          <label className="form-check-label text-white" htmlFor="singleAttack">
            <small>{localization?.['UI.Combat.SingleAttack'] || 'Ataque único (não pode revidar)'}</small>
          </label>
        </div>

        {!allowCounterAttack && (
          <div className="alert alert-warning mt-2 py-1 px-2 mb-2">
            <small style={{ fontSize: '10px' }}>
              {localization?.['UI.Combat.SingleAttackHint'] || '⚡ Apenas 1 rodada de ataque sem possibilidade de contra-ataque'}
            </small>
          </div>
        )}

        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="opportunityAttacks"
            checked={allowOpportunityAttacks}
            onChange={(e) => onChangeAllowOpportunityAttacks(e.target.checked)}
          />
          <label className="form-check-label text-white" htmlFor="opportunityAttacks">
            <small>{localization?.['UI.Combat.AllowOpportunity'] || 'Permitir ataques de oportunidade'}</small>
          </label>
        </div>

        {allowOpportunityAttacks && (
          <div className="alert alert-info mt-2 py-1 px-2">
            <small style={{ fontSize: '10px' }}>
              {localization?.['UI.Combat.AllowOpportunityHint'] || '👁️ Espectadores podem dar 1 ataque de oportunidade'}
            </small>
          </div>
        )}
      </div>

      {/* Botão Iniciar Combate */}
      <button
        type="button"
        className="btn btn-danger w-100 fw-bold"
        onClick={onStartCombat}
        disabled={loading || !selectedAttack || selectedDefenders.length === 0}
      >
        {loading ? (
          <>
            <span className="spinner-border spinner-border-sm me-2" />
            {localization?.['UI.Combat.Starting'] || 'Iniciando...'}
          </>
        ) : (
          <>
            {localization?.['UI.Combat.StartCombat'] || '⚔️ Iniciar Combate'}
            {selectedDefenders.length > 0 && ` (${selectedDefenders.length})`}
          </>
        )}
      </button>

      {/* Resumo da Seleção */}
      {selectedAttack && selectedDefenders.length > 0 && (
        <div className="alert alert-dark mt-3 py-2 px-2">
          <small className="text-white" style={{ fontSize: '11px' }}>
            <strong>{localization?.['UI.Combat.Summary'] || 'Resumo:'}</strong><br />
            {localization?.['UI.Combat.SummaryAttack'] || '🎯 Ataque:'} {selectedAttack.Name}<br />
            {localization?.['UI.Combat.SummaryTargets'] || '👥 Alvos:'} {selectedDefenders.length}<br />
            {localization?.['UI.Combat.SummaryType'] || '⚡ Tipo:'}{' '}
            {allowCounterAttack
              ? (localization?.['UI.Combat.FullCombat'] || 'Combate Completo')
              : (localization?.['UI.Combat.SingleAttackType'] || 'Ataque Único')}
          </small>
        </div>
      )}
    </>
  );
};

export default CombatSetupView;