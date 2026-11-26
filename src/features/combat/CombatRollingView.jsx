import React from "react"
import CombatantCard, { TurnStatusBanner } from "./CombatantCard"
import MultiTargetRollingView from "./MultiTargetRollingView"
import SwapDefenderControl from "./SwapDefenderControl"
import { parseAttackDices, parseDefenseDices } from "../../utils/combatHelpers"

/**
 * ============================================================================
 * FASE 2 DO COMBATE: ROLAGEM DE DADOS E GERENCIAMENTO (CombatRollingView.jsx)
 * ============================================================================
 * - Mostra o banner "É a sua vez!" indicando se o jogador deve atacar, defender ou aguardar.
 * - Mostra os indicadores de rodada no topo (permitindo reordenar rodadas futuras).
 * - Permite alterar equipamento, modo, dados de defesa (slider) e adicionar rodadas.
 * - Exibe os cards de Atacante VS Defensor com animação de dados e ajuste fino.
 * - Suporta Combate Multi-Alvo (Rodada 1 compartilhada + abas de contra-ataque).
 * ============================================================================
 */
const CombatRollingView = ({
  combat,
  combatGroup = [],
  activeCombatId,
  onSelectGroupCombat,
  currentPlayer,
  currentPlayerData,
  players = [],
  combatMode,
  onChangeCombatMode,
  tempWeapon,
  onOpenWeaponChange,
  currentDefenseDices,
  onDefenseDicesChange,
  onAdjustDefenseDices,
  rolling,
  diceAnimation,
  onRollDice,
  onAdjustDiceResult,
  onAdvanceRound,
  rollingCombatId,
  onAdvanceMultiRound1,
  onAdvanceSingleGroupDuel,
  onShowGroupResults,
  onAddRound,
  onRemoveRound,
  onMoveRoundLeft,
  onMoveRoundRight,
  swapTargets = [],
  onSwapDefender,
  availableAttacks = [],
  onOpenOpportunityModal,
  onEndCombat,
  localization = {}
}) => {
  const isAttacker = currentPlayer?.id === combat?.attacker_id
  const isDefender = currentPlayer?.id === combat?.defender_id
  const canDoOpportunity = currentPlayerData?.in_match === true && currentPlayerData?.is_alive !== false
  const isSpectator = !isAttacker && !isDefender

  const currentRound = combat.current_round
  const totalRounds = combat.total_rounds
  const roundData = combat.round_data || []
  const roundIndex = currentRound - 1
  const roundInfo = roundData[roundIndex] || {}

  const attackerRolled = roundInfo.attacker?.rolled || false
  const defenderRolled = roundInfo.defender?.rolled || false
  const isAttackerActing = roundInfo.action_type === "attack"
  const isOpportunityRound = roundInfo.action_type === "opportunity"
  const isOpportunityAttacker = isOpportunityRound && currentPlayer?.id === roundInfo.opportunity_attacker_id

  const attackingPlayerRolled = isAttackerActing ? attackerRolled : defenderRolled
  const isCurrentPlayerAttacking = isAttackerActing ? isAttacker : !isAttacker
  const hasCurrentPlayerRolled = isAttacker ? attackerRolled : defenderRolled
  const waitingForAttacker = !hasCurrentPlayerRolled && !isCurrentPlayerAttacking && !attackingPlayerRolled

  const canChangeEquipment = !isSpectator || isOpportunityAttacker
  const actor = currentPlayerData?.character?.actor
  const defaultActorDefense = parseDefenseDices(actor?.NumberOfDefenseDices, 0)

  // ==========================================================================
  // VISÃO MULTI-ALVO PARA O ATACANTE
  // ==========================================================================
  const activeGroup = combatGroup.filter((gc) => gc.status !== "cancelled")
  if (activeGroup.length > 1) {
    return (
      <MultiTargetRollingView
        combat={combat}
        combatGroup={combatGroup}
        activeCombatId={activeCombatId}
        onSelectGroupCombat={onSelectGroupCombat}
        currentPlayer={currentPlayer}
        currentPlayerData={currentPlayerData}
        players={players}
        combatMode={combatMode}
        onChangeCombatMode={onChangeCombatMode}
        tempWeapon={tempWeapon}
        onOpenWeaponChange={onOpenWeaponChange}
        currentDefenseDices={currentDefenseDices}
        onDefenseDicesChange={onDefenseDicesChange}
        onAdjustDefenseDices={onAdjustDefenseDices}
        rolling={rolling}
        rollingCombatId={rollingCombatId}
        diceAnimation={diceAnimation}
        onRollDice={onRollDice}
        onAdjustDiceResult={onAdjustDiceResult}
        onAdvanceMultiRound1={onAdvanceMultiRound1}
        onAdvanceSingleGroupDuel={onAdvanceSingleGroupDuel}
        onShowGroupResults={onShowGroupResults}
        onEndCombat={onEndCombat}
        localization={localization}
      />
    )
  }

  // ==========================================================================
  // VISÃO PADRÃO 1v1 (OU DEFENSOR / ESPECTADOR)
  // ==========================================================================
  let leftPlayer, rightPlayer

  if (isOpportunityRound) {
    leftPlayer = {
      name: roundInfo.opportunity_attacker_name || localization?.["UI.Combat.Spectator"] || "Espectador",
      weapon: roundInfo.opportunity_weapon?.Name || "Arma",
      rolled: roundInfo.attacker?.rolled || false,
      data: roundInfo.attacker,
      icon: "⚡"
    }
    const targetIsAttacker = roundInfo.opportunity_target === "attacker"
    rightPlayer = {
      name: targetIsAttacker ? combat.attacker_name : combat.defender_name,
      weapon: localization?.["UI.Combat.Defense"] || "Defesa",
      rolled: roundInfo.defender?.rolled || false,
      data: roundInfo.defender,
      icon: "🛡️"
    }
  } else if (isAttackerActing) {
    leftPlayer = {
      name: combat.attacker_name,
      weapon: combat.attack_data?.Name,
      rolled: attackerRolled,
      data: roundInfo.attacker,
      icon: "⚔️"
    }
    rightPlayer = {
      name: combat.defender_name,
      weapon: localization?.["UI.Combat.Defense"] || "Defesa",
      rolled: defenderRolled,
      data: roundInfo.defender,
      icon: "🛡️"
    }
  } else {
    leftPlayer = {
      name: combat.defender_name,
      weapon: combat.defender_weapon?.Name || "Arma",
      rolled: defenderRolled,
      data: roundInfo.defender,
      icon: "⚔️"
    }
    rightPlayer = {
      name: combat.attacker_name,
      weapon: localization?.["UI.Combat.Defense"] || "Defesa",
      rolled: attackerRolled,
      data: roundInfo.attacker,
      icon: "🛡️"
    }
  }

  // Calcula quem tem o turno ativo nesta rodada para o banner de destaque
  const offensePlayerId =
    isOpportunityRound ? roundInfo.opportunity_attacker_id
    : isAttackerActing ? combat.attacker_id
    : combat.defender_id

  const defensePlayerId =
    isOpportunityRound ?
      roundInfo.opportunity_target === "attacker" ?
        combat.attacker_id
      : combat.defender_id
    : isAttackerActing ? combat.defender_id
    : combat.attacker_id

  const isMyOffenseTurn = Boolean(currentPlayer?.id && currentPlayer.id === offensePlayerId)
  const isMyDefenseTurn = Boolean(currentPlayer?.id && currentPlayer.id === defensePlayerId)
  const bothSidesRolled = leftPlayer.rolled && rightPlayer.rolled

  let turnBanner
  if (bothSidesRolled) {
    turnBanner =
      isSpectator ?
        {
          variant: "secondary",
          icon: "✅",
          title: "Rodada concluída — aguardando avançar"
        }
      : {
          variant: "success",
          icon: "✅",
          title: currentRound >= totalRounds ? 'Combate concluído! Clique em "Ver Resultados".' : 'Rodada concluída! Clique em "Avançar Rodada".',
          highlight: true
        }
  } else if (isMyOffenseTurn && !leftPlayer.rolled) {
    turnBanner =
      isOpportunityRound ?
        {
          variant: "warning",
          icon: "⚡",
          title: "SUA VEZ: Role seu ATAQUE DE OPORTUNIDADE!",
          highlight: true
        }
      : {
          variant: "danger",
          icon: "🎲",
          title: isAttackerActing ? "SUA VEZ: Role seus dados de ATAQUE!" : "SUA VEZ: Role seus dados de CONTRA-ATAQUE!",
          highlight: true
        }
  } else if (isMyDefenseTurn && leftPlayer.rolled && !rightPlayer.rolled) {
    turnBanner = {
      variant: "info",
      icon: "🛡️",
      title: "SUA VEZ: Role seus dados de DEFESA!",
      highlight: true
    }
  } else if (!leftPlayer.rolled) {
    turnBanner = {
      variant: "secondary",
      icon: "⏳",
      title: `Aguardando ${leftPlayer.name} rolar o ataque...`
    }
  } else {
    turnBanner = {
      variant: "secondary",
      icon: "⏳",
      title: `Aguardando ${rightPlayer.name} rolar a defesa...`
    }
  }

  // Determina a arma ativa na rodada atual para exibir Dados/Tempo/Dano
  const activeOffensiveWeapon =
    isOpportunityRound ? roundInfo.opportunity_weapon
    : isAttackerActing ? combat.attack_data
    : combat.defender_weapon
  const weaponWithMode = activeOffensiveWeapon

  // Determina os dados de defesa de quem está se defendendo nesta rodada
  const getDefenderDiceDisplay = () => {
    let defenderId = combat.defender_id
    let dbDefenseField = combat.defender_defense_dices

    if (isOpportunityRound) {
      const targetIsAttacker = roundInfo.opportunity_target === "attacker"
      defenderId = targetIsAttacker ? combat.attacker_id : combat.defender_id
      dbDefenseField = targetIsAttacker ? combat.attacker_defense_dices : combat.defender_defense_dices
    } else if (!isAttackerActing) {
      defenderId = combat.attacker_id
      dbDefenseField = combat.attacker_defense_dices
    }

    if (defenderId === currentPlayer?.id) return currentDefenseDices
    if (dbDefenseField !== null && dbDefenseField !== undefined) return dbDefenseField

    const targetPlayer = players.find((p) => p.id === defenderId)
    return parseDefenseDices(targetPlayer?.defense_dice_count ?? targetPlayer?.character?.actor?.NumberOfDefenseDices, 0)
  }

  return (
    <>
      {/* Banner claro indicando de quem é a vez */}
      <TurnStatusBanner {...turnBanner} />

      {/* Painel do Espectador e Botão de Ataque de Oportunidade */}
      {isSpectator && (
        <>
          <div className="alert alert-warning mb-2 py-2 px-3">
            <small>
              <strong>{localization?.["UI.Combat.SpectatorMode"] || "👁️ Modo Espectador"}</strong>
              <br />
              {localization?.["UI.Combat.SpectatorWatching"] || "Você está assistindo este combate."}
            </small>
          </div>

          {canDoOpportunity &&
            combat.allow_opportunity_attacks &&
            !combat.opportunity_attacks_used?.includes(currentPlayer?.id) &&
            availableAttacks.length > 0 && (
              <button type="button" className="btn btn-warning w-100 mb-2" onClick={onOpenOpportunityModal}>
                {localization?.["UI.Combat.OpportunityAttack"] || "⚡ Dar Ataque de Oportunidade"}
              </button>
            )}

          {combat.opportunity_attacks_used?.includes(currentPlayer?.id) && (
            <div className="alert alert-secondary mb-2 py-1 px-2">
              <small style={{ fontSize: "10px" }}>
                {localization?.["UI.Combat.OpportunityUsed"] || "✅ Você já usou seu ataque de oportunidade"}
              </small>
            </div>
          )}
        </>
      )}

      {/* Indicadores de Rodada no Topo */}
      <div className="combat-round-header mb-2">
        <div className="round-info">
          <span className="round-label">
            {localization?.["UI.Combat.Round"] || "Rodada"} {currentRound}/{totalRounds}
          </span>
        </div>
        <div className="round-indicators">
          {roundData.map((r, idx) => {
            let colorClass = "round-dot-attack"
            let actionLabel = localization?.["UI.Combat.RoundType.Attack"] || "Ataque"

            if (r.action_type === "opportunity") {
              colorClass = "round-dot-opportunity"
              actionLabel = localization?.["UI.Combat.RoundType.Opportunity"] || "Oportunidade"
            } else if (r.action_type === "counter") {
              colorClass = "round-dot-counter"
              actionLabel = localization?.["UI.Combat.RoundType.Counter"] || "Contra"
            }

            const isCompleted = r.completed
            const isCurrent = idx + 1 === currentRound

            return (
              <div key={idx} className="round-dot-container">
                <div
                  className={`round-dot ${colorClass} ${isCurrent ? "round-dot-active" : ""} ${isCompleted ? "round-dot-completed" : ""}`}
                  title={`${idx + 1}: ${actionLabel}`}
                >
                  <span className="round-dot-number">{idx + 1}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gaveta de Ajustes de Equipamento, Defesa e Rodadas */}
      {canChangeEquipment && (
        <div className="mb-2">
          {/* Barra de acesso rápido (1 toque) */}
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2 p-2 rounded border border-secondary bg-dark">
            <button
              type="button"
              className="btn btn-sm btn-outline-warning flex-fill"
              onClick={onOpenWeaponChange}
            >
              {localization?.["UI.Combat.ChangeWeapon"] || "⚔️ Trocar Arma"}{" "}
              {tempWeapon && (localization?.["UI.Combat.Changed"] || "(Alterada)")}
            </button>

            {!isSpectator && (
              <div className="d-flex align-items-center gap-1">
                <small className="text-muted me-1">🛡️</small>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary px-2 py-0"
                  style={{ minWidth: "30px", height: "30px" }}
                  onClick={() => onAdjustDefenseDices(-1)}
                  disabled={currentDefenseDices <= 0}
                  title="Diminuir 1 dado de defesa"
                >
                  −
                </button>
                <span className="badge bg-primary px-2">{currentDefenseDices}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary px-2 py-0"
                  style={{ minWidth: "30px", height: "30px" }}
                  onClick={() => onAdjustDefenseDices(1)}
                  disabled={currentDefenseDices >= 8}
                  title="Aumentar 1 dado de defesa"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* Opções avançadas recolhidas */}
          <div className="weapon-info-panel">
            <details className="weapon-details">
              <summary className="weapon-summary">
                <span className="weapon-icon">⚙️</span>
                <span className="weapon-label">
                  {isSpectator ? "Modo de Combate" : "Opções avançadas (Rodadas e Defensor)"}
                  {actor?.mode1 && actor?.mode2 && (
                    <span className="weapon-mode-indicator">
                      {localization?.[actor[combatMode]] || actor[combatMode] || combatMode}
                    </span>
                  )}
                </span>
                <span className="toggle-icon">▼</span>
              </summary>

              <div className="weapon-details-content">
                {/* Mantenha aqui dentro: Modo de Combate + {!isSpectator && (Slider de Defesa, Reordenar, Gerenciar Rodadas, Trocar Defensor)} */}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Cards de Combatentes: Quem Ataca (Topo) VS Quem Defende (Baixo) */}
      <section className="combatants-container mb-2" aria-label="Combatentes da rodada">
        <CombatantCard
          role="attacker"
          icon={leftPlayer.icon}
          name={leftPlayer.name}
          weaponName={leftPlayer.weapon}
          stats={
            <div className="weapon-stats-compact">
              <span className="stat-compact">🎲 {weaponWithMode?.Dices ?? "?"}</span>
              <span className="stat-compact">⚡ {weaponWithMode?.LoadTime ?? "?"}</span>
              <span className="stat-compact">💥 {weaponWithMode?.Damage ?? "0"}</span>
            </div>
          }
          isRolling={rolling && isMyOffenseTurn}
          diceAnimation={diceAnimation}
          minDieValue={parseAttackDices(weaponWithMode?.Dices, 0) === 0 ? 0 : 1}
          rolled={Boolean(leftPlayer.rolled && leftPlayer.data)}
          diceArray={leftPlayer.data?.roll || []}
          canAdjust={isMyOffenseTurn}
          onAdjust={(newDice) => onAdjustDiceResult(newDice, isOpportunityRound ? true : isAttackerActing)}
          canRoll={isMyOffenseTurn}
          rollDisabled={isOpportunityRound ? false : waitingForAttacker}
          rollLabel={localization?.["UI.Combat.Roll"] || "Rolar"}
          onRoll={onRollDice}
          waitingText={isSpectator ? localization?.["UI.Combat.Spectator"] || "Espectador" : localization?.["UI.Combat.Waiting"] || "Aguardando..."}
          localization={localization}
        />

        <div className="vs-divider">
          <span className="vs-text">VS</span>
        </div>

        <CombatantCard
          role="defender"
          icon={rightPlayer.icon}
          name={rightPlayer.name}
          weaponName={rightPlayer.weapon}
          stats={
            <div className="weapon-stats-compact weapon-stats-enemy">
              <span className="stat-compact" title={localization?.["UI.Combat.DefenseDiceTitle"] || "Dados de Defesa"}>
                🛡️ {getDefenderDiceDisplay()}
              </span>
            </div>
          }
          isRolling={rolling && isMyDefenseTurn}
          diceAnimation={diceAnimation}
          minDieValue={getDefenderDiceDisplay() === 0 ? 0 : 1}
          rolled={Boolean(rightPlayer.rolled && rightPlayer.data)}
          diceArray={rightPlayer.data?.roll || []}
          canAdjust={isMyDefenseTurn}
          onAdjust={(newDice) => onAdjustDiceResult(newDice, isOpportunityRound ? false : !isAttackerActing)}
          canRoll={isMyDefenseTurn && leftPlayer.rolled}
          rollLabel={localization?.["UI.Combat.Roll"] || "Rolar"}
          onRoll={onRollDice}
          waitingText={
            isSpectator ? localization?.["UI.Combat.Spectator"] || "Espectador"
            : waitingForAttacker || (isOpportunityRound && !roundInfo.attacker?.rolled) ?
              localization?.["UI.Combat.WaitForAttacker"] || "Aguarde atacante..."
            : localization?.["UI.Combat.Waiting"] || "Aguardando..."
          }
          localization={localization}
        />
      </section>

      {/* Botão de Avançar Rodada */}
      {attackerRolled && defenderRolled && !rolling && !isSpectator && (
        <button type="button" className="btn-combat-advance mb-2" onClick={onAdvanceRound}>
          <span className="combat-btn-icon">{currentRound >= totalRounds ? "✅" : "➡️"}</span>
          <span className="combat-btn-text">
            {currentRound >= totalRounds ?
              localization?.["UI.Combat.ViewResults"] || "Ver Resultados"
            : localization?.["UI.Combat.AdvanceRound"] || "Avançar Rodada"}
          </span>
        </button>
      )}

      {!isSpectator && (
        <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
          <span className="me-2">🚫</span>
          {localization?.["UI.Combat.EndCombat"] || "Encerrar Combate"}
        </button>
      )}
    </>
  )
}

export default CombatRollingView
