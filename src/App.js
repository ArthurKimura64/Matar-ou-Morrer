import React, { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { RoomService } from "./services/roomService"
import { PlayerPersistence } from "./utils/playerPersistence"
import { adaptGameData, adaptLocalization } from "./utils/gameDataAdapter"
import { useToast } from "./hooks/useToast"
import { useAuthSession } from "./hooks/useAuthSession"
import { useTheme } from "./hooks/useTheme"

// Lazy loading para telas maiores (carregadas apenas quando abertas)
import AuthModal from "./features/auth/AuthModal"
import UserMenu from "./features/auth/UserMenu"

const CharacterSelection = lazy(() => import("./features/character/CharacterSelection"))
const CharacterBuilder = lazy(() => import("./features/character/CharacterBuilder"))
const CharacterSheet = lazy(() => import("./features/character/CharacterSheet"))
const RoomLobby = lazy(() => import("./features/lobby/RoomLobby"))
const RoomView = lazy(() => import("./features/room/RoomView"))
const ProfilePage = lazy(() => import("./features/profile/ProfilePage"))
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

  // Controle visual do modal de login/senha
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalMode, setAuthModalMode] = useState("login")

  // Hooks modulares: Avisos, Sessão e Tema
  const { showToast, ToastComponent } = useToast()
  const {
    currentUser,
    userProfile,
    authLoading,
    handleAuthSuccess: onSessionAuthenticated,
    clearAuthState,
    updateProfileThemeLocally
  } = useAuthSession({ showToast })

  const { userTheme, handleThemeChange, resetTheme } = useTheme({
    currentUser,
    userProfile,
    onThemeSaved: updateProfileThemeLocally
  })

  // Salva estado completo no banco (RoomService preserva ever_exposed_cards automaticamente)
  const saveCompleteState = useCallback(async () => {
    if (!currentRoom || !currentPlayer) return
    const completeState = {
      currentView,
      roomInternalView,
      selectedActor,
      characterSelections,
      timestamp: new Date().toISOString()
    }

    await RoomService.updatePlayerAppState(currentPlayer.id, completeState)
    PlayerPersistence.saveAppState(completeState)
  }, [currentView, roomInternalView, selectedActor, characterSelections, currentRoom, currentPlayer])

  // Salva estado no modo solo (apenas localStorage)
  const saveSoloState = useCallback(() => {
    const nonSoloViews = ["menu", "lobby", "profile", "ranking", "stats", "admin-tests"]
    if (currentRoom || currentPlayer || nonSoloViews.includes(currentView)) return

    PlayerPersistence.saveAppState({
      currentView,
      selectedActor,
      characterSelections,
      timestamp: new Date().toISOString(),
      isSoloMode: true
    })
  }, [currentView, selectedActor, characterSelections, currentRoom, currentPlayer])

  // Reconexão automática após F5 em uma sala
  const handleReconnectPlayer = useCallback(
    async (savedData, savedAppState, loadedGameData = null, loadedLocalization = null) => {
      const loc = loadedLocalization || localization
      try {
        setLoading(true)
        setIsRestoringState(true)

        const roomResult = await RoomService.getRoomById(savedData.room.id)
        if (!roomResult.success || !roomResult.room) {
          PlayerPersistence.clearPlayerData()
          setCurrentView("menu")
          showToast(loc?.["UI.Error.RoomUnavailable"] || "A sala não está mais disponível. Voltando ao menu principal.", "warning")
          return
        }

        const reconnectResult = await RoomService.reconnectPlayer(savedData.player.id)
        if (!reconnectResult.success) {
          showToast(loc?.["UI.Error.ReconnectFailed"] || "Não foi possível reconectar. Voltando ao menu principal.", "error")
          PlayerPersistence.clearPlayerData()
          setCurrentView("menu")
          return
        }

        setCurrentRoom(roomResult.room)
        setCurrentPlayer(reconnectResult.player)

        // Prioridade de restauração: app_state do banco > character salvo > localStorage
        let stateToRestore = null
        if (reconnectResult.player.app_state?.timestamp) {
          stateToRestore = reconnectResult.player.app_state
        } else if (reconnectResult.player.character?.actor || reconnectResult.player.character?.selections) {
          stateToRestore = {
            selectedActor: reconnectResult.player.character.actor,
            characterSelections: reconnectResult.player.character.selections,
            roomInternalView: reconnectResult.player.status === "creating" ? "building" : "sheet",
            currentView: "room"
          }
        } else if (savedAppState) {
          stateToRestore = savedAppState
        }

        if (stateToRestore) {
          const dataToUse = loadedGameData || gameData
          if (stateToRestore.selectedActor) {
            const actorId = stateToRestore.selectedActor.ID || stateToRestore.selectedActor.id
            const foundActor = actorId && dataToUse?.ActorDefinitions ? dataToUse.ActorDefinitions.find((a) => a.ID === actorId) : null
            setSelectedActor(foundActor || stateToRestore.selectedActor)
          }

          if (stateToRestore.characterSelections) {
            setCharacterSelections(stateToRestore.characterSelections)
          }

          const rawInternalView = stateToRestore.roomInternalView || "selection"
          setRoomInternalView(rawInternalView === "lobby" ? "selection" : rawInternalView)
        } else {
          setRoomInternalView("selection")
        }

        setCurrentView("room")
        PlayerPersistence.updatePlayerData(reconnectResult.player)
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
  useEffect(() => {
    if (!PlayerPersistence.isSameSession()) {
      PlayerPersistence.generateSessionId()
    }

    Promise.all([fetch("GameEconomyData.json").then((r) => r.json()), fetch("LocalizationPortuguese.json").then((r) => r.json())])
      .then(([rawGameData, rawLocalization]) => {
        const loadedGameData = adaptGameData(rawGameData)
        const loadedLocalization = adaptLocalization(rawLocalization)

        setGameData(loadedGameData)
        setLocalization(loadedLocalization)

        const savedData = PlayerPersistence.getPlayerData()
        const savedAppState = PlayerPersistence.getAppState()

        if (savedData && PlayerPersistence.validateSavedData()) {
          PlayerPersistence.validateSessionWithServer().then((isValid) => {
            if (isValid) {
              handleReconnectPlayer(savedData, savedAppState, loadedGameData, loadedLocalization)
            }
          })
        } else if (savedAppState?.isSoloMode) {
          setIsRestoringState(true)
          if (savedAppState.selectedActor) {
            const actorId = savedAppState.selectedActor.ID || savedAppState.selectedActor.id
            const foundActor = actorId && loadedGameData.ActorDefinitions ? loadedGameData.ActorDefinitions.find((a) => a.ID === actorId) : null
            setSelectedActor(foundActor || savedAppState.selectedActor)
          }
          if (savedAppState.characterSelections) {
            setCharacterSelections(savedAppState.characterSelections)
          }
          if (savedAppState.currentView) {
            setCurrentView(savedAppState.currentView)
          }
          setTimeout(() => setIsRestoringState(false), 100)
        }
      })
      .catch((error) => {
        console.error("Erro ao carregar dados do jogo:", error)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ==================== HANDLERS DE NAVEGAÇÃO ====================

  const handleAuthSuccess = (user) => {
    onSessionAuthenticated(user)
    setCurrentView("menu")
    setSelectedActor(null)
    setCharacterSelections(null)
    PlayerPersistence.clearAppState()
  }

  const handleLogout = () => {
    PlayerPersistence.clearPlayerData()
    clearAuthState()
    resetTheme()
    setCurrentRoom(null)
    setCurrentPlayer(null)
    setSelectedActor(null)
    setCharacterSelections(null)
    setRoomInternalView("selection")
    setCurrentView("menu")
  }

  const handleCreateRoom = async (roomName, masterName) => {
    setLoading(true)
    const result = await RoomService.createRoom(roomName, masterName)

    if (result.success) {
      const playerResult = await RoomService.joinRoom(result.room.id, masterName, null, false, currentUser?.id || null)
      if (playerResult.success) {
        try {
          const setMaster = await RoomService.setRoomMasterPlayerId(result.room.id, playerResult.player.id)
          if (setMaster.success && setMaster.room) {
            result.room.master_player_id = playerResult.player.id
          }
        } catch (e) {
          console.warn("Não foi possível definir master_player_id:", e)
        }

        setCurrentRoom(result.room)
        setCurrentPlayer(playerResult.player)
        setRoomInternalView("selection")
        setCurrentView("room")
        PlayerPersistence.savePlayerData(playerResult.player, result.room)
      } else {
        showToast((localization?.["UI.Error.JoinRoom"] || "Erro ao entrar na sala: ") + playerResult.error, "error")
      }
    } else {
      showToast((localization?.["UI.Error.CreateRoom"] || "Erro ao criar sala: ") + result.error, "error")
    }
    setLoading(false)
  }

  const handleJoinRoom = async (roomId, playerName) => {
    setLoading(true)
    const result = await RoomService.joinRoom(roomId, playerName, null, true, currentUser?.id || null)

    if (result.success) {
      const roomResult = await RoomService.getRoomById(roomId)
      if (roomResult.success && roomResult.room) {
        setCurrentRoom(roomResult.room)
        setCurrentPlayer(result.player)
        setRoomInternalView("selection")
        setCurrentView("room")
        PlayerPersistence.savePlayerData(result.player, roomResult.room)
      } else {
        showToast(localization?.["UI.Error.RoomNotFound"] || "Sala não encontrada ou inativa", "error")
      }
    } else {
      showToast((localization?.["UI.Error.JoinRoom"] || "Erro ao entrar na sala: ") + result.error, "error")
    }
    setLoading(false)
  }

  const handleLeaveRoom = useCallback(async () => {
    if (currentPlayer) {
      await RoomService.leaveRoom(currentPlayer.id)
    }
    PlayerPersistence.clearPlayerData()
    setCurrentRoom(null)
    setCurrentPlayer(null)
    setSelectedActor(null)
    setCharacterSelections(null)
    setRoomInternalView("selection")
    setCurrentView("menu")
  }, [currentPlayer])

  const handleRoomStateChange = useCallback(({ roomInternalView: nextView, selectedActor: nextActor, characterSelections: nextSelections }) => {
    if (nextView !== undefined) setRoomInternalView(nextView)
    if (nextActor !== undefined) setSelectedActor(nextActor)
    if (nextSelections !== undefined) setCharacterSelections(nextSelections)
  }, [])

  const handleSoloCharacterSelect = (actor) => {
    setSelectedActor(actor)
    setCharacterSelections({})
    setCurrentView("builder")
  }

  const handleSoloCharacterCreate = (selections) => {
    setCharacterSelections(selections)
    setCurrentView("sheet")
  }

  const handleSoloReset = () => {
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
            <img src="KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block mb-4" style={{ maxHeight: "250px" }} />
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
        <ToastComponent />
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
                profile={userProfile}
                onLogout={handleLogout}
                onNavigate={setCurrentView}
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
              <img src="KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block my-3" style={{ maxHeight: "300px" }} />
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
            onBack={() => setCurrentView("menu")}
            localization={localization}
            defaultPlayerName={userProfile?.display_name || currentUser?.user_metadata?.display_name || ""}
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
            onStateChange={handleRoomStateChange}
          />
        </Suspense>
      )}

      {currentView === "selection" && (
        <>
          <header className="row">
            <div className="col-12 text-center">
              <img src="KillOrDieLogo.png" alt="Kill or Die" className="img-fluid rounded mx-auto d-block my-3" style={{ maxHeight: "300px" }} />
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

      {currentView === "profile" && currentUser && (
        <Suspense fallback={<LoadingFallback />}>
          <ProfilePage user={currentUser} onBack={() => setCurrentView("menu")} localization={localization} />
        </Suspense>
      )}

      {currentView === "ranking" && (
        <Suspense fallback={<LoadingFallback />}>
          <RankingPage user={currentUser} onBack={() => setCurrentView("menu")} localization={localization} />
        </Suspense>
      )}

      {currentView === "stats" && currentUser && (
        <Suspense fallback={<LoadingFallback />}>
          <StatsPage
            user={currentUser}
            initialTargetUserId={statsTargetUserId}
            onBack={() => {
              setStatsTargetUserId(null)
              setCurrentView("menu")
            }}
          />
        </Suspense>
      )}

      {currentView === "admin-tests" && currentUser && (
        <Suspense fallback={<LoadingFallback />}>
          <TestRunnerPage user={currentUser} gameData={gameData} localization={localization} onBack={() => setCurrentView("menu")} />
        </Suspense>
      )}
      <ToastComponent />
    </main>
  )
}

export default App
