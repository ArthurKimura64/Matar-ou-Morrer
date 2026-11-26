import React, { useState, useRef, useEffect, useCallback } from "react"
import authService from "../../services/authService"
import { useEscapeKey } from "../../hooks/useEscapeKey"
import { AVAILABLE_THEMES } from "../../config/themes"
import { isTestEnvironment } from "../admin-tests/testEnv"
import BaseModal from "../../components/BaseModal"

const UserMenu = ({ user, profile, onLogout, onNavigate, onChangePassword, currentTheme = "classic", onThemeChange, localization = {} }) => {
  const [open, setOpen] = useState(false)
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const menuRef = useRef(null)
  const canOpenTestLab = isAdmin && isTestEnvironment()

  const closeMenu = useCallback(() => setOpen(false), [])
  const closeThemeModal = useCallback(() => setShowThemeModal(false), [])

  useEscapeKey(open && !showThemeModal, closeMenu)

  useEffect(() => {
    if (user) {
      authService.checkIsAdmin().then(setIsAdmin)
    }
  }, [user])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleLogout = async () => {
    setOpen(false)
    try {
      await authService.signOut()
      onLogout()
    } catch (err) {
      console.error("Erro ao sair:", err)
    }
  }

  const activeThemeObj = AVAILABLE_THEMES.find((t) => t.id === currentTheme) || AVAILABLE_THEMES[0]

  const displayName =
    profile?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || localization["UI.Common.DefaultPlayer"] || "Jogador"

  return (
    <>
      <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          className="btn btn-outline-light btn-sm d-flex align-items-center gap-2"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen(!open)}
        >
          {profile?.avatar_url ?
            <img src={profile.avatar_url} alt="" width="24" height="24" className="rounded-circle" />
          : <span aria-hidden="true">👤</span>}
          <span className="d-none md:d-inline">{displayName}</span>
          <small aria-hidden="true">▾</small>
        </button>

        {open && (
          <div
            role="menu"
            className="card bg-dark border-secondary shadow"
            style={{
              position: "absolute",
              right: 0,
              top: "100%",
              marginTop: "6px",
              minWidth: "235px",
              zIndex: 1050
            }}
          >
            <div className="card-body p-2">
              <div className="px-2 py-1 mb-2 border-bottom border-secondary">
                <small className="text-secondary">{localization["UI.Menu.LoggedAs"] || "Logado como"}</small>
                <div className="text-light fw-bold text-truncate">{displayName}</div>
              </div>

              {/* Botão que abre o Studio Visual de Temas */}
              <button
                type="button"
                role="menuitem"
                className="btn btn-sm btn-outline-light w-100 text-start mb-1 d-flex justify-content-between align-items-center"
                onClick={() => {
                  setOpen(false)
                  setShowThemeModal(true)
                }}
              >
                <span>🎨 {localization["UI.Menu.ThemeStudio"] || "Tema & Aparência"}</span>
                <span
                  className="badge"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.08)",
                    border: `1px solid ${activeThemeObj.accent}`,
                    color: activeThemeObj.accent,
                    fontSize: "0.7rem"
                  }}
                >
                  {activeThemeObj.icon} {activeThemeObj.label.split(" ")[0]}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="btn btn-sm btn-outline-light w-100 text-start mb-1"
                onClick={() => {
                  setOpen(false)
                  onNavigate("profile")
                }}
              >
                📊 {localization["UI.Menu.MyProfile"] || "Meu Perfil"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn btn-sm btn-outline-light w-100 text-start mb-1"
                onClick={() => {
                  setOpen(false)
                  onNavigate("ranking")
                }}
              >
                🏆 {localization["UI.Menu.Ranking"] || "Ranking"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn btn-sm btn-outline-light w-100 text-start mb-1"
                onClick={() => {
                  setOpen(false)
                  onNavigate("stats")
                }}
              >
                📈 Estatísticas
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn btn-sm btn-outline-light w-100 text-start mb-1"
                onClick={() => {
                  setOpen(false)
                  onChangePassword && onChangePassword()
                }}
              >
                🔐 {localization["UI.Menu.ChangePassword"] || "Mudar Senha"}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn btn-sm btn-outline-warning w-100 text-start mb-1"
                  onClick={() => {
                    setOpen(false)
                    window.open("/admin", "_blank")
                  }}
                >
                  ⚙️ {localization["UI.Menu.AdminPanel"] || "Painel Admin"}
                </button>
              )}
              {canOpenTestLab && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn btn-sm btn-outline-info w-100 text-start mb-1"
                  onClick={() => {
                    setOpen(false)
                    onNavigate("admin-tests")
                  }}
                >
                  🧪 Laboratório de Testes
                </button>
              )}
              <div className="border-top border-secondary my-1" />
              <button type="button" role="menuitem" className="btn btn-sm btn-outline-danger w-100 text-start" onClick={handleLogout}>
                🚪 {localization["UI.Menu.Logout"] || "Sair"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Studio de Paletas de Cores */}
      <BaseModal
        show={showThemeModal}
        onClose={closeThemeModal}
        title="🎨 Personalização de Tema"
        subtitle={`Salvo automaticamente na sua conta (${displayName})`}
        borderVariant="secondary"
        size="lg"
        footer={
          <button type="button" className="btn btn-primary btn-sm px-4" onClick={closeThemeModal}>
            Concluir
          </button>
        }
      >
        <div className="row g-3">
          {AVAILABLE_THEMES.map((t) => {
            const isSelected = currentTheme === t.id
            return (
              <article key={t.id} className="col-12 md:col-6">
                <div
                  onClick={() => onThemeChange && onThemeChange(t.id)}
                  className="p-3 rounded position-relative h-100 d-flex flex-column justify-content-between"
                  style={{
                    cursor: "pointer",
                    background: t.previewBg,
                    border: isSelected ? `2.5px solid ${t.accent}` : "1.5px solid rgba(255, 255, 255, 0.14)",
                    boxShadow: isSelected ? `0 0 20px ${t.accent}44` : "0 4px 10px rgba(0,0,0,0.4)",
                    transition: "all 0.18s ease"
                  }}
                >
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ fontSize: "1.25rem" }}>{t.icon}</span>
                        <span className="fw-bold text-white" style={{ fontSize: "0.98rem" }}>
                          {t.label}
                        </span>
                      </div>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: isSelected ? t.accent : "rgba(255,255,255,0.1)",
                          color: isSelected ? "#000" : "#cbd5e1",
                          fontSize: "0.7rem"
                        }}
                      >
                        {isSelected ? "✓ Ativo" : t.badge}
                      </span>
                    </div>

                    <p className="text-muted small mb-3" style={{ fontSize: "0.8rem", lineHeight: 1.35 }}>
                      {t.desc}
                    </p>
                  </div>

                  <div
                    className="p-2 rounded d-flex align-items-center justify-content-between"
                    style={{
                      backgroundColor: t.previewCard,
                      border: `1px solid ${t.accent}55`
                    }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "4px",
                          backgroundColor: t.accent,
                          display: "inline-block",
                          boxShadow: `0 0 8px ${t.accent}`
                        }}
                      />
                      <small className="text-light fw-bold" style={{ fontSize: "0.72rem" }}>
                        Superfície do Card
                      </small>
                    </div>
                    <div className="d-flex gap-1">
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444" }} />
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10b981" }} />
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#3b82f6" }} />
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </BaseModal>
    </>
  )
}

export default UserMenu
