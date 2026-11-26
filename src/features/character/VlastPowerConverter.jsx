import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"

/**
 * Verifica se o personagem atual é a Naja / Nyanja Vlast (por ID ou nome localizado)
 */
export const isVlastActor = (actor, localization = {}) => {
  if (!actor) return false
  const idStr = String(actor.ID ?? "").toLowerCase()
  const nameStr = String(localization[`Character.Name.${actor.ID}`] ?? "").toLowerCase()
  return idStr.includes("vlast") || idStr.includes("nyanja") || idStr.includes("naja") || nameStr.includes("vlast")
}

/**
 * Hook que gerencia a conversão de Poderes em Passivas da Naja/Nyanja Vlast
 */
export const useVlastPowerConversion = ({
  actor,
  localization = {},
  selections,
  currentPlayer,
  usedItemsRef,
  setUsedItems,
  onPlayerPatch,
  updatePlayerFields
}) => {
  const isVlast = useMemo(() => isVlastActor(actor, localization), [actor, localization])

  const [convertedPowers, setConvertedPowers] = useState(new Set())
  const convertedPowersRef = useRef(convertedPowers)
  const currentPlayerIdRef = useRef(currentPlayer?.id)
  currentPlayerIdRef.current = currentPlayer?.id

  // Sincroniza poderes convertidos salvos no banco (ex: após F5)
  const savedConvertedKey = JSON.stringify(currentPlayer?.selections?.convertedPowers || [])

  useEffect(() => {
    if (Array.isArray(currentPlayer?.selections?.convertedPowers)) {
      const next = new Set(currentPlayer.selections.convertedPowers)
      convertedPowersRef.current = next
      setConvertedPowers(next)
    }
  }, [savedConvertedKey])

  const persistConversion = useCallback(
    async (nextSet, nextUsedArr = null) => {
      const nextConvertedArr = Array.from(nextSet)
      const nextSelections = {
        ...(selections || {}),
        convertedPowers: nextConvertedArr
      }

      const patchPayload = nextUsedArr ? { selections: nextSelections, used_items: nextUsedArr } : { selections: nextSelections }

      if (typeof onPlayerPatch === "function") {
        onPlayerPatch(patchPayload)
      }

      if (currentPlayerIdRef.current && typeof updatePlayerFields === "function") {
        await updatePlayerFields(currentPlayerIdRef.current, patchPayload)
      }
    },
    [selections, onPlayerPatch, updatePlayerFields]
  )

  // Converte um Poder em Passiva ou reverte de volta para Poder
  const toggleConvertPower = useCallback(
    async (itemId) => {
      if (!isVlast || !itemId) return

      const nextSet = new Set(convertedPowersRef.current)
      const convertingToPassive = !nextSet.has(itemId)

      if (convertingToPassive) {
        nextSet.add(itemId)
      } else {
        nextSet.delete(itemId)
      }

      convertedPowersRef.current = nextSet
      setConvertedPowers(nextSet)

      // Ao virar Passiva, limpa o estado "Usado" caso o poder já estivesse gasto
      let nextUsedArr = null
      if (convertingToPassive && usedItemsRef?.current?.has(itemId)) {
        const nextUsed = new Set(usedItemsRef.current)
        nextUsed.delete(itemId)
        usedItemsRef.current = nextUsed
        if (typeof setUsedItems === "function") setUsedItems(nextUsed)
        nextUsedArr = Array.from(nextUsed)
      }

      await persistConversion(nextSet, nextUsedArr)
    },
    [isVlast, usedItemsRef, setUsedItems, persistConversion]
  )

  // Reverte todos os poderes convertidos de volta para a seção de Poderes
  const revertAllConvertedPowers = useCallback(async () => {
    if (!isVlast || convertedPowersRef.current.size === 0) return

    const emptySet = new Set()
    convertedPowersRef.current = emptySet
    setConvertedPowers(emptySet)

    await persistConversion(emptySet, null)
  }, [isVlast, persistConversion])

  // Limpa apenas o estado local ao trocar de personagem ou reiniciar a ficha
  const resetConvertedPowers = useCallback(() => {
    const emptySet = new Set()
    convertedPowersRef.current = emptySet
    setConvertedPowers(emptySet)
  }, [])

  // Restaura poderes convertidos salvos localmente (usado no Modo Solo após F5)
  const restoreConvertedPowers = useCallback((ids) => {
    const next = new Set(Array.isArray(ids) ? ids : [])
    convertedPowersRef.current = next
    setConvertedPowers(next)
  }, [])

  // Move automaticamente os itens convertidos da seção "powers" para "passives"
  const getSectionItems = useCallback(
    (sectionKey, defaultItems = []) => {
      if (!isVlast || convertedPowers.size === 0) {
        return defaultItems
      }

      if (sectionKey === "powers") {
        return defaultItems.filter((item) => !convertedPowers.has(item.ID))
      }

      if (sectionKey === "passives") {
        const convertedList = (selections?.powers || []).filter((item) => convertedPowers.has(item.ID))
        return [...defaultItems, ...convertedList]
      }

      return defaultItems
    },
    [isVlast, convertedPowers, selections?.powers]
  )

  const isConvertedPassive = useCallback(
    (sectionKey, itemId) => isVlast && sectionKey === "passives" && convertedPowers.has(itemId),
    [isVlast, convertedPowers]
  )

  return {
    isVlast,
    convertedPowers,
    convertedCount: convertedPowers.size,
    toggleConvertPower,
    revertAllConvertedPowers,
    resetConvertedPowers,
    restoreConvertedPowers,
    getSectionItems,
    isConvertedPassive
  };
}

