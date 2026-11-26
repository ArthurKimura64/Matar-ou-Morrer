import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"

// Controladores leves de Modal e Toast compatíveis com Bootstrap 6
const modalInstances = new WeakMap()
class Modal {
  constructor(el) {
    this.el = el
    modalInstances.set(el, this)
    el.querySelectorAll('[data-bs-dismiss="modal"]').forEach((btn) => {
      btn.onclick = () => this.hide()
    })
    el.onclick = (e) => {
      if (e.target === el) this.hide()
    }
  }
  show() {
    if (!this.el) return
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove())
    const backdrop = document.createElement("div")
    backdrop.className = "modal-backdrop"
    document.body.appendChild(backdrop)
    this.el.classList.add("show")
    document.body.style.overflow = "hidden"
  }
  hide() {
    if (!this.el) return
    this.el.classList.remove("show")
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove())
    document.body.style.overflow = ""
  }
  static getInstance(el) {
    return modalInstances.get(el) || new Modal(el)
  }
}

class Toast {
  constructor(el, opts = {}) {
    this.el = el
    this.delay = opts.delay || 4000
  }
  show() {
    if (!this.el) return
    this.el.classList.add("show")
    clearTimeout(this.el._toastTimer)
    this.el._toastTimer = setTimeout(() => {
      this.el.classList.remove("show")
    }, this.delay)
  }
  static getOrCreateInstance(el, opts) {
    return new Toast(el, opts)
  }
}

let supabase = null
let currentUser = null
let debounceTimer = null
let currentDetailUserId = null
let currentDetailRoomId = null
let userMatchesCache = {}
let currentEditingMatchesMap = {}
let cachedAllUsers = []
let cachedCharacterNames = []

// ========== INIT ==========
async function initApp() {
  var storedUrl = localStorage.getItem("supabase_url")
  var storedKey = localStorage.getItem("supabase_key")

  // Se abriu direto em aba anônima ou navegador limpo, busca as chaves públicas do servidor
  if (!storedUrl || !storedKey) {
    try {
      var cfgRes = await fetch("/api/public-config")
      if (cfgRes.ok) {
        var cfg = await cfgRes.json()
        storedUrl = cfg.supabaseUrl
        storedKey = cfg.supabaseAnonKey
        if (storedUrl && storedKey) {
          localStorage.setItem("supabase_url", storedUrl)
          localStorage.setItem("supabase_key", storedKey)
        }
      }
    } catch (e) {
      console.warn("Não foi possível buscar /api/public-config:", e)
    }
  }

  if (!storedUrl || !storedKey) {
    document.getElementById("mainContent").innerHTML =
      '<div class="d-flex justify-content-center align-items-center" style="min-height:80vh"><div class="text-center"><h4 class="text-white mb-3">⚠️ Configuração Necessária</h4><p class="text-muted">Acesse o jogo principal primeiro no mesmo navegador e faça login.</p><a href="/" class="btn btn-primary mt-2">Ir ao Jogo</a></div></div>'
    return
  }
  supabase = createClient(storedUrl, storedKey)

  var {
    data: { session }
  } = await supabase.auth.getSession()
  var user = session?.user
  if (!user) {
    var userRes = await supabase.auth.getUser()
    user = userRes.data?.user
  }
  if (!user) {
    showAccessDenied("Faça login primeiro na aplicação principal.")
    return
  }
  currentUser = user

  var { data: isAdmin, error: adminErr } = await supabase.rpc("is_user_admin", { p_user_id: user.id })
  if (adminErr || !isAdmin) {
    showAccessDenied("Sua conta não possui permissão de administrador.")
    return
  }

  await loadCharacterList()
  setupTabs()
  loadDashboard()
}

async function loadCharacterList() {
  try {
    var [res, locRes] = await Promise.all([fetch("/GameEconomyData.json"), fetch("/LocalizationPortuguese.json")])
    var data = await res.json()
    var loc = await locRes.json()
    var ids = (data.ActorDefinitions || []).map(function (a) {
      return a.ID
    })
    var chars = ids
      .map(function (id) {
        var key = "Character.Name." + id
        var displayName = loc[key] ?? id
        return { id: id, name: String(displayName).trim() }
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "pt-BR")
      })

    cachedCharacterNames = chars.map(function (c) {
      return c.name
    })

    ;["newMatchChar", "editMatchChar"].forEach(function (selId) {
      var sel = document.getElementById(selId)
      chars.forEach(function (c) {
        var opt = document.createElement("option")
        opt.value = c.name
        opt.textContent = c.name
        sel.appendChild(opt)
      })
    })
  } catch (e) {
    console.warn("Não foi possível carregar lista de personagens:", e)
  }
}

function showAccessDenied(msg) {
  document.getElementById("mainContent").innerHTML =
    '<div class="d-flex justify-content-center align-items-center" style="min-height:80vh"><div class="text-center"><h4 class="text-danger mb-3">🔒 Acesso Negado</h4><p class="text-muted">' +
    escapeHtml(msg) +
    '</p><a href="/" class="btn btn-primary mt-2">Voltar ao Jogo</a></div></div>'
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ""
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function formatDate(d) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—"
}

async function getToken() {
  var session = await supabase.auth.getSession()
  return session.data.session?.access_token
}

async function parseApiJson(res) {
  var contentType = res.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Rota /api indisponível neste servidor local. Rode com 'npm run dev' (Vite) ou teste publicado na Vercel."
    )
  }
  var data = await res.json()
  if (!res.ok) throw new Error(data.error || "Erro ao processar requisição")
  return data
}

function setupTabs() {
  document.querySelectorAll("[data-tab]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault()
      var tab = link.getAttribute("data-tab")
      document.querySelectorAll(".admin-tab-section").forEach(function (t) {
        t.classList.add("d-none")
      })
      document.getElementById("tab-" + tab).classList.remove("d-none")
      document.querySelectorAll("[data-tab]").forEach(function (l) {
        l.classList.remove("active")
      })
      link.classList.add("active")

      if (tab === "users") {
        closeUserDetail()
        loadUsers()
      }
      if (tab === "rooms") {
        closeRoomDetail()
        loadRooms()
      }
      if (tab === "matches") loadGlobalMatches()
      if (tab === "dashboard") loadDashboard()
      if (tab === "logs") loadAuditLog("reset")

      document.getElementById("sidebar").classList.remove("show")
      document.getElementById("sidebarOverlay").classList.add("d-none")
    })
  })
}

function showToast(msg, type) {
  type = type || "success"
  var icons = { success: "✅", danger: "❌", warning: "⚠️", info: "ℹ️" }
  document.getElementById("toastIcon").textContent = icons[type] || ""
  document.getElementById("toastMsg").textContent = msg
  var t = document.getElementById("toast")
  t.className = "toast text-bg-" + type
  Toast.getOrCreateInstance(t, { delay: 4000 }).show()
}

function showLoading() {
  document.getElementById("loadingOverlay").classList.remove("d-none")
}
function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("d-none")
}

