import React, { useState, useCallback } from "react"
import { RoomService } from "../../services/roomService"
import BaseModal from "../../components/BaseModal"
import ConfirmModal from "../../components/ConfirmModal"

const MatchBar = ({
  room,
  roomId: roomIdProp,
  currentPlayer,
  players = [],
  matchStatus: matchStatusProp,
  isAlive = true,
  isInMatch = false,
  onMatchUpdate,
  localization = {}
}) => {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [showEliminateModal, setShowEliminateModal] = useState(false)
  const [showVictoryModal, setShowVictoryModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedKillerId, setSelectedKillerId] = useState(null)

  const closeEliminateModal = useCallback(() => {
    if (!loading) setShowEliminateModal(false)
  }, [loading])

  const roomId = roomIdProp || room?.id
  const matchStatus = matchStatusProp !== undefined ? matchStatusProp : room?.match_status

  const connectedPlayers = players.filter((p) => p.is_connected !== false)
  const readyPlayers = connectedPlayers.filter((p) => p.status === "ready" || p.status === "playing")
  
  const matchParticipants = players.filter((p) => p.in_match === true)
  const alivePlayers = matchParticipants.filter((p) => p.is_alive !== false)

  const hasMinPlayers = connectedPlayers.length >= 2
  const allPlayersReady = hasMinPlayers && readyPlayers.length === connectedPlayers.length
  const pendingCount = connectedPlayers.length - readyPlayers.length
  const canStartMatch = !matchStatus && allPlayersReady

  const isMaster = Boolean(room?.master_player_id && currentPlayer?.id && room.master_player_id === currentPlayer.id)
  const isLastSurvivor =
    matchStatus === "in_progress" &&
    isInMatch &&
    isAlive &&
    alivePlayers.length === 1 &&
    alivePlayers[0]?.id === currentPlayer?.id

  const notifyParent = (roomPatch = null) => {
    if (onMatchUpdate) onMatchUpdate(roomPatch)
  }

  const handleStartMatch = async () => {
    if (!roomId || loading || !canStartMatch) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await RoomService.startMatch(roomId)
      if (!res.success) {
        throw new Error(res.error || "Não foi possível iniciar a partida")
      }
      notifyParent({
        match_status: "in_progress",
        match_started_at: new Date().toISOString()
      })
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
      const res = await RoomService.declareElimination(currentPlayer.id, selectedKillerId || null)
      if (!res.success) {
        throw new Error(res.error || "Erro ao declarar eliminação")
      }
      setShowEliminateModal(false)
      setSelectedKillerId(null)
      notifyParent(null)
    } catch (err) {
      setErrorMsg(err.message || "Erro ao declarar eliminação")
    } finally {
      setLoading(false)
    }
  }

  const handleEndMatch = async () => {
    if (!roomId || loading) return
    setShowVictoryModal(false)
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await RoomService.declareVictory(roomId)
      if (!res.success) {
        throw new Error(res.error || "Erro ao encerrar partida")
      }
      notifyParent({
        match_status: null,
        match_started_at: null
      })
    } catch (err) {
      setErrorMsg(err.message || "Erro ao encerrar partida")
    } finally {
      setLoading(false)
    }
  }

  const handleCancelMatch = async () => {
    if (!roomId || loading) return
    setShowCancelModal(false)
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await RoomService.cancelMatch(roomId)
      if (!res.success) {
        throw new Error(res.error || "Erro ao cancelar partida")
      }
      notifyParent({
        match_status: null,
        match_started_at: null
      })
    } catch (err) {
      setErrorMsg(err.message || "Erro ao cancelar partida")
    } finally {
      setLoading(false)
    }
  }

  const otherPlayers = matchParticipants.filter((p) => p.id !== currentPlayer?.id)

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

            {matchStatus === "in_progress" && (
              <>
                <div className="d-flex align-items-center gap-2 flex-wrap text-start">
                  <span className="badge bg-danger">🔥 {localization["UI.Match.InProgress"] || "Partida em Andamento"}</span>
                  <span className="badge bg-secondary">
                    🟢 {alivePlayers.length}{" "}
                    {alivePlayers.length === 1
                      ? localization["UI.Match.SurvivorSingular"] || "sobrevivente"
                      : localization["UI.Match.SurvivorPlural"] || "sobreviventes"}
                  </span>

                  {!isInMatch && (
                    <span className="badge bg-dark border border-info text-info">
                      👁️ Espectador — monte seu personagem para a próxima partida
                    </span>
                  )}

                  {isInMatch && !isAlive && (
                    <span className="badge bg-dark border border-danger text-danger">
                      💀 {localization["UI.Match.YouAreEliminated"] || "Você foi eliminado"}
                      {currentPlayer?.elimination_order ? ` (#${currentPlayer.elimination_order})` : ""}
                    </span>
                  )}
                </div>

                <div className="d-flex align-items-center gap-2 flex-wrap">
                  {isInMatch && isAlive && !isLastSurvivor && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      disabled={loading}
                      onClick={() => {
                        setSelectedKillerId(null)
                        setShowEliminateModal(true)
                      }}
                    >
                      💀 {localization["UI.Match.DeclareEliminated"] || "Fui Eliminado"}
                    </button>
                  )}

                  {isLastSurvivor && (
                    <button
                      type="button"
                      className="btn btn-warning btn-sm fw-bold px-3"
                      disabled={loading}
                      onClick={() => setShowVictoryModal(true)}
                    >
                      {loading ? "⏳ Salvando..." : `🏆 ${localization["UI.Match.DeclareVictory"] || "Declarar Vitória e Encerrar"}`}
                    </button>
                  )}

                  {isMaster && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled={loading}
                      onClick={() => setShowCancelModal(true)}
                      title="Cancelar partida em andamento sem salvar no histórico"
                    >
                      ⏹️ Cancelar
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
      <BaseModal
        show={showEliminateModal}
        onClose={closeEliminateModal}
        title={`💀 ${localization['UI.Match.ConfirmElimination'] || "Declarar Eliminação"}`}
        subtitle={localization['UI.Match.WhoKilledYou'] || "Quem eliminou você nesta rodada?"}
        borderVariant="danger"
        maxWidth="520px"
        disableClose={loading}
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm px-3" onClick={closeEliminateModal} disabled={loading}>
              {localization['UI.Common.Cancel'] || "Cancelar"}
            </button>
            <button type="button" className="btn btn-danger btn-sm fw-bold px-4" onClick={handleDeclareElimination} disabled={loading}>
              {loading ? "⏳ Confirmando..." : `💀 ${localization['UI.Match.ConfirmElimination'] || "Confirmar Eliminação"}`}
            </button>
          </>
        }
      >
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
                      {(p.match_character_name || p.character_name) && <small className="text-muted">🎭 {(p.match_character_name || p.character_name)}</small>}
                    </div>
                  </div>
                  <span className={`badge flex-shrink-0 ${isSelected ? "bg-danger text-white" : "bg-dark border border-secondary text-muted"}`}>
                    {isSelected ? "✓ Selecionado" : "Selecionar"}
                  </span>
                </div>
              </div>
            )
          })}

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
                className={`badge flex-shrink-0 ${selectedKillerId === null ? "bg-warning text-dark" : "bg-dark border border-secondary text-muted"}`}
              >
                {selectedKillerId === null ? "✓ Selecionado" : "Selecionar"}
              </span>
            </div>
          </div>
        </div>
      </BaseModal>

      {/* Confirmação de Vitória */}
      <ConfirmModal
        show={showVictoryModal}
        title={`🏆 ${localization["UI.Match.DeclareVictory"] || "Declarar Vitória"}`}
        message={localization["UI.Match.ConfirmVictory"] || "Você tem certeza que deseja declarar vitória e encerrar a partida?"}
        confirmLabel={localization["UI.Match.DeclareVictory"] || "Confirmar Vitória"}
        cancelLabel={localization["UI.Common.Cancel"] || "Cancelar"}
        confirmVariant="warning"
        onConfirm={handleEndMatch}
        onCancel={() => setShowVictoryModal(false)}
      />
      {/* Confirmação de Cancelamento (Anfitrião) */}
      <ConfirmModal
        show={showCancelModal}
        title="⏹️ Cancelar Partida"
        message="Tem certeza que deseja cancelar a partida atual? Nenhum ponto ou histórico será registrado."
        confirmLabel="Sim, cancelar partida"
        cancelLabel={localization["UI.Common.Cancel"] || "Cancelar"}
        confirmVariant="danger"
        onConfirm={handleCancelMatch}
        onCancel={() => setShowCancelModal(false)}
      />
    </>
  )
}

export default MatchBar