/**
 * Selo exibido nos Poderes que foram convertidos em Passivas
 */
export const VlastConversionBadge = ({ isConverted, localization = {} }) => {
  if (!isConverted) return null

  return (
    <div className="mb-2">
      <span className="badge bg-success bg-opacity-25 border border-success text-success" style={{ fontSize: "0.7rem" }}>
        🌿 {localization["UI.Vlast.ConvertedBadge"] || "Poder convertido em Passiva"}
      </span>
    </div>
  )
}

/**
 * Botão exibido em cada carta de Poder ("Tornar Passiva") ou Passiva convertida ("Voltar p/ Poder")
 */
export const VlastConversionButton = ({ isVlast, sectionKey, itemId, isConverted, isBlocked = false, onToggleConvert, localization = {} }) => {
  if (!isVlast || isBlocked || typeof onToggleConvert !== "function") return null

  if (sectionKey === "powers") {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-success"
        onClick={() => onToggleConvert(itemId)}
        title={localization["UI.Vlast.ConvertTooltip"] || "Converter este poder em habilidade passiva"}
      >
        🌿 {localization["UI.Vlast.ConvertToPassive"] || "Tornar Passiva"}
      </button>
    )
  }

  if (isConverted) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={() => onToggleConvert(itemId)}
        title={localization["UI.Vlast.RevertTooltip"] || "Reverter esta passiva de volta para poder"}
      >
        ↩️ {localization["UI.Vlast.RevertToPower"] || "Voltar p/ Poder"}
      </button>
    )
  }

  return null
}

/**
 * Barra de resumo discreta para a Naja/Nyanja Vlast quando houver poderes convertidos
 */
const VlastPowerConverterBar = ({ isVlast, convertedCount = 0, onRevertAll, localization = {} }) => {
  if (!isVlast || convertedCount <= 0) return null

  return (
    <div className="card border-success mb-4 mx-auto" style={{ maxWidth: "640px" }}>
      <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 text-start">
          <span style={{ fontSize: "1.1rem" }}>🌿</span>
          <div>
            <div className="fw-bold text-success small">
              {localization["UI.Vlast.BarTitle"] || "Poderes Convertidos em Passivas"}: <span className="text-white">{convertedCount}</span>
            </div>
            <small className="text-muted" style={{ fontSize: "0.75rem" }}>
              {localization["UI.Vlast.BarHint"] || "Os poderes convertidos aparecem na seção de Passivas e não precisam ser gastos."}
            </small>
          </div>
        </div>

        <button type="button" className="btn btn-sm btn-outline-warning" onClick={onRevertAll}>
          ↩️ {localization["UI.Vlast.RevertAll"] || "Reverter Todos"}
        </button>
      </div>
    </div>
  )
}

export default VlastPowerConverterBar
