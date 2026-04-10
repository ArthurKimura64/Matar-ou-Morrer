import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

// ======================== HELPER ========================
const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
};

const ConfirmModal = ({ show, title, message, onConfirm, onCancel, variant = 'danger' }) => {
  if (!show) return null;
  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onCancel}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-content bg-dark text-light">
          <div className="modal-header border-secondary">
            <h5 className="modal-title">{title}</h5>
            <button className="btn-close btn-close-white" onClick={onCancel} />
          </div>
          <div className="modal-body"><p>{message}</p></div>
          <div className="modal-footer border-secondary">
            <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
            <button className={`btn btn-${variant}`} onClick={onConfirm}>Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Spinner = () => (
  <div className="d-flex justify-content-center py-4">
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Carregando...</span>
    </div>
  </div>
);

const Alert = ({ type, message, onClose }) => {
  if (!message) return null;
  return (
    <div className={`alert alert-${type} alert-dismissible fade show`} role="alert">
      {message}
      {onClose && <button className="btn-close" onClick={onClose} />}
    </div>
  );
};

// ======================== TAB: DASHBOARD ========================
const DashboardTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase.rpc('admin_get_dashboard');
      if (err) throw err;
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) return <Spinner />;
  if (error) return <Alert type="danger" message={error} />;
  if (!data) return null;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="text-light mb-0">Visão Geral</h5>
        <button className="btn btn-sm btn-outline-light" onClick={loadDashboard}>🔄 Atualizar</button>
      </div>

      {/* Stat cards */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Salas Ativas', value: data.active_rooms, color: 'primary', icon: '🏠' },
          { label: 'Em Partida', value: data.rooms_in_match, color: 'warning', icon: '⚔️' },
          { label: 'Jogadores Online', value: data.connected_players, color: 'success', icon: '🎮' },
          { label: 'Usuários', value: data.total_users, color: 'info', icon: '👥' },
          { label: 'Banidos', value: data.banned_users, color: 'danger', icon: '🚫' },
          { label: 'Partidas Hoje', value: data.matches_today, color: 'primary', icon: '📊' },
          { label: 'Partidas na Semana', value: data.matches_this_week, color: 'secondary', icon: '📈' },
          { label: 'Total de Partidas', value: data.total_matches, color: 'dark', icon: '🏆' },
        ].map((stat, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className={`card bg-dark border-${stat.color} text-light h-100`}>
              <div className="card-body text-center py-3">
                <div style={{ fontSize: '1.5rem' }}>{stat.icon}</div>
                <div className="fs-3 fw-bold">{stat.value ?? 0}</div>
                <small className="text-muted">{stat.label}</small>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top player */}
      {data.top_player && (
        <div className="card bg-dark border-warning text-light mb-3">
          <div className="card-body">
            <h6 className="card-title">🏅 Melhor Jogador</h6>
            <p className="mb-0">
              <strong>{data.top_player.display_name}</strong> — 
              Score: {data.top_player.composite_score} | Vitórias: {data.top_player.total_wins}
            </p>
          </div>
        </div>
      )}

      {/* Recent matches */}
      {data.recent_matches && data.recent_matches.length > 0 && (
        <div className="card bg-dark border-secondary text-light">
          <div className="card-header border-secondary">📋 Partidas Recentes</div>
          <div className="table-responsive">
            <table className="table table-dark table-sm mb-0">
              <thead>
                <tr>
                  <th>Sala</th>
                  <th>Vencedor</th>
                  <th>Jogadores</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_matches.map((m, i) => (
                  <tr key={i}>
                    <td>{m.room_name}</td>
                    <td>{m.winner_player_name || '—'}</td>
                    <td>{m.total_players}</td>
                    <td>{formatDate(m.ended_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ======================== TAB: SALAS ========================
const RoomsTab = () => {
  const [rooms, setRooms] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_list_rooms', {
        p_include_inactive: includeInactive,
        p_limit: 100
      });
      if (err) throw err;
      setRooms(data.rooms || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const handleDeleteRoom = async (roomId, roomName) => {
    setConfirm({
      title: 'Deletar Sala',
      message: `Tem certeza que deseja deletar a sala "${roomName}" (${roomId})? Todos os jogadores serão removidos.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          const { data, error: err } = await supabase.rpc('admin_delete_room', { p_room_id: roomId });
          if (err) throw err;
          setSuccess(`Sala "${roomName}" deletada. ${data.players_removed} jogadores removidos.`);
          loadRooms();
        } catch (e) {
          setError(e.message);
        }
      }
    });
  };

  const handleForceEndMatch = async (roomId, roomName) => {
    setConfirm({
      title: 'Forçar Fim de Partida',
      message: `Encerrar a partida em andamento na sala "${roomName}"?`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const { error: err } = await supabase.rpc('admin_force_end_match', { p_room_id: roomId });
          if (err) throw err;
          setSuccess(`Partida encerrada na sala "${roomName}".`);
          loadRooms();
        } catch (e) {
          setError(e.message);
        }
      }
    });
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="text-light mb-0">Salas ({total})</h5>
        <div className="d-flex gap-2 align-items-center">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)} id="showInactive" />
            <label className="form-check-label text-light" htmlFor="showInactive">Mostrar inativas</label>
          </div>
          <button className="btn btn-sm btn-outline-light" onClick={loadRooms}>🔄</button>
        </div>
      </div>

      <Alert type="danger" message={error} onClose={() => setError(null)} />
      <Alert type="success" message={success} onClose={() => setSuccess(null)} />

      {loading ? <Spinner /> : rooms.length === 0 ? (
        <p className="text-muted text-center">Nenhuma sala encontrada.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-dark table-hover table-sm">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Mestre</th>
                <th>Jogadores</th>
                <th>Status</th>
                <th>Criada em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id}>
                  <td><code>{r.id}</code></td>
                  <td>{r.name}</td>
                  <td>{r.master_name}</td>
                  <td>
                    <span className="badge bg-info">{r.connected_players}</span>
                    <small className="text-muted">/{r.total_players}</small>
                  </td>
                  <td>
                    {r.match_status ? (
                      <span className="badge bg-warning">Em Partida</span>
                    ) : r.is_active ? (
                      <span className="badge bg-success">Ativa</span>
                    ) : (
                      <span className="badge bg-secondary">Inativa</span>
                    )}
                  </td>
                  <td><small>{formatDate(r.created_at)}</small></td>
                  <td>
                    <div className="btn-group btn-group-sm">
                      {r.match_status && (
                        <button className="btn btn-outline-warning" title="Forçar fim de partida"
                          onClick={() => handleForceEndMatch(r.id, r.name)}>⏹️</button>
                      )}
                      <button className="btn btn-outline-danger" title="Deletar sala"
                        onClick={() => handleDeleteRoom(r.id, r.name)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal show={!!confirm} title={confirm?.title} message={confirm?.message}
        variant={confirm?.variant || 'danger'} onConfirm={confirm?.onConfirm} onCancel={() => setConfirm(null)} />
    </div>
  );
};

// ======================== TAB: USUÁRIOS ========================
const UsersTab = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState('');
  const [bannedOnly, setBannedOnly] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', displayName: '' });
  const [creating, setCreating] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banTarget, setBanTarget] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_list_users', {
        p_search: search || null,
        p_banned_only: bannedOnly,
        p_limit: 100
      });
      if (err) throw err;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, bannedOnly]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleBan = (user) => {
    setBanTarget(user);
    setBanReason('Violação das regras');
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    try {
      const { error: err } = await supabase.rpc('admin_ban_user', {
        p_user_id: banTarget.id,
        p_reason: banReason
      });
      if (err) throw err;
      setSuccess(`Usuário "${banTarget.display_name}" banido.`);
      setBanTarget(null);
      loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUnban = (user) => {
    setConfirm({
      title: 'Desbanir Usuário',
      message: `Desbanir "${user.display_name}"?`,
      variant: 'success',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const { error: err } = await supabase.rpc('admin_unban_user', { p_user_id: user.id });
          if (err) throw err;
          setSuccess(`Usuário "${user.display_name}" desbanido.`);
          loadUsers();
        } catch (e) {
          setError(e.message);
        }
      }
    });
  };

  const handleResetStats = (user) => {
    setConfirm({
      title: 'Resetar Estatísticas',
      message: `Resetar todas as estatísticas de "${user.display_name}"? Esta ação não pode ser desfeita.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          const { error: err } = await supabase.rpc('admin_reset_user_stats', { p_user_id: user.id });
          if (err) throw err;
          setSuccess(`Estatísticas de "${user.display_name}" resetadas.`);
          loadUsers();
        } catch (e) {
          setError(e.message);
        }
      }
    });
  };

  const handleDeleteUser = (user) => {
    setConfirm({
      title: 'Deletar Conta',
      message: `ATENÇÃO: Deletar permanentemente a conta de "${user.display_name}"? Todos os dados serão perdidos.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const res = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId: user.id })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error);
          setSuccess(`Conta de "${user.display_name}" deletada.`);
          loadUsers();
        } catch (e) {
          setError(e.message);
        }
      }
    });
  };

  const handleChangePassword = async () => {
    if (!passwordTarget || !newPasswordInput) return;
    if (newPasswordInput.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setChangingPassword(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: passwordTarget.id, newPassword: newPasswordInput })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSuccess(`Senha de "${passwordTarget.display_name}" alterada com sucesso.`);
      setPasswordTarget(null);
      setNewPasswordInput('');
    } catch (e) {
      setError(e.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(createForm)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSuccess(`Conta criada para "${createForm.displayName}" (${createForm.email}).`);
      setCreateForm({ email: '', password: '', displayName: '' });
      setShowCreateForm(false);
      loadUsers();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="text-light mb-0">Usuários ({total})</h5>
        <button className="btn btn-sm btn-success" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? '✕ Fechar' : '➕ Criar Conta'}
        </button>
      </div>

      <Alert type="danger" message={error} onClose={() => setError(null)} />
      <Alert type="success" message={success} onClose={() => setSuccess(null)} />

      {/* Create user form */}
      {showCreateForm && (
        <div className="card bg-dark border-success text-light mb-3">
          <div className="card-body">
            <h6 className="card-title">Criar Nova Conta</h6>
            <form onSubmit={handleCreateUser}>
              <div className="row g-2">
                <div className="col-md-4">
                  <input type="text" className="form-control form-control-sm bg-dark text-light border-secondary"
                    placeholder="Nome de exibição" value={createForm.displayName}
                    onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} required minLength={2} maxLength={50} />
                </div>
                <div className="col-md-4">
                  <input type="email" className="form-control form-control-sm bg-dark text-light border-secondary"
                    placeholder="Email" value={createForm.email}
                    onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="col-md-3">
                  <input type="password" className="form-control form-control-sm bg-dark text-light border-secondary"
                    placeholder="Senha (min. 6)" value={createForm.password}
                    onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
                </div>
                <div className="col-md-1">
                  <button type="submit" className="btn btn-success btn-sm w-100" disabled={creating}>
                    {creating ? '...' : '✓'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="row g-2 mb-3">
        <div className="col-md-8">
          <input type="text" className="form-control form-control-sm bg-dark text-light border-secondary"
            placeholder="Buscar por nome..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="col-md-4 d-flex align-items-center gap-2">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" checked={bannedOnly}
              onChange={e => setBannedOnly(e.target.checked)} id="bannedOnly" />
            <label className="form-check-label text-light" htmlFor="bannedOnly">Apenas banidos</label>
          </div>
          <button className="btn btn-sm btn-outline-light" onClick={loadUsers}>🔄</button>
        </div>
      </div>

      {loading ? <Spinner /> : users.length === 0 ? (
        <p className="text-muted text-center">Nenhum usuário encontrado.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-dark table-hover table-sm">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Partidas</th>
                <th>Vitórias</th>
                <th>Elim.</th>
                <th>Score</th>
                <th>Status</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={u.banned_at ? 'table-danger' : ''}>
                  <td>
                    {u.display_name}
                    {u.is_admin && <span className="badge bg-warning ms-1" title="Admin">👑</span>}
                  </td>
                  <td>{u.total_matches}</td>
                  <td>{u.total_wins}</td>
                  <td>{u.total_eliminations}</td>
                  <td>{u.composite_score}</td>
                  <td>
                    {u.banned_at ? (
                      <span className="badge bg-danger" title={u.ban_reason}>Banido</span>
                    ) : (
                      <span className="badge bg-success">Ativo</span>
                    )}
                  </td>
                  <td><small>{formatDate(u.created_at)}</small></td>
                  <td>
                    {!u.is_admin && (
                      <div className="btn-group btn-group-sm">
                        {u.banned_at ? (
                          <button className="btn btn-outline-success" title="Desbanir" onClick={() => handleUnban(u)}>✅</button>
                        ) : (
                          <button className="btn btn-outline-warning" title="Banir" onClick={() => handleBan(u)}>🚫</button>
                        )}
                        <button className="btn btn-outline-secondary" title="Mudar senha" onClick={() => { setPasswordTarget(u); setNewPasswordInput(''); }}>🔑</button>
                        <button className="btn btn-outline-info" title="Resetar stats" onClick={() => handleResetStats(u)}>📊</button>
                        <button className="btn btn-outline-danger" title="Deletar conta" onClick={() => handleDeleteUser(u)}>🗑️</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ban modal */}
      {banTarget && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setBanTarget(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content bg-dark text-light">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">🚫 Banir "{banTarget.display_name}"</h5>
                <button className="btn-close btn-close-white" onClick={() => setBanTarget(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Motivo do banimento:</label>
                <textarea className="form-control bg-dark text-light border-secondary"
                  value={banReason} onChange={e => setBanReason(e.target.value)} rows={3} />
              </div>
              <div className="modal-footer border-secondary">
                <button className="btn btn-secondary" onClick={() => setBanTarget(null)}>Cancelar</button>
                <button className="btn btn-danger" onClick={confirmBan}>Banir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {passwordTarget && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setPasswordTarget(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content bg-dark text-light">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">🔑 Mudar Senha de "{passwordTarget.display_name}"</h5>
                <button className="btn-close btn-close-white" onClick={() => setPasswordTarget(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Nova senha:</label>
                <input type="password" className="form-control bg-dark text-light border-secondary"
                  value={newPasswordInput} onChange={e => setNewPasswordInput(e.target.value)}
                  placeholder="Mínimo 6 caracteres" minLength={6} />
              </div>
              <div className="modal-footer border-secondary">
                <button className="btn btn-secondary" onClick={() => setPasswordTarget(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleChangePassword} disabled={changingPassword || newPasswordInput.length < 6}>
                  {changingPassword ? 'Alterando...' : 'Alterar Senha'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal show={!!confirm} title={confirm?.title} message={confirm?.message}
        variant={confirm?.variant || 'danger'} onConfirm={confirm?.onConfirm} onCancel={() => setConfirm(null)} />
    </div>
  );
};

// ======================== TAB: PARTIDAS ========================
const MatchesTab = () => {
  const [matches, setMatches] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedMatch, setExpandedMatch] = useState(null);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_get_match_history', { p_limit: 100 });
      if (err) throw err;
      setMatches(data.matches || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="text-light mb-0">Histórico de Partidas ({total})</h5>
        <button className="btn btn-sm btn-outline-light" onClick={loadMatches}>🔄</button>
      </div>

      <Alert type="danger" message={error} />

      {loading ? <Spinner /> : matches.length === 0 ? (
        <p className="text-muted text-center">Nenhuma partida registrada.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-dark table-hover table-sm">
            <thead>
              <tr>
                <th>#</th>
                <th>Sala</th>
                <th>Vencedor</th>
                <th>Jogadores</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => (
                <React.Fragment key={m.id}>
                  <tr>
                    <td>{m.id}</td>
                    <td><code>{m.room_id}</code> {m.room_name}</td>
                    <td><strong>{m.winner_player_name || '—'}</strong></td>
                    <td>{m.total_players}</td>
                    <td><small>{formatDate(m.started_at)}</small></td>
                    <td><small>{formatDate(m.ended_at)}</small></td>
                    <td>
                      <button className="btn btn-sm btn-outline-info"
                        onClick={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}>
                        {expandedMatch === m.id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {expandedMatch === m.id && m.participants && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <table className="table table-sm table-secondary mb-0">
                          <thead>
                            <tr>
                              <th>Pos.</th>
                              <th>Jogador</th>
                              <th>Personagem</th>
                              <th>Eliminações</th>
                              <th>Eliminado por</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.participants.map((p, i) => (
                              <tr key={i}>
                                <td>{p.placement || '—'}</td>
                                <td>{p.player_name}</td>
                                <td>{p.character_name || '—'}</td>
                                <td>{p.eliminations || 0}</td>
                                <td>{p.eliminated_by || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ======================== TAB: LIMPEZA ========================
const CleanupTab = () => {
  const [stats, setStats] = useState(null);
  const [combatStats, setCombatStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sysRes, combatRes] = await Promise.all([
        supabase.rpc('get_system_stats'),
        supabase.rpc('get_combat_stats')
      ]);
      if (sysRes.error) throw sysRes.error;
      if (combatRes.error) throw combatRes.error;
      setStats(sysRes.data);
      setCombatStats(combatRes.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLog = async () => {
    try {
      const { data, error: err } = await supabase.rpc('admin_get_audit_log', { p_limit: 20 });
      if (err) throw err;
      setAuditLogs(data.logs || []);
    } catch (e) {
      console.warn('Erro ao carregar audit log:', e);
    }
  };

  useEffect(() => {
    loadStats();
    loadAuditLog();
  }, []);

  const handleCleanup = () => {
    setConfirm({
      title: 'Executar Limpeza',
      message: 'Remover jogadores e salas inativos (2+ horas)?',
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        setLoading(true);
        try {
          const { data, error: err } = await supabase.rpc('cleanup_inactive_data');
          if (err) throw err;
          setSuccess(`Limpeza concluída: ${data.players_deleted} jogadores e ${data.rooms_deleted} salas removidos.`);
          loadStats();
          loadAuditLog();
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="text-light mb-0">Limpeza & Sistema</h5>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-light" onClick={loadStats}>🔄 Atualizar</button>
          <button className="btn btn-sm btn-warning" onClick={handleCleanup} disabled={loading}>
            🧹 Executar Limpeza
          </button>
        </div>
      </div>

      <Alert type="danger" message={error} onClose={() => setError(null)} />
      <Alert type="success" message={success} onClose={() => setSuccess(null)} />

      {loading && <Spinner />}

      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <div className="card bg-dark border-primary text-light">
              <div className="card-header border-secondary">📊 Sistema</div>
              <div className="card-body">
                <ul className="list-unstyled mb-0">
                  <li>Jogadores totais: <strong>{stats.total_players}</strong></li>
                  <li>Jogadores conectados: <strong>{stats.connected_players}</strong></li>
                  <li>Jogadores inativos (2h+): <strong className="text-warning">{stats.inactive_players_2h}</strong></li>
                  <li className="mt-2">Salas totais: <strong>{stats.total_rooms}</strong></li>
                  <li>Salas ativas: <strong>{stats.active_rooms}</strong></li>
                  <li>Salas inativas (2h+): <strong className="text-warning">{stats.inactive_rooms_2h}</strong></li>
                  <li>Salas com jogadores: <strong>{stats.rooms_with_players}</strong></li>
                  <li>Salas vazias: <strong>{stats.empty_rooms}</strong></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card bg-dark border-info text-light">
              <div className="card-header border-secondary">⚔️ Combate</div>
              <div className="card-body">
                {combatStats ? (
                  <ul className="list-unstyled mb-0">
                    <li>Combates totais: <strong>{combatStats.total_combats}</strong></li>
                    <li>Ativos: <strong className="text-success">{combatStats.active_combats}</strong></li>
                    <li>Pendentes: <strong className="text-warning">{combatStats.pending_combats}</strong></li>
                    <li>Completados: <strong>{combatStats.completed_combats}</strong></li>
                    <li className="mt-2">Com ataques de oportunidade: <strong>{combatStats.combats_with_opportunity_attacks}</strong></li>
                    <li>Total de ataques oportunidade: <strong>{combatStats.total_opportunity_attacks}</strong></li>
                  </ul>
                ) : <p className="text-muted mb-0">Carregando...</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit log */}
      {auditLogs.length > 0 && (
        <div className="card bg-dark border-secondary text-light">
          <div className="card-header border-secondary">📋 Log de Auditoria (últimas 20 ações) 
            <button className="btn btn-sm btn-outline-light float-end" onClick={loadAuditLog}>🔄</button>
          </div>
          <div className="table-responsive">
            <table className="table table-dark table-sm mb-0">
              <thead>
                <tr>
                  <th>Ação</th>
                  <th>Admin</th>
                  <th>Detalhes</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td><span className="badge bg-secondary">{log.action}</span></td>
                    <td>{log.admin_name || '—'}</td>
                    <td><small>{JSON.stringify(log.details || {})}</small></td>
                    <td><small>{formatDate(log.created_at)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal show={!!confirm} title={confirm?.title} message={confirm?.message}
        variant={confirm?.variant || 'danger'} onConfirm={confirm?.onConfirm} onCancel={() => setConfirm(null)} />
    </div>
  );
};

// ======================== MAIN ADMIN PANEL ========================
const TABS = [
  { id: 'dashboard', label: '📊 Dashboard', component: DashboardTab },
  { id: 'rooms', label: '🏠 Salas', component: RoomsTab },
  { id: 'users', label: '👥 Usuários', component: UsersTab },
  { id: 'matches', label: '🏆 Partidas', component: MatchesTab },
  { id: 'cleanup', label: '🧹 Limpeza', component: CleanupTab },
];

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component || DashboardTab;

  return (
    <div className="container-fluid px-0">
      {/* Tab navigation */}
      <ul className="nav nav-tabs nav-fill mb-3">
        {TABS.map(tab => (
          <li key={tab.id} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.id ? 'active bg-dark text-light border-secondary' : 'text-light bg-transparent border-0'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Active tab content */}
      <ActiveComponent />
    </div>
  );
};

export default AdminPanel;
