import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react"
import { RoomService } from "./services/roomService"
import { PlayerPersistence } from "./utils/playerPersistence"
import { adaptGameData, adaptLocalization } from "./utils/gameDataAdapter"
import { useToast } from "./hooks/useToast"
import { useAuthSession } from "./hooks/useAuthSession"
import { useTheme } from "./hooks/useTheme"
import { serializeSelections, hydrateSelections } from "./utils/playerStateCodec"

// Lazy loading para telas maiores (carregadas apenas quando abertas)
import AuthModal from "./features/auth/AuthModal"
import UserMenu from "./features/auth/UserMenu"

const CharacterSelection = lazy(() => import("./features/character/CharacterSelection"))
const CharacterBuilder = lazy(() => import("./features/character/CharacterBuilder"))
const CharacterSheet = lazy(() => import("./features/character/CharacterSheet"))
const RoomLobby = lazy(() => import("./features/lobby/RoomLobby"))
const RoomView = lazy(() => import("./features/room/RoomView"))
const RankingPage = lazy(() => import("./features/profile/RankingPage"))
const TestRunnerPage = lazy(() => import("./features/admin-tests/TestRunnerPage"))
const StatsPage = lazy(() => import("./features/stats/StatsPage"))

const LoadingFallback = ({ message = "Carregando..." }) => (
  <main className="container-fluid d-flex justify-content-center align-items-center vh-100">
    <div className="text-center">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">{message}</span>
      </div>
      <p className="mt-2 text-light">{message}</p>
    </div>
  </main>
)

