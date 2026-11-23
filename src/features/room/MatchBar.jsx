import React, { useState } from "react"
import { supabase } from '../../config/supabaseClient';

const MatchBar = ({
  room,
  roomId: roomIdProp,
  currentPlayer,
  players = [],
  matchStatus: matchStatusProp,
  isAlive = true,
  onMatchUpdate,
  localization = {}
}) => {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [showEliminateModal, setShowEliminateModal] = useState(false)
  const [selectedKillerId, setSelectedKillerId] = useState(null)

  const roomId = roomIdProp || room?.id
  const matchStatus = matchStatusProp !== undefined ? matchStatusProp : room?.match_status

  const connectedPlayers = players.filter((p) => p.is_connected !== false)
  const readyPlayers = connectedPlayers.filter((p) => p.status === "ready" || p.status === "playing")
  const alivePlayers = connectedPlayers.filter(
    (p) => (p.status === "ready" || p.status === "playing" || p.elimination_order != null) && p.is_alive !== false
  )

  // Regra: mínimo 2 jogadores na sala E TODOS os jogadores conectados prontos
  const hasMinPlayers = connectedPlayers.length >= 2
  const allPlayersReady = hasMinPlayers && readyPlayers.length === connectedPlayers.length
  const pendingCount = connectedPlayers.length - readyPlayers.length
  const canStartMatch = !matchStatus && allPlayersReady

  const isLastSurvivor = matchStatus === "in_progress" && isAlive && alivePlayers.length <= 1

  const notifyParent = () => {
    if (onMatchUpdate) onMatchUpdate()
  }

  const handleStartMatch = async () => {
    if (!roomId || loading || !canStartMatch) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase.rpc("start_match", {
        p_room_id: roomId
      })
      if (error) throw error
      if (data && data.success === false) {
        throw new Error(data.error || "Não foi possível iniciar a partida")
      }
      notifyParent()
    } catch (err) {
      setErrorMsg(err.message || "Erro ao iniciar partida")
    } finally {
      setLoading(false)
    }
  }

  const handleDeclareElimination = async () => {
    if (!currentPlayer?.id || loading) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase.rpc("declare_elimination", {
        p_player_id: currentPlayer.id,
        p_killer_player_id: selectedKillerId || null
      })
      if (error) throw error
      if (data && data.success === false) {
        throw new Error(data.error || "Erro ao declarar eliminação")
      }
      setShowEliminateModal(false)
      setSelectedKillerId(null)
      notifyParent()
    } catch (err) {
      setErrorMsg(err.message || "Erro ao declarar eliminação")
    } finally {
      setLoading(false)
    }
  }

  const handleEndMatch = async () => {
    if (!roomId || loading) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase.rpc("end_match", {
        p_room_id: roomId
      })
      if (error) throw error
      if (data && data.success === false) {
        throw new Error(data.error || "Erro ao encerrar partida")
      }
      notifyParent()
    } catch (err) {
      setErrorMsg(err.message || "Erro ao encerrar partida")
    } finally {
      setLoading(false)
    }
  }

  const otherPlayers = connectedPlayers.filter((p) => p.id !== currentPlayer?.id)

  const noKillerLabel = localization["UI.Match.NoKiller"] || "Ninguém / Ambiente / Efeito próprio"
  const cleanNoKillerLabel = noKillerLabel.replace(/^[^\p{L}\p{N}]+/u, "").trim()

  return (
    <>
      <section
        className={`card mb-3 ${
          matchStatus === "in_progress" ?
            isLastSurvivor ? "border-warning"
            : "border-danger"
          : canStartMatch ? "border-success"
          : "border-secondary"
        }`}
      >
        <div className="card-body py-2 px-3">
          <div className="d-flex flex-row justify-content-between align-items-center flex-wrap gap-2 w-100">
            {/* Estado 1: Antes da partida começar */}
            {!matchStatus && (
              <>
                <div className="d-flex align-items-center gap-2 flex-wrap text-start">
                  <span className="fw-bold text-white">⚔️ {localization["UI.Match.Preparation"] || "Preparação da Partida"}</span>
                  <span className={`badge ${allPlayersReady ? "bg-success" : "bg-secondary"}`}>
                    {readyPlayers.length} / {connectedPlayers.length} {localization["UI.Match.PlayersReady"] || "prontos"}
                  </span>
                  {!hasMinPlayers ?
                    <small className="text-muted">({localization["UI.Match.MinTwoPlayers"] || "Mínimo de 2 jogadores na sala para iniciar"})</small>
                  : !allPlayersReady ?
                    <small className="text-muted">
                      ({localization["UI.Match.WaitAllReady"] || `Aguardando todos ficarem prontos (falta ${pendingCount})`})
                    </small>
                  : null}
                </div>

                <button type="button" className="btn btn-success btn-sm px-3 fw-bold" disabled={!canStartMatch || loading} onClick={handleStartMatch}>
                  {loading ? "⏳ Iniciando..." : `⚔️ ${localization["UI.Match.StartMatch"] || "Iniciar Partida"}`}
                </button>
              </>
            )}

            {/* Estado 2: Partida em andamento */}
            {matchStatus === "in_progress" && (
              <>
                <div className="d-flex align-items-center gap-2 flex-wrap text-start">
                  <span className="badge bg-danger">🔥 {localization["UI.Match.InProgress"] || "Partida em Andamento"}</span>
                  <span className="badge bg-secondary">
                    🟢 {alivePlayers.length}{" "}
                    {alivePlayers.length === 1 ?
                      localization["UI.Match.SurvivorSingular"] || "sobrevivente"
                    : localization["UI.Match.SurvivorPlural"] || "sobreviventes"}
                  </span>
                  {!isAlive && (
                    <span className="badge bg-dark border border-danger text-danger">
                      💀 {localization["UI.Match.YouAreEliminated"] || "Você foi eliminado"}
                      {currentPlayer?.elimination_order ? ` (#${currentPlayer.elimination_order})` : ""}
                    </span>
                  )}
                </div>

                <div className="d-flex align-items-center gap-2 flex-wrap">
                  {isAlive && !isLastSurvivor && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      disabled={loading}
                      onClick={() => {
                        setSelectedKillerId(null)
                        setShowEliminateModal(true)
                      }}
                    >
                      💀 {localization["UI.Match.DeclareElimination"] || "Fui Eliminado"}
                    </button>
                  )}

                  {isLastSurvivor && (
                    <button type="button" className="btn btn-warning btn-sm fw-bold px-3" disabled={loading} onClick={handleEndMatch}>
                      {loading ? "⏳ Salvando..." : `🏆 ${localization["UI.Match.DeclareVictory"] || "Declarar Vitória e Encerrar"}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {errorMsg && (
            <div className="alert alert-danger py-1 px-2 mt-2 mb-0 small d-flex justify-content-between align-items-center">
              <span>⚠️ {errorMsg}</span>
              <button type="button" className="btn btn-sm btn-outline-light py-0 px-1" onClick={() => setErrorMsg(null)}>
                ✕
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Modal Visual de Eliminação */}
      {showEliminateModal && (
        <>
          <div className="modal-backdrop" onClick={() => !loading && setShowEliminateModal(false)} />
          <div className="modal show d-block" tabIndex="-1" onClick={(e) => e.target === e.currentTarget && !loading && setShowEliminateModal(false)}>
            <div className="modal-dialog" style={{ maxWidth: "520px" }}>
              <div className="modal-content border-danger">
                <header className="modal-header">
                  <div className="d-flex align-items-center gap-2 text-start">
                    <span style={{ fontSize: "1.35rem" }}>💀</span>
                    <div>
                      <h5 className="modal-title text-white fw-bold mb-0">{localization["UI.Match.ConfirmElimination"] || "Declarar Eliminação"}</h5>
                      <small className="text-muted">{localization["UI.Match.WhoEliminatedYou"] || "Quem eliminou você nesta rodada?"}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    style={{ width: "32px", height: "32px", padding: 0 }}
                    onClick={() => setShowEliminateModal(false)}
                    disabled={loading}
                  >
                    ✕
                  </button>
                </header>

                <div className="modal-body">
                  <div className="d-flex flex-column gap-2">
                    {otherPlayers.map((p) => {
                      const isSelected = selectedKillerId === p.id
                      const isOpponentDead = p.is_alive === false
                      return (
                        <div
                          key={p.id}
                          onClick={() => !loading && setSelectedKillerId(p.id)}
                          className={`card cursor-pointer ${isSelected ? "border-danger bg-danger bg-opacity-25" : "border-secondary"}`}
                          style={{ cursor: "pointer" }}
                        >
                          <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center gap-2">
                            <div className="d-flex align-items-center gap-2 text-start">
                              <span style={{ fontSize: "1.1rem" }}>⚔️</span>
                              <div>
                                <div className="fw-bold text-white d-flex align-items-center gap-2">
                                  <span>{p.name}</span>
                                  {isOpponentDead && (
                                    <span className="badge bg-secondary" style={{ fontSize: "0.65rem" }}>
                                      💀 Eliminado
                                    </span>
                                  )}
                                </div>
                                {p.character_name && <small className="text-muted">🎭 {p.character_name}</small>}
                              </div>
                            </div>
                            <span
                              className={`badge flex-shrink-0 ${isSelected ? "bg-danger text-white" : "bg-dark border border-secondary text-muted"}`}
                            >
                              {isSelected ? "✓ Selecionado" : "Selecionar"}
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    {/* Opção: Ninguém / Não sei */}
                    <div
                      onClick={() => !loading && setSelectedKillerId(null)}
                      className={`card cursor-pointer ${selectedKillerId === null ? "border-warning bg-warning bg-opacity-25" : "border-secondary"}`}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center gap-2">
                        <div className="d-flex align-items-center gap-2 text-start">
                          <span style={{ fontSize: "1.1rem" }}>🚫</span>
                          <div>
                            <div className="fw-bold text-white">{cleanNoKillerLabel}</div>
                            <small className="text-muted">Não contabiliza abate para outro jogador</small>
                          </div>
                        </div>
                        <span
                          className={`badge flex-shrink-0 ${
                            selectedKillerId === null ? "bg-warning text-dark" : "bg-dark border border-secondary text-muted"
                          }`}
                        >
                          {selectedKillerId === null ? "✓ Selecionado" : "Selecionar"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <footer>
                  <button type="button" className="btn btn-secondary btn-sm px-3" onClick={() => setShowEliminateModal(false)} disabled={loading}>
                    {localization["UI.Common.Cancel"] || "Cancelar"}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm fw-bold px-4" onClick={handleDeclareElimination} disabled={loading}>
                    {loading ? "⏳ Confirmando..." : `💀 ${localization["UI.Match.ConfirmDeath"] || "Confirmar Eliminação"}`}
                  </button>
                </footer>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default MatchBar
