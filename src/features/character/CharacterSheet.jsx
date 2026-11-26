import React, { useMemo, useState } from "react"
import Counter from "../../components/Counter"
import SquaresCounter from "../../components/SquaresCounter"
import ConfirmModal from "../../components/ConfirmModal"
import CharacteristicCard from "./CharacteristicCard"
import AdditionalCounters from "./AdditionalCounters"
import SpecialCharacteristics from "./SpecialCharacteristics"
import CopycatSection from "./CopycatSection"
import SheetItemCard from "./SheetItemCard"
import VlastPowerConverterBar from "./VlastPowerConverter"
import { useCharacterSheet } from "../../hooks/useCharacterSheet"
import { Utils } from "../../utils/cardFormatter"
import { sanitizeHtml } from "../../utils/sanitize"
import "./CharacterSheet.css"

const CharacterSheet = ({
  actor,
  selections,
  gameData,
  localization = {},
  onReset,
  onPlayerPatch,
  onPrivateStatePatch,
  currentPlayer,
  players = [],
  matchStatus,
  isAlive,
  isInMatch = false,
  currentMode: currentModeProp,
  onChangeMode,
  onQuickAttack = null,
  matchStartedAt = null
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSoftResetConfirm, setShowSoftResetConfirm] = useState(false)

  const {
    isSoloMode,
    currentMode,
    handleModeChange,
    counters,
    killCount,
    usedItems,
    unlockedItems,
    additionalCounters,
    exposedCards,
    copycatAssignments,
    isCopycat,
    copycatSlots,
    vlast,
    handleCounterChange,
    handleSoloKillsChange,
    handleAdditionalCounterChange,
    handleUseItem,
    handleUnlockItem,
    handleRecoverItems,
    handleLockItems,
    handleToggleCardExposure,
    handleAssignCopy,
    handleReset
  } = useCharacterSheet({
    actor,
    selections,
    gameData,
    localization,
    onReset,
    onPlayerPatch,
    onPrivateStatePatch,
    currentPlayer,
    players,
    currentModeProp,
    onChangeMode,
    matchStatus,
    matchStartedAt,
    isInMatch
  })

  const canQuickAttack = !isSoloMode && matchStatus === "in_progress" && isInMatch && isAlive !== false && typeof onQuickAttack === "function"

  const itemSections = useMemo(
    () => [
      { key: "attacks", group: "combat", title: localization["Characteristic.Attack.Title"], color: "danger", type: "attack" },
      { key: "weapons", group: "combat", title: localization["Characteristic.Weapon.Title"], color: "danger", type: "weapon" },
      { key: "passives", group: "passives", title: localization["Characteristic.Passive.Title"], color: "success", type: "passive" },
      { key: "devices", group: "consumables", title: localization["Characteristic.Device.Title"], color: "info", type: "device", useButton: true },
      { key: "powers", group: "consumables", title: localization["Characteristic.Power.Title"], color: "primary", type: "power", useButton: true },
      {
        key: "specials",
        group: "specials",
        title: localization["Characteristic.SpecialAbility.Title"],
        color: "warning",
        type: "special",
        useButton: true
      },
      {
        key: "passiveSpecials",
        group: "specials",
        title: localization["Characteristic.PassiveSpecialAbility.Title"],
        color: "warning",
        type: "passiveSpecial"
      }
    ],
    [localization]
  )

  const actorDisplayName = localization[`Character.Name.${actor.ID}`] || actor.ID

  const renderItemSection = (section) => {
    const items = vlast.getSectionItems(section.key, selections[section.key] || [])
    if (!items.length) return null

    const isPassiveSpecial = section.type === "passiveSpecial"
    const isSpecial = section.type === "special"
    const unlockedCount = isPassiveSpecial || isSpecial ? items.filter((it) => unlockedItems.has(it.ID)).length : 0

    return (
      <section key={section.key} className="mb-4" aria-label={section.title}>
        <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
          <h4 className={`text-${section.color} mb-0`}>{section.title}:</h4>
          {(isPassiveSpecial || isSpecial) && (
            <span className="badge bg-dark border border-warning text-warning" style={{ fontSize: "0.75rem" }}>
              🔓 {unlockedCount}/{items.length} desbloqueada(s) • 💀 Abates: {killCount}
            </span>
          )}
        </div>

        <div className="row g-2 mb-2 justify-content-center">
          {items.map((item) => {
            const isBlocked =
              Utils.transformationSystem.hasTransformation(actor) && !Utils.transformationSystem.canUseItem(item, currentMode === "mode2", actor)

            return (
              <SheetItemCard
                key={item.ID}
                item={item}
                section={section}
                actor={actor}
                currentMode={currentMode}
                localization={localization}
                isBlocked={isBlocked}
                isUsed={usedItems.has(item.ID)}
                isUnlocked={unlockedItems.has(item.ID)}
                isExposed={exposedCards.has(item.ID)}
                isConverted={vlast.isConvertedPassive(section.key, item.ID)}
                isVlast={vlast.isVlast}
                onToggleExposure={handleToggleCardExposure}
                onUnlockItem={handleUnlockItem}
                onUseItem={handleUseItem}
                onToggleConvertPower={vlast.toggleConvertPower}
                onQuickAttack={canQuickAttack ? onQuickAttack : null}
              />
            )
          })}
        </div>

        {(isPassiveSpecial || isSpecial) && (
          <div className="text-center mb-4 d-flex justify-content-center gap-2 flex-wrap">
            {section.useButton && !isPassiveSpecial && (
              <button type="button" className={`btn btn-sm btn-${section.color}`} onClick={() => handleRecoverItems(section.key)}>
                {localization["UI.CharacterSheet.RecoverAll"] || "Recuperar"} {section.title}
              </button>
            )}
            <button type="button" className={`btn btn-sm btn-outline-${section.color}`} onClick={() => handleLockItems(section.key)}>
              🔒 {localization["UI.CharacterSheet.LockAll"] || "Bloquear Todos"}
            </button>
          </div>
        )}

        {section.useButton && !isPassiveSpecial && !isSpecial && (
          <div className="text-center mb-4">
            <button type="button" className={`btn btn-sm btn-${section.color}`} onClick={() => handleRecoverItems(section.key)}>
              {localization["UI.CharacterSheet.RecoverAll"] || "Recuperar"} {section.title}
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <article className="card col-12 mx-auto my-3 p-3 md:p-4" aria-label="Ficha do Personagem">
        <header>
          <h2 className="text-center mb-1 h4 text-muted">{localization["UI.CharacterSheet.Title"] || "Ficha do Personagem"}</h2>
          <h3 className="text-center mb-3 text-white fw-bold">
            {actorDisplayName} ({localization[`Character.Title.${actor.ID}`] || ""})
          </h3>

          <div className="text-center mb-3">
            {matchStatus === "in_progress" && isInMatch && isAlive ? (
              <span className="text-muted small">
                {localization["UI.CharacterSheet.MatchInProgress"] || "⚔️ Partida em andamento — declare eliminação para trocar de personagem"}
              </span>
            ) : (
              <div className="d-flex justify-content-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-outline-info btn-sm px-3"
                  onClick={() => setShowSoftResetConfirm(true)}
                  title="Zera vida, pulos, itens usados e cartas expostas mantendo o mesmo personagem"
                >
                  ✨ Limpar Ficha
                </button>
                <button type="button" className="btn btn-secondary btn-sm px-3" onClick={() => setShowResetConfirm(true)}>
                  🔄 {localization["UI.CharacterSheet.Reset"] || "Trocar Personagem"}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Descrição do Personagem */}
        {localization[`Character.Description.${actor.ID}`] && (
          <section className="col-12 mb-4 px-2" aria-label="Descrição do personagem">
            <div className="d-flex justify-content-end mb-2">
              <button
                type="button"
                className={`btn btn-sm ${exposedCards.has(`Description.${actor.ID}`) ? "btn-success" : "btn-outline-secondary"}`}
                style={{ width: "28px", height: "28px", padding: 0, fontSize: "14px" }}
                onClick={() => handleToggleCardExposure(`Description.${actor.ID}`)}
                title={
                  exposedCards.has(`Description.${actor.ID}`) ?
                    localization["UI.CharacterSheet.HideDescFromTable"] || "Ocultar descrição da mesa"
                  : localization["UI.CharacterSheet.ExposeDescOnTable"] || "Expor descrição na mesa"
                }
              >
                👁️
              </button>
            </div>
            <div
              className="col-12"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(localization[`Character.Description.${actor.ID}`])
              }}
            />
          </section>
        )}

        {/* Botões de Alternância de Modo (sempre visível para personagens com 2 modos) */}
        {Utils.transformationSystem.hasTransformation(actor) && (
          <section className="text-center mb-3" aria-label="Modo de combate do personagem">
            <div className="btn-group" role="group">
              {Utils.modeSystem.getModes(actor).map((mode) => (
                <React.Fragment key={mode}>
                  <input
                    type="radio"
                    className="btn-check"
                    name="transformation-mode"
                    id={`mode-${mode}`}
                    checked={currentMode === mode}
                    onChange={() => handleModeChange(mode)}
                  />
                  <label className={`btn btn-outline-${mode === "mode2" ? "danger" : "warning"}`} htmlFor={`mode-${mode}`}>
                    {Utils.modeSystem.getModeName(actor, mode, localization)}
                  </label>
                </React.Fragment>
              ))}
            </div>
            <div className="mt-2 small text-muted">{Utils.transformationSystem.getTransformationName(actor, localization)}</div>
          </section>
        )}

        {/* Contadores Principais e Características */}
        {
          <>
            <section className="mb-3 character-sheet-counters text-center" aria-label="Contadores principais">
              <Counter
                id="vida"
                title={localization["Characteristic.Health"] || "Vida"}
                value={counters.vida}
                min={0}
                max={null}
                quickStep={5}
                onChange={(value) => handleCounterChange("vida", value)}
              />
              <SquaresCounter
                id="esquiva"
                title={localization["Characteristic.DodgePoints"] || "Pulo/Empurro"}
                value={counters.esquiva}
                min={0}
                max={counters.esquiva_max}
                onChange={(value) => handleCounterChange("esquiva", value)}
                localization={localization}
              />
              <SquaresCounter
                id="oport"
                title={localization["Characteristic.OportunityAttack"] || "Ataque de Oportunidade"}
                value={counters.oport}
                min={0}
                max={counters.oport_max}
                onChange={(value) => handleCounterChange("oport", value)}
                localization={localization}
              />
              <SquaresCounter
                id="item"
                title={localization["Characteristic.ExplorationItens"] || "Itens de Exploração"}
                value={counters.item}
                min={0}
                max={counters.item_max}
                onChange={(value) => handleCounterChange("item", value)}
                localization={localization}
              />
              <Counter
                id="mortes"
                title={localization["Characteristic.Kills"] || "Abates"}
                value={killCount}
                min={0}
                max={null}
                readOnly={!isSoloMode}
                onChange={isSoloMode ? handleSoloKillsChange : undefined}
              />
            </section>

            <div className="row justify-content-center">
              <CharacteristicCard
                actor={actor}
                localization={localization}
                deathCount={killCount}
                exposedCards={exposedCards}
                onToggleCardExposure={handleToggleCardExposure}
              />
            </div>
          </>
        }

        {/* Barra de resumo da Naja/Nyanja Vlast */}
        <VlastPowerConverterBar
          isVlast={vlast.isVlast}
          convertedCount={vlast.convertedCount}
          onRevertAll={vlast.revertAllConvertedPowers}
          localization={localization}
        />

        {/* Seções de Cartas */}
        {itemSections.length > 0 && (
          <div id="character-items">
            {!isCopycat && itemSections.map(renderItemSection)}
            {isCopycat &&
              itemSections.map((section) =>
                selections[section.key]?.length > 0 ?
                  renderItemSection(section)
                : <CopycatSection
                    key={`copycat-${section.key}`}
                    section={section}
                    totalSlots={copycatSlots[section.key] || 0}
                    actor={actor}
                    currentMode={currentMode}
                    players={players}
                    gameData={gameData}
                    localization={localization}
                    copycatAssignments={copycatAssignments}
                    onAssignCopy={handleAssignCopy}
                    exposedCards={exposedCards}
                    onToggleCardExposure={handleToggleCardExposure}
                    usedItems={usedItems}
                    onUseItem={handleUseItem}
                    onRecoverItems={() => handleRecoverItems(section.key)}
                    unlockedItems={unlockedItems}
                    onUnlockItem={handleUnlockItem}
                    onLockItems={() => handleLockItems(section.key)}
                  />
              )}
          </div>
        )}

        {/* Contadores Especiais e Anotações */}
        {
          <>
            <AdditionalCounters additionalCounters={additionalCounters} onCounterChange={handleAdditionalCounterChange} localization={localization} />

            <SpecialCharacteristics
              actor={actor}
              gameData={gameData}
              localization={localization}
              additionalCounters={additionalCounters}
              onCounterChange={handleAdditionalCounterChange}
            />
          </>
        }
      </article>

      <ConfirmModal
        show={showResetConfirm}
        title="🔄 Reiniciar Ficha"
        message={`Tem certeza que deseja reiniciar a ficha de ${actorDisplayName} e voltar para a escolha de personagem?`}
        confirmLabel="Sim, reiniciar"
        cancelLabel={localization["UI.Common.Cancel"] || "Cancelar"}
        confirmVariant="warning"
        onConfirm={() => {
          setShowResetConfirm(false)
          handleReset()
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
      <ConfirmModal
        show={showSoftResetConfirm}
        title="✨ Limpar Ficha"
        message={`Restaurar Vida, Pulos, Contadores, Consumíveis e Especiais de ${actorDisplayName} mantendo a mesma build?`}
        confirmLabel="Sim, limpar ficha"
        cancelLabel={localization["UI.Common.Cancel"] || "Cancelar"}
        confirmVariant="info"
        onConfirm={() => {
          setShowSoftResetConfirm(false)
          handleSoftReset()
        }}
        onCancel={() => setShowSoftResetConfirm(false)}
      />
    </>
  )
}

export default CharacterSheet