// ========== 1. DASHBOARD ==========
window.loadDashboard = async function () {
  try {
    var result = await supabase.rpc("admin_get_dashboard")
    if (result.error) throw result.error
    var data = result.data
    document.getElementById("dashStatUsers").textContent = data.total_users || 0
    document.getElementById("dashStatRooms").textContent = data.active_rooms || 0
    document.getElementById("dashStatMatches").textContent = data.total_matches || 0
    document.getElementById("dashStatConnected").textContent = data.connected_players || 0

    loadRegistrationStatus()

    var topHtml = ""
    if (data.top_players && data.top_players.length) {
      var medals = ["🥇", "🥈", "🥉"]
      topHtml = '<div class="list-group list-group-flush">'
      data.top_players.slice(0, 5).forEach(function (p, i) {
        topHtml +=
          '<div class="list-group-item bg-transparent text-light border-secondary d-flex justify-content-between"><span>' +
          (medals[i] || "•") +
          " " +
          escapeHtml(p.display_name || "?") +
          '</span><span class="badge bg-primary">' +
          (p.composite_score || 0) +
          " pts</span></div>"
      })
      topHtml += "</div>"
    } else {
      topHtml = '<p class="text-muted small mb-0">Nenhum jogador no ranking ainda.</p>'
    }
    document.getElementById("topPlayers").innerHTML = topHtml

    var actHtml = ""
    if (data.recent_matches && data.recent_matches.length) {
      actHtml = '<div class="list-group list-group-flush">'
      data.recent_matches.slice(0, 5).forEach(function (m) {
        var winLabel = m.winner_player_name ? " (🏆 " + escapeHtml(m.winner_player_name) + ")" : ""
        actHtml +=
          '<div class="list-group-item bg-transparent text-light border-secondary d-flex justify-content-between"><span>🎮 ' +
          escapeHtml(m.room_name || "Sala") +
          winLabel +
          '</span><small class="text-muted">' +
          formatDate(m.ended_at) +
          "</small></div>"
      })
      actHtml += "</div>"
    } else {
      actHtml = '<p class="text-muted small mb-0">Nenhuma partida recente.</p>'
    }
    document.getElementById("recentActivity").innerHTML = actHtml
  } catch (e) {
    showToast("Erro ao carregar dashboard: " + e.message, "danger")
  }
}

async function loadRegistrationStatus() {
  try {
    var result = await supabase.rpc("get_app_setting", { p_key: "registration_open" })
    if (result.error) throw result.error
    var isOpen = result.data === "true"
    var toggle = document.getElementById("regToggle")
    toggle.checked = isOpen
    toggle.disabled = false
    var statusEl = document.getElementById("regStatusText")
    statusEl.textContent =
      isOpen ? "✅ Cadastros abertos — novos usuários podem criar conta." : "🚫 Cadastros fechados — apenas contas existentes podem entrar."
    statusEl.className = isOpen ? "text-success small" : "text-danger small"
  } catch (e) {
    document.getElementById("regStatusText").textContent = "Erro ao carregar status."
  }
}

window.toggleRegistration = async function () {
  var toggle = document.getElementById("regToggle")
  var newValue = toggle.checked ? "true" : "false"
  toggle.disabled = true
  try {
    var result = await supabase.rpc("admin_update_setting", { p_key: "registration_open", p_value: newValue })
    if (result.error) throw result.error
    showToast(toggle.checked ? "Cadastros abertos!" : "Cadastros fechados!")
    loadRegistrationStatus()
  } catch (e) {
    toggle.checked = !toggle.checked
    toggle.disabled = false
    showToast("Erro ao alterar cadastros: " + e.message, "danger")
  }
}

// ========== 2. USERS ==========
window.debounceLoadUsers = function () {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(loadUsers, 400)
}

window.loadUsers = async function () {
  try {
    var search = document.getElementById("userSearch").value || null
    var bannedOnly = document.getElementById("bannedOnly").checked
    var result = await supabase.rpc("admin_list_users", { p_search: search, p_banned_only: bannedOnly, p_limit: 200 })
    if (result.error) throw result.error
    var data = result.data
    var users = data.users || []
    cachedAllUsers = users
    document.getElementById("userCount").textContent = data.total || 0
    var tbody = document.getElementById("usersTableBody")
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Nenhum usuário encontrado.</td></tr>'
      return
    }
    tbody.innerHTML = users
      .map(function (u) {
        var eId = escapeHtml(u.id)
        var eName = escapeHtml(u.display_name || "")
        var rowClass = u.banned_at ? "table-danger" : ""
        var adminBadge = u.is_admin ? ' <span class="badge bg-warning text-dark">👑 Admin</span>' : ""
        var statusBadge =
          u.banned_at ? '<span class="badge badge-status bg-danger">Banido</span>' : '<span class="badge badge-status bg-success">Ativo</span>'
        var actions =
          '<button type="button" class="btn btn-outline-primary btn-action me-1" title="Gerenciar" data-action="open-user" data-id="' +
          eId +
          '">✏️</button>'
        if (!u.is_admin) {
          var banBtn =
            u.banned_at ?
              '<button type="button" class="btn btn-outline-success btn-action" title="Desbanir" data-action="unban-user" data-id="' +
              eId +
              '" data-name="' +
              eName +
              '">✅</button>'
            : '<button type="button" class="btn btn-outline-warning btn-action" title="Banir" data-action="ban-user" data-id="' +
              eId +
              '" data-name="' +
              eName +
              '">🚫</button>'
          actions +=
            banBtn +
            '<button type="button" class="btn btn-outline-secondary btn-action" title="Mudar senha" data-action="change-pass" data-id="' +
            eId +
            '" data-name="' +
            eName +
            '">🔑</button>' +
            '<button type="button" class="btn btn-outline-danger btn-action" title="Deletar" data-action="delete-user" data-id="' +
            eId +
            '" data-name="' +
            eName +
            '">🗑️</button>'
        }
        return (
          '<tr class="clickable-row ' +
          rowClass +
          '" data-action="open-user" data-id="' +
          eId +
          '">' +
          "<td>" +
          eName +
          adminBadge +
          "</td>" +
          "<td>" +
          (u.total_matches || 0) +
          "</td>" +
          "<td>" +
          (u.total_wins || 0) +
          "</td>" +
          "<td>" +
          (u.total_eliminations || 0) +
          "</td>" +
          "<td>" +
          (u.composite_score || 0) +
          "</td>" +
          "<td>" +
          statusBadge +
          "</td>" +
          "<td><small>" +
          formatDate(u.created_at) +
          "</small></td>" +
          '<td><div class="d-flex gap-1 flex-wrap">' +
          actions +
          "</div></td>" +
          "</tr>"
        )
      })
      .join("")
  } catch (e) {
    showToast("Erro ao carregar usuários: " + e.message, "danger")
  }
}

window.toggleCreateUser = function () {
  document.getElementById("createUserForm").classList.toggle("d-none")
}

