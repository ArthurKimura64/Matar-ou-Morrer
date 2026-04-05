import React, { useState } from 'react';
import authService from '../services/authService';

const AuthModal = ({ show, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) {
          setError('Nome de exibição é obrigatório');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres');
          setLoading(false);
          return;
        }
        const data = await authService.signUpWithEmail(email, password, displayName.trim());
        if (data.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      } else {
        const data = await authService.signInWithEmail(email, password);
        onAuthSuccess(data.user);
        onClose();
      }
    } catch (err) {
      const messages = {
        'Invalid login credentials': 'Email ou senha incorretos',
        'User already registered': 'Este email já está registrado'
      };
      setError(messages[err.message] || err.message);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    resetForm();
  };

  if (!show) return null;

  return (
    <div 
      className="modal d-block" 
      tabIndex="-1" 
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content bg-dark text-light border-secondary">
          <div className="modal-header border-secondary">
            <h5 className="modal-title">
              {mode === 'login' ? '🔑 Entrar' : '📝 Criar Conta'}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body">
                {error && (
                  <div className="alert alert-danger py-2" role="alert">
                    {error}
                  </div>
                )}

                <form onSubmit={handleEmailAuth}>
                  {mode === 'register' && (
                    <div className="mb-3">
                      <label className="form-label">Nome de Exibição</label>
                      <input
                        type="text"
                        className="form-control bg-dark text-light border-secondary"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Como outros jogadores vão te ver"
                        maxLength={50}
                        required
                      />
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control bg-dark text-light border-secondary"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Senha</label>
                    <input
                      type="password"
                      className="form-control bg-dark text-light border-secondary"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="d-grid">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Processando...
                        </>
                      ) : (
                        mode === 'login' ? 'Entrar' : 'Criar Conta'
                      )}
                    </button>
                  </div>
                </form>

                <div className="text-center mt-3">
                  {mode === 'login' ? (
                    <small className="text-secondary">
                      Não tem conta?{' '}
                      <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => switchMode('register')}>
                        Criar conta
                      </button>
                    </small>
                  ) : (
                    <small className="text-secondary">
                      Já tem conta?{' '}
                      <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => switchMode('login')}>
                        Entrar
                      </button>
                    </small>
                  )}
                </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
