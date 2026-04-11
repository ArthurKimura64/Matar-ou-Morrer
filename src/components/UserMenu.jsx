import React, { useState, useRef, useEffect } from 'react';
import authService from '../services/authService';

const UserMenu = ({ user, profile, onLogout, onNavigate, onChangePassword }) => {
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (user) {
      authService.checkIsAdmin().then(setIsAdmin);
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    try {
      await authService.signOut();
      onLogout();
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Jogador';

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-outline-light btn-sm d-flex align-items-center gap-2"
        onClick={() => setOpen(!open)}
      >
        {profile?.avatar_url ? (
          <img 
            src={profile.avatar_url} 
            alt="" 
            width="24" 
            height="24" 
            className="rounded-circle"
          />
        ) : (
          <span>👤</span>
        )}
        <span className="d-none d-md-inline">{displayName}</span>
        <small>▾</small>
      </button>

      {open && (
        <div 
          className="card bg-dark border-secondary shadow"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: '4px',
            minWidth: '200px',
            zIndex: 1050
          }}
        >
          <div className="card-body p-2">
            <div className="px-2 py-1 mb-2 border-bottom border-secondary">
              <small className="text-secondary">Logado como</small>
              <div className="text-light fw-bold text-truncate">{displayName}</div>
            </div>
            <button 
              className="btn btn-sm btn-outline-light w-100 text-start mb-1"
              onClick={() => { setOpen(false); onNavigate('profile'); }}
            >
              📊 Meu Perfil
            </button>
            <button 
              className="btn btn-sm btn-outline-light w-100 text-start mb-1"
              onClick={() => { setOpen(false); onNavigate('ranking'); }}
            >
              🏆 Ranking
            </button>
            <button 
              className="btn btn-sm btn-outline-light w-100 text-start mb-1"
              onClick={() => { setOpen(false); onChangePassword && onChangePassword(); }}
            >
              🔐 Mudar Senha
            </button>
            {isAdmin && (
              <button 
                className="btn btn-sm btn-outline-warning w-100 text-start mb-1"
                onClick={() => { setOpen(false); window.open('/admin.html', '_blank'); }}
              >
                ⚙️ Painel Admin
              </button>
            )}
            <button 
              className="btn btn-sm btn-outline-danger w-100 text-start"
              onClick={handleLogout}
            >
              🚪 Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