window.createUser = async function (e) {
  e.preventDefault()
  showLoading()
  try {
    var token = await getToken()
    var res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        displayName: document.getElementById("newUserName").value,
        email: document.getElementById("newUserEmail").value,
        password: document.getElementById("newUserPass").value
      })
    })
    await parseApiJson(res)
    showToast("Conta criada com sucesso!")
    document.getElementById("createUserForm").classList.add("d-none")
    document.getElementById("newUserName").value = ""
    document.getElementById("newUserEmail").value = ""
    document.getElementById("newUserPass").value = ""
    loadUsers()
  } catch (err) {
    showToast(err.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== USER DETAIL & STATS ==========
window.openUserDetail = async function (userId) {
  currentDetailUserId = userId
  document.getElementById("userListView").classList.add("d-none")
  document.getElementById("userDetailView").classList.remove("d-none")
  showLoading()
  try {
    var result = await supabase.rpc("admin_get_user_details", { p_user_id: userId })
    if (result.error) throw result.error
    var data = result.data
    var p = data.profile
    var s = data.stats

    document.getElementById("detailUserName").textContent = p.display_name || "—"
    document.getElementById("detailUserId").textContent = "ID: " + p.id
    document.getElementById("detailCreated").textContent = formatDate(p.created_at)
    document.getElementById("detailStatus").innerHTML =
      p.banned_at ? '<span class="badge bg-danger">Banido em ' + formatDate(p.banned_at) + "</span>" : '<span class="badge bg-success">Ativo</span>'
    document.getElementById("detailBanReason").textContent = p.ban_reason || "—"
    document.getElementById("detailFavChar").textContent = s.favorite_character || "—"
    document.getElementById("detailWinRate").textContent = (s.win_rate || 0) + "%"

    document.getElementById("userStatMatches").value = s.total_matches || 0
    document.getElementById("userStatWins").value = s.total_wins || 0
    document.getElementById("userStatEliminations").value = s.total_eliminations || 0
    document.getElementById("userStatSurvival").value = s.total_survival_points || 0
    document.getElementById("userStatScore").value = s.composite_score || 0
    document.getElementById("editDisplayName").value = p.display_name || ""

    var eId = escapeHtml(p.id)
    var eName = escapeHtml(p.display_name || "")
    var actionsHtml = ""
    if (!p.is_admin) {
      if (p.banned_at) {
        actionsHtml +=
          '<button type="button" class="btn btn-sm btn-outline-success" data-action="unban-user" data-id="' +
          eId +
          '" data-name="' +
          eName +
          '">✅ Desbanir</button>'
      } else {
        actionsHtml +=
          '<button type="button" class="btn btn-sm btn-outline-warning" data-action="ban-user" data-id="' +
          eId +
          '" data-name="' +
          eName +
          '">🚫 Banir</button>'
      }
      actionsHtml +=
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="change-pass" data-id="' +
        eId +
        '" data-name="' +
        eName +
        '">🔑 Mudar Senha</button>'
      actionsHtml +=
        '<button type="button" class="btn btn-sm btn-outline-warning" data-action="reset-stats" data-id="' +
        eId +
        '" data-name="' +
        eName +
        '">🧹 Zerar Stats</button>'
      actionsHtml +=
        '<button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-user" data-id="' +
        eId +
        '" data-name="' +
        eName +
        '">🗑️ Deletar Conta</button>'
    }
    document.getElementById("detailActions").innerHTML = actionsHtml

    var matches = data.matches || []
    userMatchesCache = {}
    var mtbody = document.getElementById("userMatchesBody")
    if (!matches.length) {
      mtbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Nenhuma partida registrada para este jogador.</td></tr>'
    } else {
      mtbody.innerHTML = matches
        .map(function (m) {
          userMatchesCache[m.match_id] = m
          var eMatchId = escapeHtml(m.match_id || "")
          var eRoomName = escapeHtml(m.room_name || "")
          var resultBadge =
            m.is_winner ?
              '<span class="badge bg-success">🏆 Vitória</span>'
            : '<span class="badge bg-danger">💀 ' + (m.elimination_order ? "#" + m.elimination_order : "Derrota") + "</span>"
          var killedByInfo = m.killed_by_player_name ? ' <small class="text-muted">(por ' + escapeHtml(m.killed_by_player_name) + ")</small>" : ""
          var shortId = escapeHtml((m.match_id || "").substring(0, 8))

          return (
            "<tr>" +
            "<td>" +
            (eRoomName || "—") +
            "</td>" +
            "<td>" +
            escapeHtml(m.character_name || "—") +
            "</td>" +
            "<td>" +
            resultBadge +
            killedByInfo +
            "</td>" +
            "<td>" +
            (m.eliminations_made || 0) +
            "</td>" +
            "<td>" +
            (m.survival_points || 0) +
            "</td>" +
            "<td><small>" +
            formatDate(m.ended_at) +
            "</small></td>" +
            '<td><code class="text-info" style="cursor:pointer;font-size:11px" title="Clique para copiar ID" data-action="copy-match" data-id="' +
            eMatchId +
            '">' +
            shortId +
            "…</code></td>" +
            '<td><div class="d-flex gap-1">' +
            '<button type="button" class="btn btn-outline-primary btn-action" title="Editar participação" data-action="edit-match" data-id="' +
            eMatchId +
            '">✏️</button>' +
            '<button type="button" class="btn btn-outline-warning btn-action" title="Remover apenas deste jogador" data-action="remove-part" data-id="' +
            eMatchId +
            '" data-name="' +
            eRoomName +
            '">👤➖</button>' +
            '<button type="button" class="btn btn-outline-danger btn-action" title="Apagar partida inteira de todos" data-action="delete-match" data-id="' +
            eMatchId +
            '" data-name="' +
            eRoomName +
            '">🗑️</button>' +
            "</div></td>" +
            "</tr>"
          )
        })
        .join("")
    }
  } catch (e) {
    showToast("Erro ao carregar detalhes: " + e.message, "danger")
    closeUserDetail()
  } finally {
    hideLoading()
  }
}

window.closeUserDetail = function () {
  currentDetailUserId = null
  document.getElementById("userDetailView").classList.add("d-none")
  document.getElementById("userListView").classList.remove("d-none")
}

window.saveManualUserStats = async function () {
  if (!currentDetailUserId) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_update_user_stats", {
      p_user_id: currentDetailUserId,
      p_total_matches: parseInt(document.getElementById("userStatMatches").value) || 0,
      p_total_wins: parseInt(document.getElementById("userStatWins").value) || 0,
      p_total_eliminations: parseInt(document.getElementById("userStatEliminations").value) || 0,
      p_total_survival_points: parseInt(document.getElementById("userStatSurvival").value) || 0,
      p_composite_score: parseFloat(document.getElementById("userStatScore").value) || 0
    })
    if (result.error) throw result.error
    showToast("Estatísticas atualizadas manualmente!")
    openUserDetail(currentDetailUserId)
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.recalculateUserStats = async function () {
  if (!currentDetailUserId) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_recalculate_user_stats", { p_user_id: currentDetailUserId })
    if (result.error) throw result.error
    showToast("Estatísticas sincronizadas com o histórico de partidas!")
    openUserDetail(currentDetailUserId)
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.saveUserProfile = async function (e) {
  e.preventDefault()
  if (!currentDetailUserId) return
  showLoading()
  try {
    var newName = document.getElementById("editDisplayName").value.trim()
    var result = await supabase.rpc("admin_update_user_profile", {
      p_user_id: currentDetailUserId,
      p_display_name: newName
    })
    if (result.error) throw result.error
    showToast("Nome atualizado!")
    document.getElementById("detailUserName").textContent = newName
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== CREATE / EDIT / DELETE MATCH (ABA USUÁRIOS) ==========
window.toggleCreateMatch = function () {
  var form = document.getElementById("createMatchForm")
  form.classList.toggle("d-none")
  if (!form.classList.contains("d-none")) {
    var now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    document.getElementById("newMatchDate").value = now.toISOString().slice(0, 16)
  }
}

window.createMatch = async function (e) {
  e.preventDefault()
  if (!currentDetailUserId) return
  showLoading()
  try {
    var endedAt = document.getElementById("newMatchDate").value
    var existingId = document.getElementById("newMatchExistingId").value.trim() || null
    var elimOrderVal = document.getElementById("newMatchElimOrder").value
    var isWin = document.getElementById("newMatchWinner").checked
    var params = {
      p_user_id: currentDetailUserId,
      p_room_name: document.getElementById("newMatchRoom").value.trim() || "Matar ou Morrer",
      p_character_name: document.getElementById("newMatchChar").value.trim() || null,
      p_is_winner: isWin,
      p_elimination_order: !isWin && elimOrderVal !== "" ? parseInt(elimOrderVal) : null,
      p_killed_by: document.getElementById("newMatchKilledBy").value.trim() || null,
      p_survival_points: parseInt(document.getElementById("newMatchSurvival").value) || 0,
      p_eliminations: parseInt(document.getElementById("newMatchKills").value) || 0,
      p_total_players: parseInt(document.getElementById("newMatchPlayers").value) || 2,
      p_ended_at: endedAt ? new Date(endedAt).toISOString() : new Date().toISOString(),
      p_match_id: existingId
    }

    var result = await supabase.rpc("admin_create_match", params)
    if (result.error) throw result.error
    var matchId = result.data?.match_id || ""
    showToast("Partida registrada e estatísticas atualizadas!")
    document.getElementById("newMatchExistingId").value = matchId
    openUserDetail(currentDetailUserId)
  } catch (err) {
    showToast(err.message, "danger")
  } finally {
    hideLoading()
  }
}

window.copyMatchId = function (matchId) {
  if (!navigator.clipboard?.writeText) {
    showToast("Copie manualmente: " + matchId, "info")
    return
  }
  navigator.clipboard
    .writeText(matchId)
    .then(function () {
      showToast("ID copiado: " + matchId.substring(0, 8) + "…")
    })
    .catch(function () {
      showToast("Não foi possível copiar o ID automaticamente.", "warning")
    })
}

window.openEditMatchById = function (matchId) {
  var data = userMatchesCache[matchId]
  if (!data) return

  document.getElementById("editMatchId").value = data.match_id
  document.getElementById("editMatchRoom").value = data.room_name || ""

  var charSelect = document.getElementById("editMatchChar")
  var charVal = (data.character_name || "").trim()
  if (charVal && !Array.from(charSelect.options).some((o) => o.value.trim() === charVal)) {
    var customOpt = document.createElement("option")
    customOpt.value = charVal
    customOpt.textContent = charVal
    charSelect.appendChild(customOpt)
  }
  charSelect.value = charVal

  document.getElementById("editMatchPlayers").value = data.total_players || 2
  document.getElementById("editMatchSurvival").value = data.survival_points ?? 0
  document.getElementById("editMatchKills").value = data.eliminations_made ?? 0
  document.getElementById("editMatchElimOrder").value = data.elimination_order ?? ""
  document.getElementById("editMatchKilledBy").value = data.killed_by_player_name || ""
  document.getElementById("editMatchWinner").checked = !!data.is_winner

  if (data.ended_at) {
    var d = new Date(data.ended_at)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    document.getElementById("editMatchDate").value = d.toISOString().slice(0, 16)
  } else {
    document.getElementById("editMatchDate").value = ""
  }
  Modal.getInstance(document.getElementById("editMatchModal")).show()
}

document.getElementById("editMatchConfirmBtn").addEventListener("click", async function () {
  if (!currentDetailUserId) return
  var matchId = document.getElementById("editMatchId").value
  if (!matchId) return
  showLoading()
  try {
    var endedAt = document.getElementById("editMatchDate").value
    var isWin = document.getElementById("editMatchWinner").checked
    var elimOrderVal = document.getElementById("editMatchElimOrder").value
    var params = {
      p_match_id: matchId,
      p_user_id: currentDetailUserId,
      p_room_name: document.getElementById("editMatchRoom").value.trim() || null,
      p_character_name: document.getElementById("editMatchChar").value.trim() || null,
      p_is_winner: isWin,
      p_elimination_order: !isWin && elimOrderVal !== "" ? parseInt(elimOrderVal) : null,
      p_killed_by: document.getElementById("editMatchKilledBy").value.trim() || null,
      p_survival_points: parseInt(document.getElementById("editMatchSurvival").value) || 0,
      p_eliminations: parseInt(document.getElementById("editMatchKills").value) || 0,
      p_total_players: parseInt(document.getElementById("editMatchPlayers").value) || null,
      p_ended_at: endedAt ? new Date(endedAt).toISOString() : null
    }
    var result = await supabase.rpc("admin_update_match_participant", params)
    if (result.error) throw result.error
    showToast("Partida atualizada e estatísticas recalculadas!")
    Modal.getInstance(document.getElementById("editMatchModal")).hide()
    openUserDetail(currentDetailUserId)
  } catch (err) {
    showToast(err.message, "danger")
  } finally {
    hideLoading()
  }
})

window.removeMatchParticipant = async function (matchId, roomName) {
  if (!currentDetailUserId) return
  if (!confirm('Remover a participação deste jogador na partida "' + roomName + '"?\nAs estatísticas dele serão recalculadas automaticamente.'))
    return
  showLoading()
  try {
    var result = await supabase.rpc("admin_delete_match_participant", {
      p_match_id: matchId,
      p_user_id: currentDetailUserId
    })
    if (result.error) throw result.error
    showToast("Participação removida e estatísticas atualizadas!")
    openUserDetail(currentDetailUserId)
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.deleteMatch = async function (matchId, roomName) {
  if (!confirm('Remover partida "' + roomName + '" do histórico? Isso recalcula as estatísticas de TODOS os participantes.')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_delete_match", { p_match_id: matchId })
    if (result.error) throw result.error
    showToast("Partida removida e estatísticas atualizadas.")
    if (currentDetailUserId) openUserDetail(currentDetailUserId)
    else loadGlobalMatches()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== BAN / PASSWORD / RESET / DELETE USER ==========
var banUserId = null
window.openBanModal = function (id, name) {
  banUserId = id
  document.getElementById("banUserName").textContent = name
  document.getElementById("banReason").value = "Violação das regras"
  Modal.getInstance(document.getElementById("banModal")).show()
}

document.getElementById("banConfirmBtn").addEventListener("click", async function () {
  if (!banUserId) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_ban_user", { p_user_id: banUserId, p_reason: document.getElementById("banReason").value })
    if (result.error) throw result.error
    showToast("Usuário banido.")
    Modal.getInstance(document.getElementById("banModal")).hide()
    if (currentDetailUserId === banUserId) openUserDetail(banUserId)
    else loadUsers()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
    banUserId = null
  }
})

window.unbanUser = async function (id, name) {
  if (!confirm('Desbanir "' + name + '"?')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_unban_user", { p_user_id: id })
    if (result.error) throw result.error
    showToast('"' + name + '" desbanido.')
    if (currentDetailUserId === id) openUserDetail(id)
    else loadUsers()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

var passUserId = null
window.openPasswordModal = function (id, name) {
  passUserId = id
  document.getElementById("passUserName").textContent = name
  document.getElementById("newPassword").value = ""
  Modal.getInstance(document.getElementById("passwordModal")).show()
}

document.getElementById("passConfirmBtn").addEventListener("click", async function () {
  var pw = document.getElementById("newPassword").value
  if (!passUserId || pw.length < 6) {
    showToast("Senha deve ter no mínimo 6 caracteres.", "warning")
    return
  }
  showLoading()
  try {
    var token = await getToken()
    var res = await fetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ userId: passUserId, newPassword: pw })
    })
    await parseApiJson(res)
    showToast("Senha alterada com sucesso!")
    Modal.getInstance(document.getElementById("passwordModal")).hide()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
    passUserId = null
  }
})

window.resetStats = async function (id, name) {
  if (!confirm('Zerar estatísticas de "' + name + '"?')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_reset_user_stats", { p_user_id: id })
    if (result.error) throw result.error
    showToast('Stats de "' + name + '" zeradas.')
    if (currentDetailUserId === id) openUserDetail(id)
    else loadUsers()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.deleteUser = async function (id, name) {
  if (!confirm('ATENÇÃO: Deletar permanentemente "' + name + '"?')) return
  showLoading()
  try {
    var token = await getToken()
    var res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ userId: id })
    })
    await parseApiJson(res)
    showToast('Conta "' + name + '" deletada.')
    if (currentDetailUserId === id) {
      closeUserDetail()
      loadUsers()
    } else loadUsers()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== 3. ROOMS ==========
window.loadRooms = async function () {
  try {
    var includeInactive = document.getElementById("showInactive").checked
    var result = await supabase.rpc("admin_list_rooms", { p_include_inactive: includeInactive, p_limit: 100 })
    if (result.error) throw result.error
    var data = result.data
    var rooms = data.rooms || []
    document.getElementById("roomCount").textContent = data.total || 0
    var tbody = document.getElementById("roomsTableBody")
    if (!rooms.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nenhuma sala encontrada.</td></tr>'
      return
    }
    tbody.innerHTML = rooms
      .map(function (r) {
        var eId = escapeHtml(r.id)
        var eName = escapeHtml(r.name || "")
        var statusBadge =
          r.match_status ? '<span class="badge badge-status bg-warning text-dark">Em Partida</span>'
          : r.is_active ? '<span class="badge badge-status bg-success">Ativa</span>'
          : '<span class="badge badge-status bg-secondary">Inativa</span>'
        var forceBtn =
          r.match_status ?
            '<button type="button" class="btn btn-outline-warning btn-action" title="Forçar fim da partida" data-action="force-end" data-id="' +
            eId +
            '" data-name="' +
            eName +
            '">⏹️</button>'
          : ""
        return (
          '<tr class="clickable-row" data-action="open-room" data-id="' +
          eId +
          '">' +
          '<td><code class="text-info">' +
          eId +
          "</code></td>" +
          "<td>" +
          eName +
          "</td>" +
          "<td>" +
          escapeHtml(r.master_name || "—") +
          "</td>" +
          '<td><span class="badge bg-info text-dark">' +
          (r.connected_players || 0) +
          '</span><small class="text-muted">/' +
          (r.total_players || 0) +
          "</small></td>" +
          "<td>" +
          statusBadge +
          "</td>" +
          "<td><small>" +
          formatDate(r.created_at) +
          "</small></td>" +
          '<td><div class="d-flex gap-1">' +
          '<button type="button" class="btn btn-outline-primary btn-action" title="Gerenciar sala" data-action="open-room" data-id="' +
          eId +
          '">👁️</button>' +
          forceBtn +
          '<button type="button" class="btn btn-outline-danger btn-action" title="Deletar sala" data-action="delete-room" data-id="' +
          eId +
          '" data-name="' +
          eName +
          '">🗑️</button>' +
          "</div></td>" +
          "</tr>"
        )
      })
      .join("")
  } catch (e) {
    showToast("Erro ao carregar salas: " + e.message, "danger")
  }
}

window.openRoomDetail = async function (roomId) {
  currentDetailRoomId = roomId
  document.getElementById("roomListView").classList.add("d-none")
  document.getElementById("roomDetailView").classList.remove("d-none")
  showLoading()
  try {
    var result = await supabase.rpc("admin_get_room_detail", { p_room_id: roomId })
    if (result.error) throw result.error
    var data = result.data
    var r = data.room
    var players = data.players || []

    document.getElementById("roomDetailName").textContent = r.name || "—"
    document.getElementById("roomDetailId").textContent = "Código: " + r.id
    document.getElementById("roomDetailMaster").textContent = r.master_name || "—"
    document.getElementById("roomDetailCreated").textContent = formatDate(r.created_at)
    document.getElementById("roomDetailActivity").textContent = formatDate(r.last_activity)

    var statusHtml =
      r.match_status ? '<span class="badge bg-warning text-dark">Em Partida</span>'
      : r.is_active ? '<span class="badge bg-success">Ativa</span>'
      : '<span class="badge bg-secondary">Inativa</span>'
    document.getElementById("roomDetailStatus").innerHTML = statusHtml

    var eRoomId = escapeHtml(r.id)
    var eRoomName = escapeHtml(r.name || "")
    var actHtml =
      '<button type="button" class="btn btn-sm btn-outline-info" data-action="clear-combats" data-id="' +
      eRoomId +
      '">⚔️ Limpar Combates Travados</button>'
    if (r.match_status) {
      actHtml +=
        '<button type="button" class="btn btn-sm btn-outline-warning" data-action="force-end" data-id="' +
        eRoomId +
        '" data-name="' +
        eRoomName +
        '">⏹️ Forçar Fim da Partida</button>'
    }
    actHtml +=
      '<button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-room" data-id="' +
      eRoomId +
      '" data-name="' +
      eRoomName +
      '">🗑️ Deletar Sala</button>'
    document.getElementById("roomDetailActions").innerHTML = actHtml

    var ptbody = document.getElementById("roomPlayersBody")
    if (!players.length) {
      ptbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Nenhum jogador nesta sala.</td></tr>'
    } else {
      ptbody.innerHTML = players
        .map(function (p) {
          var ePId = escapeHtml(p.id)
          var ePName = escapeHtml(p.name || "")
          var connBadge = p.is_connected ? '<span class="badge bg-success">🟢 Sim</span>' : '<span class="badge bg-secondary">🔴 Não</span>'
          var statusBadge =
            p.status === "ready" ? '<span class="badge bg-primary">Pronto</span>'
            : p.status === "creating" ? '<span class="badge bg-info text-dark">Criando</span>'
            : '<span class="badge bg-secondary">Selecionando</span>'
          var accountName = p.display_name ? escapeHtml(p.display_name) : '<span class="text-muted">Sem conta</span>'
          if (p.banned_at) accountName += ' <span class="badge bg-danger">Banido</span>'

          var actions =
            '<button type="button" class="btn btn-outline-warning btn-action" title="Tornar Mestre da Sala" data-action="set-master" data-room-id="' +
            eRoomId +
            '" data-id="' +
            ePId +
            '" data-name="' +
            ePName +
            '">👑</button>'
          actions +=
            '<button type="button" class="btn btn-outline-danger btn-action" title="Expulsar da Sala" data-action="kick-player" data-room-id="' +
            eRoomId +
            '" data-id="' +
            ePId +
            '" data-name="' +
            ePName +
            '">👢</button>'
          if (p.user_id) {
            actions +=
              '<button type="button" class="btn btn-outline-primary btn-action" title="Ver Conta" data-action="goto-user" data-id="' +
              escapeHtml(p.user_id) +
              '">👁️</button>'
          }
          return (
            "<tr>" +
            "<td>" +
            ePName +
            "</td>" +
            "<td>" +
            accountName +
            "</td>" +
            "<td>" +
            escapeHtml(p.character_name || "—") +
            "</td>" +
            "<td>" +
            statusBadge +
            "</td>" +
            "<td>" +
            connBadge +
            "</td>" +
            "<td><small>" +
            formatDate(p.joined_at) +
            "</small></td>" +
            '<td><div class="d-flex gap-1">' +
            actions +
            "</div></td>" +
            "</tr>"
          )
        })
        .join("")
    }
  } catch (e) {
    showToast("Erro ao carregar sala: " + e.message, "danger")
    closeRoomDetail()
  } finally {
    hideLoading()
  }
}

window.closeRoomDetail = function () {
  currentDetailRoomId = null
  document.getElementById("roomDetailView").classList.add("d-none")
  document.getElementById("roomListView").classList.remove("d-none")
}

window.setRoomMaster = async function (roomId, playerId, name) {
  if (!confirm('Tornar "' + name + '" o novo Mestre desta sala?')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_set_room_master", { p_room_id: roomId, p_player_id: playerId })
    if (result.error) throw result.error
    showToast('"' + name + '" agora é o Mestre da sala!')
    openRoomDetail(roomId)
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.clearRoomCombats = async function (roomId) {
  if (!confirm("Limpar todos os combates ativos/travados nesta sala?")) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_clear_room_combats", { p_room_id: roomId })
    if (result.error) throw result.error
    showToast("Combates removidos: " + (result.data?.combats_removed || 0))
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.kickPlayer = async function (playerId, roomId, name) {
  if (!confirm('Expulsar "' + name + '" desta sala?')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_kick_from_room", { p_player_id: playerId, p_room_id: roomId })
    if (result.error) throw result.error
    showToast('"' + name + '" expulso da sala.')
    if (currentDetailRoomId) openRoomDetail(currentDetailRoomId)
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.goToUserFromRoom = function (userId) {
  document.querySelectorAll(".admin-tab-section").forEach(function (t) {
    t.classList.add("d-none")
  })
  document.getElementById("tab-users").classList.remove("d-none")
  document.querySelectorAll("[data-tab]").forEach(function (l) {
    l.classList.remove("active")
  })
  document.querySelector('[data-tab="users"]').classList.add("active")
  openUserDetail(userId)
}

window.forceEndMatch = async function (id, name) {
  if (!confirm('Forçar encerramento da partida na sala "' + name + '"?')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_force_end_match", { p_room_id: id })
    if (result.error) throw result.error
    showToast('Partida encerrada em "' + name + '".')
    if (currentDetailRoomId === id) openRoomDetail(id)
    else loadRooms()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.deleteRoom = async function (id, name) {
  if (!confirm('Deletar sala "' + name + '"?')) return
  showLoading()
  try {
    var result = await supabase.rpc("admin_delete_room", { p_room_id: id })
    if (result.error) throw result.error
    showToast('Sala "' + name + '" deletada.')
    if (currentDetailRoomId === id) closeRoomDetail()
    loadRooms()
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== 4. GLOBAL MATCHES (Edição Completa e Vínculo de Contas) ==========
async function ensureUsersAndCharsLoaded() {
  if (cachedAllUsers.length === 0) {
    var uRes = await supabase.rpc("admin_list_users", { p_search: null, p_banned_only: false, p_limit: 500 })
    if (!uRes.error && uRes.data?.users) {
      cachedAllUsers = uRes.data.users
    }
  }
}

window.loadGlobalMatches = async function () {
  try {
    await ensureUsersAndCharsLoaded()
    var result = await supabase.rpc("admin_get_match_history", { p_room_id: null, p_limit: 100, p_offset: 0 })
    if (result.error) throw result.error
    var data = result.data
    var matches = data.matches || []
    document.getElementById("globalMatchCount").textContent = data.total || 0
    var tbody = document.getElementById("globalMatchesBody")
    if (!matches.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nenhuma partida registrada.</td></tr>'
      return
    }

    currentEditingMatchesMap = {}
    tbody.innerHTML = matches
      .map(function (m) {
        currentEditingMatchesMap[m.id] = m
        var eMatchId = escapeHtml(m.id || "")
        var eRoomName = escapeHtml(m.room_name || "")
        var shortId = escapeHtml((m.id || "").substring(0, 8))
        var partList = (m.participants || [])
          .map(function (p) {
            var icon = p.is_winner ? "🏆" : "💀"
            var linkIcon =
              p.user_id ?
                '<span title="Vinculado à conta: ' + escapeHtml(p.account_name || "") + '">🔗</span>'
              : '<span title="Sem conta vinculada (clique em ✏️ para vincular)">⚠️</span>'
            var charText = p.character_name ? " (" + escapeHtml(p.character_name) + ")" : ""
            return linkIcon + " " + icon + " " + escapeHtml(p.player_name) + charText
          })
          .join(" &nbsp;|&nbsp; ")

        return (
          "<tr>" +
          '<td><code class="text-info" style="cursor:pointer" title="Copiar ID" data-action="copy-match" data-id="' +
          eMatchId +
          '">' +
          shortId +
          "…</code></td>" +
          "<td>" +
          (eRoomName || "—") +
          "</td>" +
          '<td><span class="text-success fw-bold">' +
          escapeHtml(m.winner_player_name || "—") +
          "</span></td>" +
          "<td>" +
          (m.total_players || 0) +
          "</td>" +
          '<td style="white-space:normal;min-width:280px;"><small class="text-light">' +
          (partList || '<span class="text-warning">⚠️ Sem participantes registrados (clique em ✏️)</span>') +
          "</small></td>" +
          "<td><small>" +
          formatDate(m.ended_at) +
          "</small></td>" +
          '<td><div class="d-flex gap-1">' +
          '<button type="button" class="btn btn-outline-primary btn-action" title="Editar Partida e Participantes" data-action="open-full-match" data-id="' +
          eMatchId +
          '">✏️</button>' +
          '<button type="button" class="btn btn-outline-danger btn-action" title="Deletar partida" data-action="delete-match" data-id="' +
          eMatchId +
          '" data-name="' +
          eRoomName +
          '">🗑️</button>' +
          "</div></td>" +
          "</tr>"
        )
      })
      .join("")
  } catch (e) {
    showToast("Erro ao carregar partidas: " + e.message, "danger")
  }
}

window.openFullMatchEditor = async function (matchId) {
  await ensureUsersAndCharsLoaded()
  var m = currentEditingMatchesMap[matchId]
  if (!m) {
    showToast("Dados da partida não encontrados.", "warning")
    return
  }

  document.getElementById("fullMatchId").value = m.id
  document.getElementById("fullMatchRoom").value = m.room_name || ""
  document.getElementById("fullMatchTotalPlayers").value = m.total_players || 2

  if (m.ended_at) {
    var d = new Date(m.ended_at)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    document.getElementById("fullMatchEndedAt").value = d.toISOString().slice(0, 16)
  } else {
    document.getElementById("fullMatchEndedAt").value = ""
  }

  var tbody = document.getElementById("fullMatchParticipantsBody")
  tbody.innerHTML = ""

  var parts = m.participants || []
  if (parts.length === 0 && m.winner_player_name) {
    addFullMatchParticipantRow({
      user_id: m.winner_user_id || "",
      player_name: m.winner_player_name,
      character_name: "",
      eliminations_made: 0,
      survival_points: Math.max((m.total_players || 2) - 1, 0),
      elimination_order: null,
      is_winner: true
    })
  } else {
    parts.forEach(function (p) {
      addFullMatchParticipantRow(p)
    })
  }

  Modal.getInstance(document.getElementById("fullMatchModal")).show()
}

window.addFullMatchParticipantRow = function (p = {}) {
  var tbody = document.getElementById("fullMatchParticipantsBody")
  var tr = document.createElement("tr")

  var userOptions =
    '<option value="">⚠️ Sem conta vinculada</option>' +
    cachedAllUsers
      .map(function (u) {
        var selected = p.user_id && p.user_id === u.id ? "selected" : ""
        return '<option value="' + escapeHtml(u.id) + '" ' + selected + ">🔗 " + escapeHtml(u.display_name) + "</option>"
      })
      .join("")

  var charOptions =
    '<option value="">— Sem personagem —</option>' +
    cachedCharacterNames
      .map(function (cName) {
        var selected = p.character_name && p.character_name.trim() === cName.trim() ? "selected" : ""
        return '<option value="' + escapeHtml(cName) + '" ' + selected + ">" + escapeHtml(cName) + "</option>"
      })
      .join("")

  if (p.character_name && !cachedCharacterNames.some((c) => c.trim() === p.character_name.trim())) {
    charOptions += '<option value="' + escapeHtml(p.character_name) + '" selected>' + escapeHtml(p.character_name) + "</option>"
  }

  tr.innerHTML =
    "" +
    '<td><select class="form-select form-select-sm search-input part-user-id">' +
    userOptions +
    "</select></td>" +
    '<td><input type="text" class="form-control form-control-sm search-input part-player-name" value="' +
    escapeHtml(p.player_name || "") +
    '" placeholder="Nome na sala"></td>' +
    '<td><select class="form-select form-select-sm search-input part-char-name">' +
    charOptions +
    "</select></td>" +
    '<td><input type="number" class="form-control form-control-sm search-input part-kills" value="' +
    (p.eliminations_made ?? 0) +
    '" min="0"></td>' +
    '<td><input type="number" class="form-control form-control-sm search-input part-survival" value="' +
    (p.survival_points ?? 0) +
    '" min="0"></td>' +
    '<td><input type="number" class="form-control form-control-sm search-input part-elim-order" value="' +
    (p.elimination_order ?? "") +
    '" min="1" placeholder="—"></td>' +
    '<td><input type="text" class="form-control form-control-sm search-input part-killed-by" value="' +
    escapeHtml(p.killed_by_player_name || "") +
    '" placeholder="Opcional"></td>' +
    '<td class="text-center"><input type="checkbox" class="form-check-input part-is-winner" ' +
    (p.is_winner ? "checked" : "") +
    "></td>" +
    '<td><button type="button" class="btn btn-outline-danger btn-action" data-action="remove-row" title="Remover participante">✕</button></td>'

  var selectEl = tr.querySelector(".part-user-id")
  var nameInput = tr.querySelector(".part-player-name")
  selectEl.addEventListener("change", function () {
    if (this.value && (!nameInput.value || nameInput.value.startsWith("Jogador"))) {
      nameInput.value = this.options[this.selectedIndex].text.replace("🔗 ", "").trim()
    }
  })

  tbody.appendChild(tr)
}

window.saveFullMatch = async function () {
  var matchId = document.getElementById("fullMatchId").value
  if (!matchId) return

  var rows = Array.from(document.querySelectorAll("#fullMatchParticipantsBody tr"))
  var participants = rows.map(function (tr) {
    var isWin = tr.querySelector(".part-is-winner").checked
    var elimVal = tr.querySelector(".part-elim-order").value
    var killedByVal = tr.querySelector(".part-killed-by").value.trim()
    return {
      user_id: tr.querySelector(".part-user-id").value || null,
      player_name: tr.querySelector(".part-player-name").value.trim() || "Jogador",
      character_name: tr.querySelector(".part-char-name").value || null,
      eliminations_made: parseInt(tr.querySelector(".part-kills").value) || 0,
      survival_points: parseInt(tr.querySelector(".part-survival").value) || 0,
      elimination_order: !isWin && elimVal !== "" ? parseInt(elimVal) : null,
      killed_by_player_name: !isWin && killedByVal ? killedByVal : null,
      is_winner: isWin
    }
  })

  var endedAtVal = document.getElementById("fullMatchEndedAt").value
  showLoading()
  try {
    var result = await supabase.rpc("admin_save_full_match", {
      p_match_id: matchId,
      p_room_name: document.getElementById("fullMatchRoom").value.trim() || "Sala",
      p_total_players: parseInt(document.getElementById("fullMatchTotalPlayers").value) || Math.max(participants.length, 2),
      p_ended_at: endedAtVal ? new Date(endedAtVal).toISOString() : null,
      p_participants: participants
    })
    if (result.error) throw result.error

    Modal.getInstance(document.getElementById("fullMatchModal")).hide()
    showToast("Partida salva e estatísticas dos jogadores atualizadas!")
    loadGlobalMatches()
  } catch (e) {
    showToast("Erro ao salvar partida: " + e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.repairAndLinkMatches = async function () {
  if (
    !confirm('Deseja vincular automaticamente os participantes às contas de mesmo nome e restaurar os vencedores das partidas antigas vazias ("—")?')
  )
    return
  showLoading()
  try {
    var result = await supabase.rpc("admin_repair_and_link_matches")
    if (result.error) throw result.error
    var d = result.data || {}
    showToast("Sincronizado! Participantes vinculados: " + (d.linked_participants || 0) + " | Vencedores restaurados: " + (d.created_winners || 0))
    loadGlobalMatches()
  } catch (e) {
    showToast("Erro ao reparar históricos: " + e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.autoMergeDuplicateMatches = async function () {
  showLoading()
  try {
    var previewRes = await supabase.rpc("admin_auto_merge_matches", { p_dry_run: true })
    if (previewRes.error) throw previewRes.error
    var found = previewRes.data?.groups_found || 0
    if (found === 0) {
      showToast("Nenhuma partida duplicada encontrada!", "info")
      return
    }
    hideLoading()
    if (!confirm("Foram encontrados " + found + " grupo(s) de partidas duplicadas. Deseja unificá-las e recalcular os pontos automaticamente?"))
      return
    showLoading()
    var execRes = await supabase.rpc("admin_auto_merge_matches", { p_dry_run: false })
    if (execRes.error) throw execRes.error
    showToast("Unificadas " + (execRes.data?.groups_merged || 0) + " partidas!")
    loadGlobalMatches()
  } catch (e) {
    showToast("Erro ao unificar partidas: " + e.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== 5. AUDIT LOG ==========
var logOffset = 0
var logLimit = 30
var logTotal = 0

window.loadAuditLog = async function (direction) {
  if (direction === "reset") logOffset = 0
  else if (direction === "next") logOffset += logLimit
  else if (direction === "prev") logOffset = Math.max(0, logOffset - logLimit)

  try {
    var result = await supabase.rpc("admin_get_audit_log", { p_limit: logLimit, p_offset: logOffset })
    if (result.error) throw result.error
    var data = result.data
    logTotal = data.total || 0
    var logs = data.logs || []

    var page = Math.floor(logOffset / logLimit) + 1
    var totalPages = Math.ceil(logTotal / logLimit) || 1
    document.getElementById("logPageInfo").textContent = "Página " + page + " de " + totalPages + " (" + logTotal + " registros)"
    document.getElementById("logPrevBtn").disabled = logOffset === 0
    document.getElementById("logNextBtn").disabled = logOffset + logLimit >= logTotal

    var tbody = document.getElementById("auditLogBody")
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum registro de auditoria.</td></tr>'
      return
    }

    var actionLabels = {
      ban_user: "🚫 Banimento",
      unban_user: "✅ Desbanimento",
      kick_player: "👢 Expulsão",
      force_end_match: "⏹️ Fim Forçado",
      delete_room: "🗑️ Sala Deletada",
      clear_combats: "⚔️ Combates Limpos",
      change_master: "👑 Mestre Alterado",
      reset_stats: "🧹 Stats Zeradas",
      update_stats: "📊 Stats Editadas",
      recalculate_stats: "🔄 Stats Recalculadas",
      update_profile: "✏️ Perfil Editado",
      delete_match: "🗑️ Partida Removida",
      delete_match_participant: "👤➖ Participante Removido",
      create_match: "➕ Partida Criada",
      update_match: "✏️ Partida Editada",
      edit_full_match: "✏️ Partida Completa Editada",
      repair_matches: "🔧 Históricos Reparados",
      auto_merge_matches: "🔗 Merge Automático",
      delete_user: "🗑️ Conta Deletada",
      update_setting: "⚙️ Config Alterada",
      create_user: "➕ Conta Criada",
      change_password: "🔑 Senha Alterada"
    }

    tbody.innerHTML = logs
      .map(function (l) {
        var actionLabel = actionLabels[l.action] || escapeHtml(l.action)
        var target = ""
        if (l.details) {
          if (l.details.display_name) target = escapeHtml(l.details.display_name)
          else if (l.details.player_name) target = escapeHtml(l.details.player_name)
          else if (l.details.new_master_name) target = escapeHtml(l.details.new_master_name)
          else if (l.details.room_name) target = escapeHtml(l.details.room_name)
          else if (l.details.new_display_name) target = "→ " + escapeHtml(l.details.new_display_name)
        }
        if (l.target_room_id) target += (target ? " " : "") + '<code class="text-info">' + escapeHtml(l.target_room_id) + "</code>"

        var detailsStr = ""
        if (l.details) {
          if (l.details.reason) detailsStr = "Motivo: " + escapeHtml(l.details.reason)
          else if (l.details.players_removed !== undefined) detailsStr = l.details.players_removed + " jogadores removidos"
          else if (l.details.combats_removed !== undefined) detailsStr = l.details.combats_removed + " combates removidos"
          else if (l.details.key !== undefined) detailsStr = escapeHtml(l.details.key) + " = " + escapeHtml(l.details.value)
        }

        return (
          "<tr>" +
          "<td>" +
          escapeHtml(l.admin_name || "—") +
          "</td>" +
          "<td>" +
          actionLabel +
          "</td>" +
          "<td>" +
          (target || "—") +
          "</td>" +
          '<td><small class="text-muted">' +
          (detailsStr || "—") +
          "</small></td>" +
          "<td><small>" +
          formatDate(l.created_at) +
          "</small></td>" +
          "</tr>"
        )
      })
      .join("")
  } catch (e) {
    showToast("Erro ao carregar auditoria: " + e.message, "danger")
  }
}

// ========== 6. TOOLS ==========
function showToolResult(html) {
  var el = document.getElementById("toolResult")
  document.getElementById("toolResultContent").innerHTML = html
  el.classList.remove("d-none")
}

window.executeCleanup = async function () {
  if (!confirm("Executar limpeza de jogadores e salas inativas?")) return
  showLoading()
  try {
    var result = await supabase.rpc("cleanup_inactive_data")
    if (result.error) throw result.error
    var data = result.data || {}
    showToolResult(
      '<div class="alert alert-success mb-0">✅ Limpeza concluída!<br>Jogadores inativos removidos: <strong>' +
        (data.players_deleted ?? 0) +
        "</strong><br>Salas inativas desativadas: <strong>" +
        (data.rooms_deleted ?? 0) +
        "</strong></div>"
    )
    showToast("Limpeza executada!")
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.executeAutoEndStaleMatches = async function () {
  if (!confirm("Encerrar partidas paradas há mais de 2 horas salvando a pontuação?")) return
  showLoading()
  try {
    var result = await supabase.rpc("auto_end_stale_matches")
    if (result.error) throw result.error
    var data = result.data || {}
    showToolResult(
      '<div class="alert alert-info mb-0">⏱️ Verificação concluída!<br>Partidas encerradas automaticamente: <strong>' +
        (data.matches_ended ?? 0) +
        "</strong></div>"
    )
    showToast("Operação concluída!")
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.testSystem = async function () {
  showLoading()
  try {
    var result = await supabase.rpc("test_cleanup_system")
    if (result.error) throw result.error
    var data = result.data || {}
    var passed = data.test_passed !== false
    showToolResult(
      '<div class="alert ' +
        (passed ? "alert-success" : "alert-warning") +
        ' mb-0">' +
        (passed ? "✅ SISTEMA OPERACIONAL" : "⚠️ ATENÇÃO") +
        '<details class="mt-2" open><summary>Ver JSON de Diagnóstico</summary><pre class="mt-2 text-light mb-0" style="font-size:0.8rem;">' +
        escapeHtml(JSON.stringify(data, null, 2)) +
        "</pre></details></div>"
    )
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

window.debugRooms = async function () {
  showLoading()
  try {
    var result = await supabase.rpc("debug_room_cleanup")
    if (result.error) throw result.error
    var data = Array.isArray(result.data) ? result.data : result.data?.rooms_to_cleanup || []
    if (!data.length) {
      showToolResult('<p class="text-muted mb-0">Nenhuma sala registrada no momento.</p>')
      return
    }
    var html =
      '<div class="table-responsive"><table class="table table-dark table-sm mb-0"><thead><tr><th>Código</th><th>Nome</th><th>Jogadores</th><th>Conectados</th><th>Status</th><th>Diagnóstico</th></tr></thead><tbody>'
    data.forEach(function (r) {
      var cls = r.should_be_deleted ? "table-danger" : ""
      html +=
        '<tr class="' +
        cls +
        '">' +
        "<td><code>" +
        escapeHtml(r.room_id || r.id || "") +
        "</code></td>" +
        "<td>" +
        escapeHtml(r.room_name || r.name || "N/A") +
        "</td>" +
        "<td>" +
        (r.players_count ?? 0) +
        "</td>" +
        "<td>" +
        (r.connected_players_count ?? r.connected_players ?? 0) +
        "</td>" +
        "<td>" +
        (r.should_be_deleted ? "🗑️ Elegível p/ Limpeza" : "✅ Saudável") +
        "</td>" +
        "<td><small>" +
        escapeHtml(r.deletion_reason || "") +
        "</small></td>" +
        "</tr>"
    })
    html += "</tbody></table></div>"
    showToolResult(html)
  } catch (e) {
    showToast(e.message, "danger")
  } finally {
    hideLoading()
  }
}

// ========== ROTEADOR SEGURO DE EVENTOS (ANTI-XSS) ==========
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]")
  if (!el) return

  var action = el.dataset.action
  var id = el.dataset.id
  var name = el.dataset.name || ""
  var roomId = el.dataset.roomId

  switch (action) {
    case "open-user":
      return window.openUserDetail(id)
    case "ban-user":
      return window.openBanModal(id, name)
    case "unban-user":
      return window.unbanUser(id, name)
    case "change-pass":
      return window.openPasswordModal(id, name)
    case "reset-stats":
      return window.resetStats(id, name)
    case "delete-user":
      return window.deleteUser(id, name)
    case "copy-match":
      return window.copyMatchId(id)
    case "edit-match":
      return window.openEditMatchById(id)
    case "remove-part":
      return window.removeMatchParticipant(id, name)
    case "delete-match":
      return window.deleteMatch(id, name)
    case "open-full-match":
      return window.openFullMatchEditor(id)
    case "remove-row":
      el.closest("tr")?.remove()
      return
    case "open-room":
      return window.openRoomDetail(id)
    case "force-end":
      return window.forceEndMatch(id, name)
    case "delete-room":
      return window.deleteRoom(id, name)
    case "clear-combats":
      return window.clearRoomCombats(id)
    case "set-master":
      return window.setRoomMaster(roomId, id, name)
    case "kick-player":
      return window.kickPlayer(id, roomId, name)
    case "goto-user":
      return window.goToUserFromRoom(id)
    default:
      return
  }
})

initApp()