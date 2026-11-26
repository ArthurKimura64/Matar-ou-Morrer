import React, { useState, useMemo } from "react"
import { Utils } from "../../utils/cardFormatter"
import { sanitizeHtml } from "../../utils/sanitize"
import { buildDefinitionsIndex } from "../../utils/playerStateCodec"

function resolveExposedCardData(itemId, cardIndexes, localization) {
  if (itemId.startsWith("Description.")) {
    const actorId = itemId.replace("Description.", "")
    const description = localization[`Character.Description.${actorId}`]
    if (!description) return null

    const characterName = localization[`Character.Name.${actorId}`] || actorId
    return {
      cardColor: "secondary",
      title: `📖 ${localization["UI.TableCards.Description"] || "Descrição"}: ${characterName}`,
      subtitle: null,
      description
    }
  }

  if (itemId.startsWith("Reivolk.")) {
    const actorId = itemId.replace("Reivolk.", "")
    const characterName = localization[`Character.Name.${actorId}`] || actorId
    const reivolkTitle = localization[`Character.Reivolk.${actorId}.Title`]
    const reivolkDescription = localization[`Character.Reivolk.${actorId}.Description`]

    if (!reivolkTitle && !reivolkDescription) return null

    return {
      cardColor: "info",
      title: `⚡ ${localization["Characteristic.Reivolk.Title"] || "Modo Reivolk"}: ${characterName}`,
      subtitle: reivolkTitle,
      description: reivolkDescription || ""
    }
  }

  // Busca instantânea O(1) via Map
  const foundItem = cardIndexes.definitionsMap.get(itemId)
  if (!foundItem) return null

  let cardColor = "info"
  if (foundItem.ID.startsWith("Attack.") || foundItem.ID.startsWith("Weapon.")) {
    cardColor = "danger"
  } else if (foundItem.ID.startsWith("Passive.")) {
    cardColor = "success"
  } else if (foundItem.ID.startsWith("Power.")) {
    cardColor = "primary"
  } else if (foundItem.ID.startsWith("SpecialAbility.") || foundItem.ID.startsWith("PassiveSpecialAbility.")) {
    cardColor = "warning"
  }

  const needsTriggerPrefix = foundItem.ID.startsWith("Device.") || foundItem.ID.startsWith("Power.") || foundItem.ID.startsWith("SpecialAbility.")

  const title =
    needsTriggerPrefix ? Utils.createTriggerName(foundItem.ID, foundItem, localization) : localization[foundItem.ID] || foundItem.Name || foundItem.ID

  const ownerActor = cardIndexes.ownerActorMap.get(foundItem.ID) || null
  const isAttackOrWeapon = foundItem.ID.startsWith("Attack.") || foundItem.ID.startsWith("Weapon.")

  let description
  if (isAttackOrWeapon) {
    description =
      foundItem.modes && Utils.modeSystem.hasModes(ownerActor) ?
        Utils.createDualModeDescription(foundItem, localization, ownerActor)
      : Utils.createAttackDescription(foundItem, localization)
  } else if (foundItem.modeRestriction && Utils.modeSystem.hasModes(ownerActor)) {
    description = Utils.createModeRestrictedDescription(foundItem, localization, ownerActor)
  } else {
    description =
      localization[foundItem.Description] || foundItem.Description || localization["UI.TableCards.NoDescription"] || "Descrição não disponível"
  }

  return { cardColor, title, subtitle: null, description }
}