function App() {
  // Dados estáticos do jogo (padronizados pelo gameDataAdapter)
  const [gameData, setGameData] = useState(null)
  const [localization, setLocalization] = useState(null)

  // Navegação e estado da partida (Solo ou Multiplayer)
  const [currentView, setCurrentView] = useState("menu")
  const [selectedActor, setSelectedActor] = useState(null)
  const [characterSelections, setCharacterSelections] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [currentPlayer, setCurrentPlayer] = useState(null)
  const [roomInternalView, setRoomInternalView] = useState("selection")
  const [loading, setLoading] = useState(false)
  const [isRestoringState, setIsRestoringState] = useState(false)
  const [statsTargetUserId, setStatsTargetUserId] = useState(null)
  const [statsReturnView, setStatsReturnView] = useState("menu")
  const roomBackInterceptRef = useRef(null)
  const [displayNameOverride, setDisplayNameOverride] = useState(null)

  // Controle visual do modal de login/senha
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalMode, setAuthModalMode] = useState("login")

  // Refs para sincronização segura com o botão Voltar do navegador/celular
  const isPopStateNavRef = useRef(false)
  const currentRoomRef = useRef(currentRoom)
  currentRoomRef.current = currentRoom

  const [initialPrivateState, setInitialPrivateState] = useState(null)
  const hasAttemptedRestoreRef = useRef(false)

  const [inviteRoomCode, setInviteRoomCode] = useState(() => {
    const match = window.location.pathname.match(/^\/sala\/(\d{6})\/?$/)
    return match ? match[1] : ""
  })

  // Hooks modulares: Avisos, Sessão e Tema
  const { showToast } = useToast()
  const {
    currentUser,
    userProfile,
    authLoading,
    handleAuthSuccess: onSessionAuthenticated,
    clearAuthState,
    updateProfileThemeLocally
  } = useAuthSession({ showToast })

  const effectiveProfile = useMemo(() => {
    if (!userProfile) return null
    return displayNameOverride ? { ...userProfile, display_name: displayNameOverride } : userProfile
  }, [userProfile, displayNameOverride])

  const { userTheme, handleThemeChange, resetTheme } = useTheme({
    currentUser,
    userProfile,
    onThemeSaved: updateProfileThemeLocally
  })

  // ==================== HISTÓRICO DO NAVEGADOR (BOTÃO VOLTAR) ====================

  useEffect(() => {
    window.history.replaceState({ kodView: "menu" }, "")

    const handlePopState = (event) => {
      // Protege contra gesto acidental de voltar enquanto estiver numa sala multiplayer
      if (currentRoomRef.current) {
        window.history.pushState({ kodView: "room" }, "", `/sala/${currentRoomRef.current.id}`)
        if (roomBackInterceptRef.current?.()) {
          return
        }
        showToast("Use o botão 'Sair da Sala' para sair da sala.", "info")
        return
      }

      const targetView = event.state?.kodView || "menu"
      isPopStateNavRef.current = true

      if (targetView === "menu") {
        setStatsTargetUserId(null)
      } else if (targetView === "selection") {
        setSelectedActor(null)
        setCharacterSelections(null)
      }

      setCurrentView(targetView === "room" ? "menu" : targetView)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [showToast])

  useEffect(() => {
    if (isPopStateNavRef.current) {
      isPopStateNavRef.current = false
      return
    }
    if (window.history.state?.kodView !== currentView) {
      window.history.pushState({ kodView: currentView }, "")
    }
  }, [currentView])

  // ==================== PERSISTÊNCIA ====================

  // Salva estado enxuto no banco (apenas selectedActorId em vez do objeto inteiro)
  const saveCompleteState = useCallback(async () => {
    if (!currentRoom || !currentPlayer) return
    const completeState = {
      currentView,
      roomInternalView,
      selectedActorId: selectedActor?.ID || null,
      characterSelections: serializeSelections(characterSelections),
      timestamp: new Date().toISOString()
    }

    PlayerPersistence.saveAppState(completeState)

    // Durante a montagem do personagem, o rascunho fica local até o jogador confirmar
    if (roomInternalView !== "building") {
      await RoomService.updatePlayerAppState(currentPlayer.id, completeState, currentUser?.id || null)
    }
  }, [currentView, roomInternalView, selectedActor?.ID, characterSelections, currentRoom, currentPlayer, currentUser?.id])

  // Salva estado no modo solo (apenas localStorage, formato enxuto)
  const saveSoloState = useCallback(() => {
    const nonSoloViews = ["menu", "lobby", "profile", "ranking", "stats", "admin-tests"]
    if (currentRoom || currentPlayer || nonSoloViews.includes(currentView)) return

    PlayerPersistence.saveAppState({
      currentView,
      selectedActorId: selectedActor?.ID || null,
      characterSelections: serializeSelections(characterSelections),
      timestamp: new Date().toISOString(),
      isSoloMode: true
    })
  }, [currentView, selectedActor?.ID, characterSelections, currentRoom, currentPlayer])

  // Reconexão automática após F5 em uma sala
  const handleReconnectPlayer = useCallback(
    async (savedData, savedAppState, loadedGameData = null, loadedLocalization = null) => {
      const loc = loadedLocalization || localization
      const dataToUse = loadedGameData || gameData
      try {
        setLoading(true)
        setIsRestoringState(true)

        const roomResult = await RoomService.getRoomById(savedData.room.id)
        if (roomResult.notFound) {
          PlayerPersistence.clearPlayerData()
          setInviteRoomCode("")
          window.history.replaceState({ kodView: "menu" }, "", "/")
          setCurrentView("menu")
          showToast(loc?.["UI.Error.RoomUnavailable"] || "A sala não está mais disponível. Voltando ao menu principal.", "warning")
          return
        }
        if (!roomResult.success || !roomResult.room) {
          showToast(loc?.["UI.Error.ReconnectError"] || "Erro ao tentar reconectar. Verifique sua conexão.", "warning")
          return
        }

        const reconnectResult = await RoomService.reconnectPlayer(savedData.player.id)
        if (!reconnectResult.success) {
          showToast(loc?.["UI.Error.ReconnectFailed"] || "Não foi possível reconectar. Voltando ao menu principal.", "error")
          PlayerPersistence.clearPlayerData()
          setCurrentView("menu")
          return
        }

        const privateRes = await RoomService.getPrivateState(savedData.player.id)
        const priv = privateRes.success ? privateRes.data : null
        setInitialPrivateState(priv)

        setCurrentRoom(roomResult.room)
        setCurrentPlayer(reconnectResult.player)

        // Prioridade: app_state privado > selections privadas > formato legado > localStorage
        let stateToRestore = null
        if (priv?.app_state?.timestamp) {
          stateToRestore = priv.app_state
        } else if (priv?.actor_id || reconnectResult.player.actor_id) {
          stateToRestore = {
            selectedActorId: priv?.actor_id || reconnectResult.player.actor_id,
            characterSelections: priv?.selections || {},
            roomInternalView: reconnectResult.player.status === "creating" ? "building" : "sheet",
            currentView: "room"
          }
        } else if (reconnectResult.player.app_state?.timestamp) {
          stateToRestore = reconnectResult.player.app_state
        } else if (savedAppState) {
          stateToRestore = savedAppState
        }

        if (stateToRestore) {
          const actorId = stateToRestore.selectedActorId || priv?.actor_id || reconnectResult.player.actor_id || stateToRestore.selectedActor?.ID

          if (actorId && dataToUse?.ActorDefinitions) {
            const foundActor = dataToUse.ActorDefinitions.find((a) => a.ID === actorId)
            setSelectedActor(foundActor || null)
          }

          const rawSel = stateToRestore.characterSelections || priv?.selections
          if (rawSel && Object.keys(rawSel).length > 0) {
            setCharacterSelections(hydrateSelections(rawSel, dataToUse))
          }

          const rawInternalView = stateToRestore.roomInternalView || "selection"
          setRoomInternalView(rawInternalView === "lobby" ? "selection" : rawInternalView)
        } else {
          setRoomInternalView("selection")
        }

        setInviteRoomCode("")
        setCurrentView("room")
        window.history.pushState({ kodView: "room" }, "", `/sala/${roomResult.room.id}`)
        PlayerPersistence.savePlayerData(reconnectResult.player, roomResult.room)
      } catch (error) {
        console.error("Erro na reconexão:", error)
        showToast(loc?.["UI.Error.ReconnectError"] || "Erro ao tentar reconectar. Verifique sua conexão.", "error")
      } finally {
        setLoading(false)
        setIsRestoringState(false)
      }
    },
    [gameData, localization, showToast]
  )

  // Auto-save com debounce de 300ms
  useEffect(() => {
    if (isRestoringState) return
    const timeoutId = setTimeout(() => {
      if (currentRoom && currentPlayer) saveCompleteState()
      else saveSoloState()
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [
    currentView,
    roomInternalView,
    selectedActor,
    characterSelections,
    currentRoom,
    currentPlayer,
    isRestoringState,
    saveCompleteState,
    saveSoloState
  ])

  // Carga inicial dos JSONs + restauração de sessão salva
  // 1. Carrega apenas os JSONs estáticos do jogo na montagem
  useEffect(() => {
    if (!PlayerPersistence.isSameSession()) {
      PlayerPersistence.generateSessionId()
    }

    Promise.all([fetch("/GameEconomyData.json").then((r) => r.json()), fetch("/LocalizationPortuguese.json").then((r) => r.json())])
      .then(([rawGameData, rawLocalization]) => {
        setGameData(adaptGameData(rawGameData))
        setLocalization(adaptLocalization(rawLocalization))
      })
      .catch((error) => {
        console.error("Erro ao carregar dados do jogo:", error)
      })
  }, [])

  // 2. Restaura sala ou modo solo APENAS após login e checagem de banimento concluírem
  useEffect(() => {
    if (authLoading || !gameData || !localization) return
    if (!currentUser) {
      hasAttemptedRestoreRef.current = false
      return
    }
    if (hasAttemptedRestoreRef.current) return
    hasAttemptedRestoreRef.current = true

    const savedData = PlayerPersistence.getPlayerData()
    const savedAppState = PlayerPersistence.getAppState()

    if (inviteRoomCode && (!savedData || String(savedData.room?.id) !== String(inviteRoomCode))) {
      RoomService.findExistingPlayer(inviteRoomCode, "").then((existingRes) => {
        if (existingRes.success && existingRes.player) {
          handleReconnectPlayer({ player: existingRes.player, room: { id: inviteRoomCode, name: "" } }, null, gameData, localization)
        } else {
          setCurrentView("lobby")
        }
      })
      return
    }

    if (savedData && PlayerPersistence.validateSavedData()) {
      PlayerPersistence.validateSessionWithServer().then((isValid) => {
        if (isValid) {
          handleReconnectPlayer(savedData, savedAppState, gameData, localization)
        }
      })
    } else if (savedAppState?.isSoloMode) {
      setIsRestoringState(true)
      const actorId = savedAppState.selectedActorId || savedAppState.selectedActor?.ID
      if (actorId && gameData.ActorDefinitions) {
        const foundActor = gameData.ActorDefinitions.find((a) => a.ID === actorId)
        setSelectedActor(foundActor || null)
      }
      if (savedAppState.characterSelections) {
        setCharacterSelections(hydrateSelections(savedAppState.characterSelections, gameData))
      }
      if (savedAppState.currentView) {
        setCurrentView(savedAppState.currentView)
      }
      setTimeout(() => setIsRestoringState(false), 100)
    }
  }, [authLoading, currentUser, gameData, localization, handleReconnectPlayer, inviteRoomCode])

  // ==================== HANDLERS DE NAVEGAÇÃO ====================

  const handleAuthSuccess = (user) => {
    onSessionAuthenticated(user)
    setDisplayNameOverride(null)
    setCurrentView("menu")
    setSelectedActor(null)
    setCharacterSelections(null)
    PlayerPersistence.clearAppState()
  }

  const handleLogout = () => {
    PlayerPersistence.clearPlayerData()
    setInitialPrivateState(null)
    clearAuthState()
    resetTheme()
    setDisplayNameOverride(null)
    setCurrentRoom(null)
    setCurrentPlayer(null)
    setSelectedActor(null)
    setCharacterSelections(null)
    setRoomInternalView("selection")
    setCurrentView("menu")
    setInviteRoomCode("")
    window.history.replaceState({ kodView: "menu" }, "", "/")
  }

  // Unifica "Meu Perfil" direto na tela completa de Estatísticas focada na conta do usuário
  const handleMenuNavigate = useCallback(
    (targetView) => {
      if (targetView === "profile" && currentUser?.id) {
        setStatsReturnView("menu")
        setStatsTargetUserId(currentUser.id)
        setCurrentView("stats")
        return
      }
      if (targetView === "stats") {
        setStatsReturnView("menu")
        setStatsTargetUserId(null)
      }
      setCurrentView(targetView)
    },
    [currentUser?.id]
  )

  const handleProfileUpdated = useCallback((updatedProfile) => {
    if (updatedProfile?.display_name) {
      setDisplayNameOverride(updatedProfile.display_name)
    }
  }, [])

  const handleCreateRoom = async (roomName, masterName) => {
    setLoading(true)
    const result = await RoomService.createRoomWithHost(roomName, masterName)

    if (result.success && result.room && result.player) {
      setInitialPrivateState(null)
      setCurrentRoom(result.room)
      setCurrentPlayer(result.player)
      setRoomInternalView("selection")
      setCurrentView("room")
      PlayerPersistence.savePlayerData(result.player, result.room)
      setInviteRoomCode("")
      window.history.pushState({ kodView: "room" }, "", `/sala/${result.room.id}`)
    } else {
      showToast((localization?.["UI.Error.CreateRoom"] || "Erro ao criar sala: ") + result.error, "error")
    }
    setLoading(false)
  }

  const handleJoinRoom = async (roomId, playerName) => {
    setInitialPrivateState(null)
    setLoading(true)
    // forceNewPlayer = false: se esta conta já estiver na sala, reconecta em vez de duplicar
    const result = await RoomService.joinRoom(roomId, playerName, null, false, currentUser?.id || null)

    if (result.success) {
      const roomObj = result.room || (await RoomService.getRoomById(roomId)).room
      if (roomObj) {
        const hasExistingProgress = Boolean(
          result.player?.actor_id || result.player?.character_name || (result.player?.status && result.player.status !== "selecting")
        )

        if (hasExistingProgress) {
          await handleReconnectPlayer({ player: result.player, room: roomObj }, null, gameData, localization)
          return
        }

        setSelectedActor(null)
        setCharacterSelections(null)
        setCurrentRoom(roomObj)
        setCurrentPlayer(result.player)
        setRoomInternalView("selection")
        setCurrentView("room")
        PlayerPersistence.savePlayerData(result.player, roomObj)
        setInviteRoomCode("")
        window.history.pushState({ kodView: "room" }, "", `/sala/${roomId}`)
      } else {
        showToast(localization?.["UI.Error.RoomNotFound"] || "Sala não encontrada ou inativa", "error")
      }
    } else {
      showToast((localization?.["UI.Error.JoinRoom"] || "Erro ao entrar na sala: ") + result.error, "error")
    }
    setLoading(false)
  }

  const handleLeaveRoom = useCallback(() => {
    PlayerPersistence.clearPlayerData()
    setInitialPrivateState(null)
    setCurrentRoom(null)
    setCurrentPlayer(null)
    setSelectedActor(null)
    setCharacterSelections(null)
    setRoomInternalView("selection")
    setCurrentView("menu")
    setInviteRoomCode("")
    window.history.replaceState({ kodView: "menu" }, "", "/")
  }, [])

  const handleRoomStateChange = useCallback(({ roomInternalView: nextView, selectedActor: nextActor, characterSelections: nextSelections }) => {
    if (nextView !== undefined) setRoomInternalView(nextView)
    if (nextActor !== undefined) setSelectedActor(nextActor)
    if (nextSelections !== undefined) setCharacterSelections(nextSelections)
  }, [])

  const handleSoloCharacterSelect = (actor) => {
    localStorage.removeItem("killOrDie_soloSheetState")
    setSelectedActor(actor)
    setCharacterSelections({})
    setCurrentView("builder")
  }

  const handleSoloCharacterCreate = (selections) => {
    setCharacterSelections(selections)
    setCurrentView("sheet")
  }

  const handleSoloReset = () => {
    localStorage.removeItem("killOrDie_soloSheetState")
    setCurrentView("menu")
    setSelectedActor(null)
    setCharacterSelections(null)
    setCurrentRoom(null)
    setCurrentPlayer(null)
    PlayerPersistence.clearAppState()
  }

  // ==================== TELAS DE CARREGAMENTO E LOGIN ====================

  if (!gameData || !localization || authLoading) {
    return <LoadingFallback message={localization?.["UI.Loading.Game"] || "Carregando dados do jogo..."} />
  }

  if (loading) {
    return <LoadingFallback message={localization?.["UI.Loading.Processing"] || "Processando..."} />
  }

  if (!currentUser) {
    return (
      <main className="container-fluid">
        <AuthModal
          show={showAuthModal}
          onClose={() => {
            setShowAuthModal(false)
            setAuthModalMode("login")
          }}
          onAuthSuccess={handleAuthSuccess}
          initialMode={authModalMode}
          localization={localization}
        />
        <section className="row justify-content-center align-items-center vh-100" aria-label="Acesso à conta">
          <div className="md:col-6 lg:col-4 text-center">
            <img src="/KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block mb-4" style={{ maxHeight: "250px" }} />
            <h1 className="text-white mb-2">Kill or Die</h1>
            <p className="text-secondary mb-4">{localization?.["UI.Auth.LoginPrompt"] || "Faça login ou crie uma conta para jogar"}</p>
            <div className="d-grid gap-2">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setAuthModalMode("login")
                  setShowAuthModal(true)
                }}
              >
                {localization?.["UI.Auth.LoginButton"] || "🔑 Entrar"}
              </button>
              <button
                type="button"
                className="btn btn-outline-light btn-lg"
                onClick={() => {
                  setAuthModalMode("register")
                  setShowAuthModal(true)
                }}
              >
                {localization?.["UI.Auth.RegisterButton"] || "📝 Criar Conta"}
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  // ==================== MAPA DE TELAS (USUÁRIO LOGADO) ====================

  return (
    <main className="container-fluid">
      <AuthModal
        show={showAuthModal}
        onClose={() => {
          setShowAuthModal(false)
          setAuthModalMode("login")
        }}
        onAuthSuccess={handleAuthSuccess}
        initialMode={authModalMode}
        localization={localization}
      />

      {currentView === "menu" && (
        <>
          <header className="row">
            <nav className="col-12 d-flex justify-content-end py-2" aria-label="Menu do usuário">
              <UserMenu
                user={currentUser}
                profile={effectiveProfile}
                onLogout={handleLogout}
                onNavigate={handleMenuNavigate}
                onChangePassword={() => {
                  setAuthModalMode("changePassword")
                  setShowAuthModal(true)
                }}
                currentTheme={userTheme}
                onThemeChange={handleThemeChange}
                localization={localization}
              />
            </nav>
          </header>

          <section className="row" aria-label="Apresentação do jogo">
            <div className="col-12 text-center">
              <img src="/KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block my-3" style={{ maxHeight: "300px" }} />
              <h1 className="text-white">Kill or Die</h1>
              <h4 className="text-light mb-4">{localization["UI.Menu.ChooseMode"] || "Escolha como jogar!"}</h4>
            </div>
          </section>

          <nav className="row justify-content-center" aria-label="Modos de jogo">
            <div className="md:col-6">
              <div className="d-grid gap-3">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => setCurrentView("lobby")}>
                  {localization["UI.Menu.Multiplayer"] || "🎮 Modo Multiplayer"}
                </button>
                <button type="button" className="btn btn-success btn-lg" onClick={() => setCurrentView("selection")}>
                  {localization["UI.Menu.Solo"] || "👤 Modo Solo"}
                </button>
                <button type="button" className="btn btn-outline-warning btn-lg" onClick={() => setCurrentView("ranking")}>
                  {localization["UI.Menu.Ranking"] || "🏆 Ranking"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-info btn-lg"
                  onClick={() => {
                    setStatsTargetUserId(null)
                    setCurrentView("stats")
                  }}
                >
                  📈 Estatísticas
                </button>
              </div>
            </div>
          </nav>
        </>
      )}

      {currentView === "lobby" && (
        <Suspense fallback={<LoadingFallback />}>
          <RoomLobby
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onBack={() => {
              setInviteRoomCode("")
              window.history.replaceState({ kodView: "menu" }, "", "/")
              setCurrentView("menu")
            }}
            onGoSolo={() => setCurrentView("selection")}
            localization={localization}
            defaultPlayerName={effectiveProfile?.display_name || currentUser?.user_metadata?.display_name || ""}
            initialRoomCode={inviteRoomCode}
          />
        </Suspense>
      )}

      {currentView === "room" && currentRoom && currentPlayer && (
        <Suspense fallback={<LoadingFallback />}>
          <RoomView
            room={currentRoom}
            currentPlayer={currentPlayer}
            gameData={gameData}
            localization={localization}
            onLeaveRoom={handleLeaveRoom}
            initialInternalView={roomInternalView}
            initialActor={selectedActor}
            initialSelections={characterSelections}
            initialPrivateState={initialPrivateState}
            onStateChange={handleRoomStateChange}
            backInterceptRef={roomBackInterceptRef}
          />
        </Suspense>
      )}

      {currentView === "selection" && (
        <>
          <header className="row">
            <div className="col-12 text-center">
              <img src="/KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block my-3" style={{ maxHeight: "300px" }} />
              <h1 className="text-white">Kill or Die</h1>
              <h4 className="text-light mb-4">{localization["UI.Selection.ChooseCharacter"] || "Escolha seu personagem!"}</h4>
              <button type="button" className="btn btn-outline-light btn-sm mb-3" onClick={() => setCurrentView("menu")}>
                {localization["UI.Navigation.BackToMenu"] || "← Voltar ao Menu"}
              </button>
            </div>
          </header>
          <Suspense fallback={<LoadingFallback />}>
            <CharacterSelection gameData={gameData} localization={localization} onCharacterSelect={handleSoloCharacterSelect} />
          </Suspense>
        </>
      )}

      {currentView === "builder" && selectedActor && (
        <Suspense fallback={<LoadingFallback />}>
          <CharacterBuilder
            key={selectedActor.ID}
            actor={selectedActor}
            gameData={gameData}
            localization={localization}
            initialSelections={characterSelections}
            onDraftChange={setCharacterSelections}
            onCharacterCreate={handleSoloCharacterCreate}
            onBack={() => {
              setSelectedActor(null)
              setCharacterSelections(null)
              setCurrentView("selection")
            }}
          />
        </Suspense>
      )}

      {currentView === "sheet" && selectedActor && characterSelections && (
        <Suspense fallback={<LoadingFallback />}>
          <CharacterSheet
            actor={selectedActor}
            selections={characterSelections}
            gameData={gameData}
            localization={localization}
            onReset={handleSoloReset}
          />
        </Suspense>
      )}

      {currentView === "ranking" && (
        <Suspense fallback={<LoadingFallback />}>
          <RankingPage
            user={currentUser}
            onBack={() => setCurrentView("menu")}
            onInspectPlayer={(targetId) => {
              setStatsReturnView("ranking")
              setStatsTargetUserId(targetId)
              setCurrentView("stats")
            }}
            localization={localization}
          />
        </Suspense>
      )}

      {(currentView === "stats" || currentView === "profile") && currentUser && (
        <Suspense fallback={<LoadingFallback />}>
          <StatsPage
            user={currentUser}
            initialTargetUserId={currentView === "profile" ? currentUser.id : statsTargetUserId}
            backLabel={statsReturnView === "ranking" ? "← Voltar ao Ranking" : "← Voltar ao Menu"}
            onProfileUpdated={handleProfileUpdated}
            onBack={() => {
              const dest = statsReturnView
              setStatsTargetUserId(null)
              setStatsReturnView("menu")
              setCurrentView(dest)
            }}
          />
        </Suspense>
      )}

      {currentView === "admin-tests" && currentUser && (
        <Suspense fallback={<LoadingFallback />}>
          <TestRunnerPage user={currentUser} gameData={gameData} localization={localization} onBack={() => setCurrentView("menu")} />
        </Suspense>
      )}
    </main>
  )
}

export default App
