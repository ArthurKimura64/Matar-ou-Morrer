import React, { useState, useEffect, useCallback } from "react"
import authService from "../../services/authService"

const LEADERBOARD_TYPES = [
  { key: "composite", labelKey: "UI.Ranking.CompositeScore", fallback: "🏅 Score Composto", column: "composite_score" },
  { key: "wins", labelKey: "UI.Ranking.Wins", fallback: "🏆 Vitórias", column: "total_wins" },
  { key: "eliminations", labelKey: "UI.Ranking.Eliminations", fallback: "☠️ Eliminações", column: "total_eliminations" },
  { key: "survival", labelKey: "UI.Ranking.Survival", fallback: "💪 Sobrevivência", column: "total_survival_points" }
]

const RankingPage = ({ user, onBack, onInspectPlayer, localization }) => {
  const [activeTab, setActiveTab] = useState("composite")
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [userRank, setUserRank] = useState(null)
  const [showFormula, setShowFormula] = useState(false)

  const loadLeaderboard = useCallback(
    async (type, forceRefresh = false) => {
      setLoading(true)
      try {
        const data = await authService.getLeaderboard(type, 50, forceRefresh)
        setLeaderboard(data || [])

        // Carrega posição do usuário se estiver logado e fora do top 50
        if (user) {
          const inList = (data || []).some((e) => e.user_id === user.id)
          if (!inList) {
            const rank = await authService.getUserRankPosition(user.id, type, forceRefresh)
            setUserRank(rank)
          } else {
            setUserRank(null)
          }
        }
      } catch (err) {
        console.error("Erro ao carregar ranking:", err)
        setLeaderboard([])
      }
      setLoading(false)
    },
    [user]
  )

  useEffect(() => {
    loadLeaderboard(activeTab)
  }, [activeTab, loadLeaderboard])

  const getStatValue = (entry) => {
    const type = LEADERBOARD_TYPES.find((t) => t.key === activeTab)
    const val = entry[type?.column] || 0
    return activeTab === "composite" ? Number(val).toFixed(0) : val
  }

  const getMedalEmoji = (index) => {
    if (index === 0) return "🥇"
    if (index === 1) return "🥈"
    if (index === 2) return "🥉"
    return `#${index + 1}`
  }

  const avgStat = (entry, field) => {
    if (!entry.total_matches || entry.total_matches === 0) return "0.0"
    return (entry[field] / entry.total_matches).toFixed(1)
  }

  return (
    <section className="container-fluid px-2 md:px-3" aria-label="Ranking global">
      <header className="row">
        <div className="col-12 text-center mb-3 md:mb-4">
          <img src="/KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block my-2 md:my-3" style={{ maxHeight: "120px" }} />
          <div className="d-flex justify-content-center gap-2 mb-3">
            <button type="button" className="btn btn-outline-light btn-sm" onClick={onBack}>
              {localization?.["UI.Menu.BackToMenu"] || "← Voltar ao Menu"}
            </button>
            <button
              type="button"
              className="btn btn-outline-info btn-sm"
              disabled={loading}
              onClick={() => loadLeaderboard(activeTab, true)}
              title="Atualizar dados do ranking"
            >
              🔄 Atualizar
            </button>
          </div>
          <h2 className="text-white" style={{ fontSize: "clamp(1.2rem, 4vw, 1.5rem)" }}>
            {localization?.["UI.Ranking.Title"] || "🏆 Ranking Global"}
          </h2>
        </div>
      </header>

      <div className="row justify-content-center">
        <div className="col-12 md:col-10 lg:col-8">
          {/* Tabs */}
          <nav className="d-flex gap-1 md:gap-2 flex-wrap justify-content-center mb-3">
            {LEADERBOARD_TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                className={`btn btn-sm ${activeTab === type.key ? "btn-primary" : "btn-outline-secondary"}`}
                style={{ fontSize: "clamp(0.7rem, 2.5vw, 0.875rem)", padding: "4px 8px" }}
                onClick={() => setActiveTab(type.key)}
              >
                {localization?.[type.labelKey] || type.fallback}
              </button>
            ))}
          </nav>

          {/* Explicação da Fórmula */}
          <div className="mb-4">
            <button
              type="button"
              className="btn btn-sm btn-outline-info w-100"
              onClick={() => setShowFormula(!showFormula)}
              style={{ borderStyle: "dashed" }}
            >
              {showFormula ? "▲" : "▼"} {localization?.["UI.Ranking.HowItWorks"] || "Como funciona a pontuação?"}
            </button>
            {showFormula && (
              <div className="card bg-dark border-info mt-2">
                <div className="card-body p-2 md:p-3">
                  <h6 className="text-info mb-2 md:mb-3" style={{ fontSize: "clamp(0.8rem, 2.5vw, 1rem)" }}>
                    {localization?.["UI.Ranking.FormulaTitle"] || "📊 Fórmula do Score Composto"}
                  </h6>
                  <div className="p-2 rounded mb-2 md:mb-3" style={{ background: "rgba(13,110,253,0.1)", border: "1px solid rgba(13,110,253,0.3)" }}>
                    <code className="text-light" style={{ fontSize: "clamp(0.65rem, 2vw, 0.85rem)", wordBreak: "break-word" }}>
                      {localization?.["UI.Ranking.Formula"] ||
                        "Score = [(Win Rate × 4) + (Méd. Eliminações × 45) + (Méd. Sobrevivência × 20)] × Fator de Volume + (Vitórias × 15)"}
                    </code>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-dark table-sm mb-2 md:mb-3" style={{ fontSize: "clamp(0.7rem, 2vw, 0.85rem)" }}>
                      <thead>
                        <tr>
                          <th>{localization?.["UI.Ranking.Table.Component"] || "Componente"}</th>
                          <th className="text-center">{localization?.["UI.Ranking.Table.Weight"] || "Peso"}</th>
                          <th>{localization?.["UI.Ranking.Table.Description"] || "Descrição"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="text-info">{localization?.["UI.Ranking.WinRateLabel"] || "📈 Win Rate"}</td>
                          <td className="text-center">×4</td>
                          <td className="text-secondary">
                            {localization?.["UI.Ranking.Desc.WinRate"] || "Porcentagem de vitórias (0 a 100%). Principal indicador de consistência."}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-danger">☠️ {localization?.["UI.Ranking.Table.AvgElim"] || "Méd. Elim"}</td>
                          <td className="text-center">×45</td>
                          <td className="text-secondary">
                            {localization?.["UI.Ranking.Desc.Eliminations"] ||
                              "Média de eliminações por partida. Recompensa agressividade constante."}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-warning">💪 {localization?.["UI.Ranking.Table.AvgSurv"] || "Méd. Sobrev"}</td>
                          <td className="text-center">×20</td>
                          <td className="text-secondary">
                            {localization?.["UI.Ranking.Desc.Survival"] ||
                              "Média de pontos de sobrevivência por partida. Recompensa chegar longe na mesa."}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-success">🏆 {localization?.["UI.Profile.Stat.Wins"] || "Vitórias"}</td>
                          <td className="text-center">+15</td>
                          <td className="text-secondary">
                            {localization?.["UI.Ranking.Desc.Wins"] || "Bônus fixo de 15 pontos por cada vitória acumulada na conta."}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 rounded" style={{ background: "rgba(255,193,7,0.1)", border: "1px solid rgba(255,193,7,0.3)" }}>
                    <small className="text-warning" style={{ fontSize: "clamp(0.65rem, 2vw, 0.8rem)" }}>
                      <strong>{localization?.["UI.Ranking.VolumeLabel"] || "⚖️ Fator de Volume:"}</strong> A base de desempenho (Win Rate, Méd.
                      Eliminações e Méd. Sobrevivência) escala progressivamente de 10% a 100% até você completar 10 partidas. Isso impede que contas
                      com poucas partidas dominem o ranking por médias infladas.
                    </small>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card de posição do usuário (caso esteja fora do top 50) */}
          {userRank && !loading && (
            <div className="card bg-dark border-primary mb-3">
              <div className="card-body py-2 px-3">
                <div className="d-flex flex-column sm:flex-row justify-content-between align-items-start sm:align-items-center gap-1">
                  <div>
                    <small className="text-secondary">{localization?.["UI.Ranking.YourPosition"] || "Sua posição"}</small>
                    <div className="d-flex flex-wrap align-items-baseline gap-1">
                      <span className="fw-bold text-primary" style={{ fontSize: "clamp(1rem, 3vw, 1.2rem)" }}>
                        #{userRank.position}
                      </span>
                      <span className="text-secondary" style={{ fontSize: "clamp(0.7rem, 2vw, 0.85rem)" }}>
                        {userRank.stats.total_matches} {localization?.["UI.Ranking.Stats.Matches"] || "partidas"} · {userRank.stats.total_wins}{" "}
                        {localization?.["UI.Ranking.Stats.Wins"] || "vitórias"} · {Number(userRank.stats.win_rate || 0).toFixed(1)}% WR
                      </span>
                    </div>
                  </div>
                  <span className="fw-bold text-warning" style={{ fontSize: "clamp(0.9rem, 2.5vw, 1rem)" }}>
                    {Number(userRank.stats.composite_score || 0).toFixed(0)} {localization?.["UI.Common.Points"] || "pts"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tabela do Ranking */}
          <div className="card bg-dark border-secondary">
            <div className="card-body p-0">
              {loading ?
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                  <span className="text-secondary ms-2">{localization?.["UI.Ranking.Loading"] || "Carregando ranking..."}</span>
                </div>
              : leaderboard.length === 0 ?
                <div className="text-center text-secondary py-4">
                  {localization?.["UI.Ranking.NoPlayers"] || "Nenhum jogador com partidas registradas ainda."}
                </div>
              : <div className="table-responsive">
                  <table className="table table-dark table-hover mb-0" style={{ fontSize: "clamp(0.75rem, 2.2vw, 0.9rem)" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "40px" }}>#</th>
                        <th>{localization?.["UI.Ranking.Table.Player"] || "Jogador"}</th>
                        <th className="text-center d-none sm:d-table-cell">{localization?.["UI.Ranking.Table.Matches"] || "Partidas"}</th>
                        <th className="text-center">{localization?.["UI.Ranking.Table.WinsCol"] || "Vitórias"}</th>
                        <th className="text-center d-none sm:d-table-cell">{localization?.["UI.Ranking.Table.Elim"] || "Elim."}</th>
                        <th className="text-center d-none lg:d-table-cell">{localization?.["UI.Ranking.Table.AvgElim"] || "Méd. Elim"}</th>
                        <th className="text-center d-none lg:d-table-cell">{localization?.["UI.Ranking.Table.AvgSurv"] || "Méd. Sobrev"}</th>
                        <th className="text-center d-none sm:d-table-cell">WR</th>
                        <th className="text-end">
                          {(() => {
                            const t = LEADERBOARD_TYPES.find((item) => item.key === activeTab)
                            return localization?.[t?.labelKey] || t?.fallback
                          })()}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, idx) => {
                        const isCurrentUser = user && entry.user_id === user.id
                        const canInspect = Boolean(onInspectPlayer && entry.user_id)
                        return (
                          <tr
                            key={entry.user_id}
                            className={isCurrentUser ? "table-active" : ""}
                            style={canInspect ? { cursor: "pointer" } : undefined}
                            onClick={canInspect ? () => onInspectPlayer(entry.user_id) : undefined}
                            title={canInspect ? "Ver estatísticas completas do jogador" : undefined}
                          >
                            <td>
                              <span style={{ fontSize: idx < 3 ? "1.3rem" : "0.9rem" }}>{getMedalEmoji(idx)}</span>
                            </td>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                {entry.profile?.avatar_url ?
                                  <img src={entry.profile.avatar_url} alt="" width="28" height="28" className="rounded-circle" />
                                : <span style={{ fontSize: "1.2rem" }}>👤</span>}
                                <span className={`text-light ${isCurrentUser ? "fw-bold" : ""}`}>
                                  {entry.profile?.display_name || localization?.["UI.Common.DefaultPlayer"] || "Jogador"}
                                  {isCurrentUser && (
                                    <small className="text-primary ms-1">{localization?.["UI.Ranking.YouIndicator"] || "(você)"}</small>
                                  )}
                                </span>
                                {canInspect && <small className="text-info opacity-75">↗</small>}
                              </div>
                            </td>
                            <td className="text-center text-secondary d-none sm:d-table-cell">{entry.total_matches}</td>
                            <td className="text-center text-success">{entry.total_wins}</td>
                            <td className="text-center text-danger d-none sm:d-table-cell">{entry.total_eliminations}</td>
                            <td className="text-center text-secondary d-none lg:d-table-cell">{avgStat(entry, "total_eliminations")}</td>
                            <td className="text-center text-secondary d-none lg:d-table-cell">{avgStat(entry, "total_survival_points")}</td>
                            <td className="text-center text-secondary d-none sm:d-table-cell">
                              {entry.win_rate ? Number(entry.win_rate).toFixed(1) : "0.0"}%
                            </td>
                            <td className="text-end">
                              <span className="fw-bold text-warning">{getStatValue(entry)}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>

          {/* Dica caso o jogador ainda não esteja no ranking */}
          {user && !loading && leaderboard.length > 0 && !leaderboard.some((e) => e.user_id === user.id) && !userRank && (
            <div className="text-center text-secondary mt-3">
              <small>{localization?.["UI.Ranking.PlayToAppear"] || "Jogue partidas para aparecer no ranking!"}</small>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default RankingPage