const TableCards = ({ players = [], currentPlayerId = null, onHideCard = null, gameData = {}, localization = {}, isOpen: isOpenProp, onToggle }) => {
  const [isOpenLocal, setIsOpenLocal] = useState(false)
  const isOpen = isOpenProp !== undefined ? isOpenProp : isOpenLocal

  const cardIndexes = useMemo(() => {
    if (gameData?.indexes?.definitionsMap && gameData?.indexes?.ownerActorMap) {
      return gameData.indexes
    }

    const definitionsMap = buildDefinitionsIndex(gameData)
    const ownerActorMap = new Map()
    const actorFields = [
      "UnlimitedAttacksData",
      "WeaponsData",
      "PassivesData",
      "DevicesData",
      "PowersData",
      "SpecialAbilitiesData",
      "PassiveSpecialAbilitiesData"
    ]

    ;(gameData?.ActorDefinitions || []).forEach((act) => {
      actorFields.forEach((field) => {
        if (Array.isArray(act[field])) {
          act[field].forEach((id) => {
            if (!ownerActorMap.has(id)) ownerActorMap.set(id, act)
          })
        }
      })
    })

    return { definitionsMap, ownerActorMap }
  }, [gameData])

  const toggleTableCards = () => {
    if (onToggle) {
      onToggle()
    } else {
      setIsOpenLocal(!isOpenLocal)
    }
  }

  const playersWithExposedCards = players.filter(
    (player) => player.is_connected !== false && Array.isArray(player.exposed_cards) && player.exposed_cards.length > 0
  )

  const exposedCountLabel = `${playersWithExposedCards.length} ${
    playersWithExposedCards.length === 1 ?
      localization["UI.Common.PlayerSingular"] || "jogador"
    : localization["UI.Common.PlayerPlural"] || "jogadores"
  }`

  return (
    <>
      {/* Botão flutuante (aba direita no desktop / barra inferior no celular) */}
      <button
        type="button"
        onClick={toggleTableCards}
        className={`btn btn-success sidebar-toggle-btn sidebar-toggle-table border border-light ${isOpen ? "is-open" : ""}`}
        title={
          isOpen ?
            localization["UI.TableCards.Close"] || "Fechar cartas na mesa"
          : `${localization["UI.TableCards.Toggle"] || "Cartas na Mesa"} (${exposedCountLabel})`
        }
      >
        <span className="sidebar-toggle-icon" aria-hidden="true">
          {isOpen ? "▶" : "👁️"}
        </span>
        <span className="sidebar-toggle-label">Mesa</span>

        {!isOpen && playersWithExposedCards.length > 0 && (
          <span className="badge bg-warning text-dark sidebar-toggle-badge">{playersWithExposedCards.length}</span>
        )}
      </button>

      {/* Fundo escuro quando aberto */}
      {isOpen && <div className="sidebar-backdrop" onClick={toggleTableCards} />}

      {/* Gaveta Lateral */}
      <aside
        className={`bg-dark border-start border-light game-sidebar ${isOpen ? "is-open" : ""}`}
        aria-label={localization["UI.TableCards.Title"] || "Cartas na Mesa"}
      >
        <header className="bg-success text-white p-3 border-bottom border-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="text-white mb-1 fw-bold">👁️ {localization["UI.TableCards.Title"] || "Cartas na Mesa"}</h6>
              <small className="text-light">
                {exposedCountLabel} {localization["UI.TableCards.WithExposedCards"] || "com cartas expostas"}
              </small>
            </div>
            <button
              type="button"
              onClick={toggleTableCards}
              className="btn btn-outline-light btn-sm"
              style={{ width: "32px", height: "32px" }}
              aria-label="Fechar cartas na mesa"
            >
              ✕
            </button>
          </div>
        </header>

        <div
          className="p-3"
          style={{
            height: "calc(100dvh - 80px)",
            overflowY: "auto",
            overflowX: "hidden"
          }}
        >
          {playersWithExposedCards.length === 0 ?
            <div className="text-center py-5 text-muted">
              <div className="mb-3" style={{ fontSize: "4rem", opacity: 0.3 }}>
                👁️
              </div>
              <h6 className="text-white mb-2">{localization["UI.TableCards.EmptyTable"] || "Mesa Vazia"}</h6>
              <p>{localization["UI.TableCards.NoCards"] || "Nenhum jogador expôs cartas na mesa ainda."}</p>
              <small className="text-muted">
                {localization["UI.TableCards.Hint"] || "Dica: Use o ícone do olho 👁️ nas habilidades da sua ficha para expor cartas."}
              </small>
            </div>
          : <div className="d-flex flex-column gap-3">
              {playersWithExposedCards.map((player) => (
                <section key={player.id} className="mb-3" aria-label={`Cartas expostas por ${player.name}`}>
                  <h6 className="text-primary mb-3 d-flex align-items-center gap-2">
                    <span>👤 {player.name}</span>
                    <span className="badge bg-secondary small">
                      {player.exposed_cards.length}{" "}
                      {player.exposed_cards.length === 1 ?
                        localization["UI.Common.CardSingular"] || "carta"
                      : localization["UI.Common.CardPlural"] || "cartas"}
                    </span>
                  </h6>
                  <div className="row g-2">
                    {player.exposed_cards.map((itemId) => {
                      const cardInfo = resolveExposedCardData(itemId, cardIndexes, localization)
                      if (!cardInfo) return null

                      const canHide = Boolean(currentPlayerId && player.id === currentPlayerId && typeof onHideCard === "function")

                      return (
                        <article key={itemId} className="col-12 mb-2">
                          <div
                            className={`card border-${cardInfo.cardColor} h-100 position-relative`}
                            style={{ background: "var(--bs-gray-800)", color: "#fff" }}
                          >
                            {canHide && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary position-absolute"
                                style={{
                                  top: "5px",
                                  right: "5px",
                                  width: "22px",
                                  height: "22px",
                                  padding: 0,
                                  fontSize: "11px"
                                }}
                                onClick={() => onHideCard(itemId)}
                                title={localization["UI.CharacterSheet.HideFromTable"] || "Ocultar da mesa"}
                                aria-label="Ocultar carta da mesa"
                              >
                                ✕
                              </button>
                            )}
                            <div className="card-body p-2">
                              <div className={`fw-bold text-${cardInfo.cardColor} mb-1 small ${canHide ? "pe-4" : ""}`}>{cardInfo.title}</div>
                              {cardInfo.subtitle && <div className="fw-bold text-info mb-1 small">{cardInfo.subtitle}</div>}
                              <div
                                className="mb-1 small"
                                style={{ fontSize: "0.85rem" }}
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(cardInfo.description) }}
                              />
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          }
        </div>
      </aside>
    </>
  )
}

export default TableCards
