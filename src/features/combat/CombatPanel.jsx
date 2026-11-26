import React, { useState, useCallback, useEffect } from 'react';
import { useCombatSync } from '../../hooks/useCombatSync';
import { useToast } from '../../hooks/useToast';
import CombatSetupView from './CombatSetupView';
import CombatWeaponSelection from './CombatWeaponSelection';
import CombatRollingView from './CombatRollingView';
import CombatResultsView from './CombatResultsView';
import CombatModals from './CombatModals';
import './CombatNotifications.css';

const CombatPanel = ({
  currentPlayer,
  currentPlayerData,
  players = [],
  roomId,
  localization = {},
  isOpen: isOpenProp,
  onToggle,
  matchStatus,
  combatMode: combatModeProp,
  onChangeCombatMode,
  preselectedAttack = null,
  onConsumePreselectedAttack = null
}) => {
  const [localCombatMode, setLocalCombatMode] = useState('mode1');
  const combatMode = combatModeProp !== undefined ? combatModeProp : localCombatMode;

  const handleCombatModeChange = useCallback(
    (mode) => {
      if (onChangeCombatMode) onChangeCombatMode(mode);
      else setLocalCombatMode(mode);
    },
    [onChangeCombatMode]
  );

  const [isOpenLocal, setIsOpenLocal] = useState(false);
  const isOpen = isOpenProp !== undefined ? isOpenProp : isOpenLocal;

  const toggleSidebar = useCallback(() => {
    if (onToggle) onToggle();
    else setIsOpenLocal((prev) => !prev);
  }, [onToggle]);

  const openPanelIfClosed = useCallback(() => {
    if (isOpen) return;
    if (onToggle) onToggle();
    else setIsOpenLocal(true);
  }, [isOpen, onToggle]);

  // Estados apenas visuais dos 2 modais do combate
  const [showWeaponChange, setShowWeaponChange] = useState(false);
  const [showOpportunityAttack, setShowOpportunityAttack] = useState(false);
  const [opportunityWeapon, setOpportunityWeapon] = useState(null);
  const [opportunityTarget, setOpportunityTarget] = useState(null);

  const { showToast } = useToast();

  // Toda a sincronização e ações de combate vêm de um único hook
  const {
    combat,
    combatGroup,
    activeCombatId,
    availableAttacks,
    availableTargets,
    swapTargets,
    selectedAttack,
    setSelectedAttack,
    selectedDefenders,
    handleToggleDefender,
    allowCounterAttack,
    setAllowCounterAttack,
    allowOpportunityAttacks,
    setAllowOpportunityAttacks,
    loading,
    customAttack,
    setCustomAttack,
    rolling,
    rollingCombatId,
    diceAnimation,
    selectedWeapon,
    setSelectedWeapon,
    tempWeapon,
    setTempWeapon,
    currentDefenseDices,
    handleDefenseDicesChange,
    handleStartCombat,
    handleConfirmDefenseWeapon,
    handleRollDice,
    handleAdjustDiceResult,
    handleAdvanceRound,
    handleAdvanceMultiRound1,
    handleAdvanceSingleGroupDuel,
    handleShowGroupResults,
    handleAddRound,
    handleRemoveRound,
    handleMoveRound,
    handleSwapDefender,
    handleConfirmWeaponChange,
    handleConfirmOpportunityAttack,
    handleEndCombat,
    handleSelectGroupCombat
  } = useCombatSync({
    roomId,
    currentPlayer,
    currentPlayerData,
    players,
    matchStatus,
    combatMode,
    isOpen,
    onOpenPanel: openPanelIfClosed,
    localization,
    showToast
  });

  // Quando o jogador clica em "⚔️ Atacar" direto em uma carta da ficha
  useEffect(() => {
    if (!preselectedAttack?.id) return;

    if (combat) {
      showToast(
        localization?.['UI.Combat.CombatAlreadyActive'] ||
          '⚠️ Já existe um combate ativo na sala! Aguarde o término do combate atual.',
        'warning'
      );
      onConsumePreselectedAttack?.();
      return;
    }

    const foundWeapon = availableAttacks.find((w) => w.ID === preselectedAttack.id);
    if (foundWeapon) {
      setSelectedAttack({ ...foundWeapon });
    }
    onConsumePreselectedAttack?.();
  }, [
    preselectedAttack,
    combat,
    availableAttacks,
    setSelectedAttack,
    onConsumePreselectedAttack,
    showToast,
    localization
  ]);

  const hasActiveCombat = Boolean(
    combat && (combat.status === 'pending' || combat.status === 'in_progress')
  );

  const activeGroup = combatGroup.filter((gc) => gc.status !== 'cancelled');
  const effectivePhase = !combat
    ? null
    : activeGroup.length > 1
    ? activeGroup.every((gc) => gc.combat_phase === 'results')
      ? 'results'
      : activeGroup.some((gc) => gc.combat_phase === 'weapon_selection')
      ? 'weapon_selection'
      : 'rolling'
    : combat.combat_phase;

  return (
    <>
      <button
        type="button"
        onClick={toggleSidebar}
        className={`btn btn-danger sidebar-toggle-btn sidebar-toggle-combat border border-light ${isOpen ? 'is-open' : ''} ${hasActiveCombat ? 'has-active-combat' : ''}`}
        title={
          isOpen
            ? localization?.['UI.Combat.ClosePanel'] || 'Fechar painel de combate'
            : localization?.['UI.Combat.OpenPanel'] || 'Abrir painel de combate'
        }
      >
        <span className="sidebar-toggle-icon" aria-hidden="true">{isOpen ? '▶' : '⚔️'}</span>
        <span className="sidebar-toggle-label">Combate</span>

        {!isOpen && hasActiveCombat && (
          <span className="badge bg-warning text-dark sidebar-toggle-badge">!</span>
        )}
      </button>

      {isOpen && <div className="sidebar-backdrop" onClick={toggleSidebar} />}

      <aside
        className={`bg-dark border-start border-danger game-sidebar combat-sidebar ${isOpen ? 'is-open' : ''}`}
        aria-label={localization?.['UI.Combat.PanelTitle'] || 'Painel de Combate'}
      >
        <header className="bg-danger text-white p-3 border-bottom border-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="mb-1 fw-bold">
                {localization?.['UI.Combat.PanelTitle'] || '⚔️ Painel de Combate'}
              </h6>
              <small>
                {combat
                  ? localization?.['UI.Combat.InProgress'] || 'Combate em andamento'
                  : localization?.['UI.Combat.StartNew'] || 'Iniciar novo combate'}
              </small>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="btn btn-outline-light btn-sm"
              style={{ width: '32px', height: '32px', padding: 0 }}
              aria-label="Fechar painel de combate"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="p-3">
          {!combat ? (
            <CombatSetupView
              matchStatus={matchStatus}
              currentPlayerData={currentPlayerData}
              combatMode={combatMode}
              onChangeCombatMode={handleCombatModeChange}
              availableAttacks={availableAttacks}
              selectedAttack={selectedAttack}
              onSelectAttack={setSelectedAttack}
              customAttack={customAttack}
              onChangeCustomAttack={setCustomAttack}
              availableTargets={availableTargets}
              selectedDefenders={selectedDefenders}
              onToggleDefender={handleToggleDefender}
              allowCounterAttack={allowCounterAttack}
              onChangeAllowCounterAttack={setAllowCounterAttack}
              allowOpportunityAttacks={allowOpportunityAttacks}
              onChangeAllowOpportunityAttacks={setAllowOpportunityAttacks}
              loading={loading}
              onStartCombat={handleStartCombat}
              localization={localization}
            />
          ) : effectivePhase === 'weapon_selection' ? (
            <CombatWeaponSelection
              combat={combat}
              combatGroup={combatGroup}
              currentPlayer={currentPlayer}
              currentPlayerData={currentPlayerData}
              combatMode={combatMode}
              availableWeapons={availableAttacks}
              selectedWeapon={selectedWeapon}
              onSelectWeapon={setSelectedWeapon}
              customAttack={customAttack}
              onChangeCustomAttack={setCustomAttack}
              onConfirmDefenseWeapon={handleConfirmDefenseWeapon}
              swapTargets={swapTargets}
              onSwapDefender={handleSwapDefender}
              onEndCombat={handleEndCombat}
              localization={localization}
            />
          ) : effectivePhase === 'rolling' ? (
            <CombatRollingView
              combat={combat}
              combatGroup={combatGroup}
              activeCombatId={activeCombatId}
              onSelectGroupCombat={handleSelectGroupCombat}
              currentPlayer={currentPlayer}
              currentPlayerData={currentPlayerData}
              players={players}
              combatMode={combatMode}
              onChangeCombatMode={handleCombatModeChange}
              tempWeapon={tempWeapon}
              onOpenWeaponChange={() => setShowWeaponChange(true)}
              currentDefenseDices={currentDefenseDices}
              onDefenseDicesChange={handleDefenseDicesChange}
              onAdjustDefenseDices={(delta) =>
                handleDefenseDicesChange(currentDefenseDices + delta)
              }
              rolling={rolling}
              rollingCombatId={rollingCombatId}
              diceAnimation={diceAnimation}
              onRollDice={handleRollDice}
              onAdjustDiceResult={handleAdjustDiceResult}
              onAdvanceRound={handleAdvanceRound}
              onAdvanceMultiRound1={handleAdvanceMultiRound1}
              onAdvanceSingleGroupDuel={handleAdvanceSingleGroupDuel}
              onShowGroupResults={handleShowGroupResults}
              onAddRound={handleAddRound}
              onRemoveRound={handleRemoveRound}
              onMoveRoundLeft={(idx) => handleMoveRound(idx, idx - 1)}
              onMoveRoundRight={(idx) => handleMoveRound(idx, idx + 1)}
              swapTargets={swapTargets}
              onSwapDefender={handleSwapDefender}
              availableAttacks={availableAttacks}
              onOpenOpportunityModal={() => setShowOpportunityAttack(true)}
              onEndCombat={handleEndCombat}
              localization={localization}
            />
          ) : (
            <CombatResultsView
              combat={combat}
              combatGroup={combatGroup}
              currentPlayer={currentPlayer}
              onEndCombat={handleEndCombat}
              localization={localization}
            />
          )}
        </div>
      </aside>

      <CombatModals
        showWeaponChange={showWeaponChange}
        onCloseWeaponChange={() => {
          setTempWeapon(null);
          setShowWeaponChange(false);
        }}
        tempWeapon={tempWeapon}
        onSelectTempWeapon={setTempWeapon}
        onConfirmWeaponChange={async (weapon) => {
          setShowWeaponChange(false);
          await handleConfirmWeaponChange(weapon);
        }}
        showOpportunityAttack={showOpportunityAttack}
        onCloseOpportunityAttack={() => {
          setShowOpportunityAttack(false);
          setOpportunityWeapon(null);
          setOpportunityTarget(null);
        }}
        opportunityTarget={opportunityTarget}
        onSelectOpportunityTarget={setOpportunityTarget}
        opportunityWeapon={opportunityWeapon}
        onSelectOpportunityWeapon={setOpportunityWeapon}
        onConfirmOpportunityAttack={async () => {
          const ok = await handleConfirmOpportunityAttack(opportunityWeapon, opportunityTarget);
          if (ok) {
            setShowOpportunityAttack(false);
            setOpportunityWeapon(null);
            setOpportunityTarget(null);
          }
        }}
        combat={combat}
        availableAttacks={availableAttacks}
        customAttack={customAttack}
        onChangeCustomAttack={setCustomAttack}
        actor={currentPlayerData?.character?.actor}
        combatMode={combatMode}
        localization={localization}
      />
    </>
  );
};

export default CombatPanel;