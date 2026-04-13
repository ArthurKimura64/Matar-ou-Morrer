import React, { useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthModal = ({ show, onClose, onAuthSuccess, initialMode, localization }) => {
  const [mode, setMode] = useState(initialMode || 'login'); // 'login' | 'register' | 'forgot' | 'changePassword'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    if (show) {
      setMode(initialMode || 'login');
      resetForm();
      authService.isRegistrationOpen().then(open => setRegistrationOpen(open));
    }
  }, [show, initialMode]);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) {
          setError(localization?.['UI.Auth.DisplayNameRequired'] || 'Nome de exibição é obrigatório');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError(localization?.['UI.Auth.PasswordMinLength'] || 'A senha deve ter pelo menos 6 caracteres');
          setLoading(false);
          return;
        }
        const data = await authService.signUpWithEmail(email, password, displayName.trim());
        if (data.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      } else if (mode === 'forgot') {
        await authService.resetPasswordForEmail(email);
        setSuccess(localization?.['UI.Auth.RecoveryEmailSent'] || 'Email de recuperação enviado! Verifique sua caixa de entrada.');
        setLoading(false);
        return;
      } else if (mode === 'changePassword') {
        if (newPassword.length < 6) {
          setError(localization?.['UI.Auth.NewPasswordMinLength'] || 'A nova senha deve ter pelo menos 6 caracteres');
          setLoading(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError(localization?.['UI.Auth.PasswordMismatch'] || 'As senhas não coincidem');
          setLoading(false);
          return;
        }
        await authService.updatePassword(newPassword);
        setSuccess(localization?.['UI.Auth.PasswordChanged'] || 'Senha alterada com sucesso!');
        setLoading(false);
        return;
      } else {
        const data = await authService.signInWithEmail(email, password);
        if (data.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      }
    } catch (err) {
      const messages = {
        'Invalid login credentials': localization?.['UI.Auth.InvalidCredentials'] || 'Email ou senha incorretos',
        'User already registered': localization?.['UI.Auth.AlreadyRegistered'] || 'Este email já está registrado',
        'For security purposes, you can only request this after 60 seconds.': localization?.['UI.Auth.RateLimited'] || 'Aguarde 60 segundos antes de solicitar novamente.',
        'New password should be different from the old password.': localization?.['UI.Auth.SamePassword'] || 'A nova senha deve ser diferente da senha atual.'
      };
      setError(messages[err.message] || err.message);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setError('');
    setSuccess('');
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    resetForm();
  };

  if (!show) return null;

  const titles = {
    login: localization?.['UI.Auth.Title.Login'] || '🔑 Entrar',
    register: localization?.['UI.Auth.Title.Register'] || '📝 Criar Conta',
    forgot: localization?.['UI.Auth.Title.Forgot'] || '🔒 Recuperar Senha',
    changePassword: localization?.['UI.Auth.Title.ChangePassword'] || '🔐 Mudar Senha'
  };

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
            <h5 className="modal-title">{titles[mode]}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body">
                {error && (
                  <div className="alert alert-danger py-2" role="alert">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="alert alert-success py-2" role="alert">
                    {success}
                  </div>
                )}

                <form onSubmit={handleEmailAuth}>
                  {mode === 'register' && (
                    <div className="mb-3">
                      <label className="form-label">{localization?.['UI.Auth.DisplayNameLabel'] || 'Nome de Exibição'}</label>
                      <input
                        type="text"
                        className="form-control bg-dark text-light border-secondary"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={localization?.['UI.Auth.DisplayNamePlaceholder'] || 'Como outros jogadores vão te ver'}
                        maxLength={50}
                        required
                      />
                    </div>
                  )}

                  {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                    <div className="mb-3">
                      <label className="form-label">{localization?.['UI.Auth.EmailLabel'] || 'Email'}</label>
                      <input
                        type="email"
                        className="form-control bg-dark text-light border-secondary"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={localization?.['UI.Auth.EmailPlaceholder'] || 'seu@email.com'}
                        required
                      />
                    </div>
                  )}

                  {(mode === 'login' || mode === 'register') && (
                    <div className="mb-3">
                      <label className="form-label">{localization?.['UI.Auth.PasswordLabel'] || 'Senha'}</label>
                      <input
                        type="password"
                        className="form-control bg-dark text-light border-secondary"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'register' ? (localization?.['UI.Auth.PasswordPlaceholderNew'] || 'Mínimo 6 caracteres') : (localization?.['UI.Auth.PasswordPlaceholder'] || 'Sua senha')}
                        minLength={6}
                        required
                      />
                    </div>
                  )}

                  {mode === 'changePassword' && (
                    <>
                      <div className="mb-3">
                        <label className="form-label">{localization?.['UI.Auth.NewPasswordLabel'] || 'Nova Senha'}</label>
                        <input
                          type="password"
                          className="form-control bg-dark text-light border-secondary"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={localization?.['UI.Auth.PasswordPlaceholderNew'] || 'Mínimo 6 caracteres'}
                          minLength={6}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">{localization?.['UI.Auth.ConfirmPasswordLabel'] || 'Confirmar Nova Senha'}</label>
                        <input
                          type="password"
                          className="form-control bg-dark text-light border-secondary"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={localization?.['UI.Auth.ConfirmPasswordPlaceholder'] || 'Repita a nova senha'}
                          minLength={6}
                          required
                        />
                      </div>
                    </>
                  )}

                  <div className="d-grid">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          {localization?.['UI.Auth.Processing'] || 'Processando...'}
                        </>
                      ) : (
                        mode === 'login' ? (localization?.['UI.Auth.Submit.Login'] || 'Entrar') : 
                        mode === 'register' ? (localization?.['UI.Auth.Submit.Register'] || 'Criar Conta') : 
                        mode === 'forgot' ? (localization?.['UI.Auth.Submit.Forgot'] || 'Enviar Email de Recuperação') :
                        (localization?.['UI.Auth.Submit.ChangePassword'] || 'Alterar Senha')
                      )}
                    </button>
                  </div>
                </form>

                <div className="text-center mt-3">
                  {mode === 'login' && (
                    <>
                      <small className="text-secondary d-block mb-1">
                        <button className="btn btn-link btn-sm p-0 text-warning" onClick={() => switchMode('forgot')}>
                          {localization?.['UI.Auth.ForgotPassword'] || 'Esqueceu a senha?'}
                        </button>
                      </small>
                      {registrationOpen ? (
                        <small className="text-secondary">
                          {localization?.['UI.Auth.NoAccount'] || 'Não tem conta?'}{' '}
                          <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => switchMode('register')}>
                            {localization?.['UI.Auth.CreateAccount'] || 'Criar conta'}
                          </button>
                        </small>
                      ) : (
                        <small className="text-danger d-block mt-1">
                          {localization?.['UI.Auth.RegistrationClosed'] || '🚫 Novos cadastros estão desativados.'}
                        </small>
                      )}
                    </>
                  )}
                  {mode === 'register' && (
                    <small className="text-secondary">
                      {localization?.['UI.Auth.HasAccount'] || 'Já tem conta?'}{' '}
                      <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => switchMode('login')}>
                        {localization?.['UI.Auth.GoToLogin'] || 'Entrar'}
                      </button>
                    </small>
                  )}
                  {mode === 'forgot' && (
                    <small className="text-secondary">
                      {localization?.['UI.Auth.RememberedPassword'] || 'Lembrou a senha?'}{' '}
                      <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => switchMode('login')}>
                        {localization?.['UI.Auth.BackToLogin'] || 'Voltar ao login'}
                      </button>
                    </small>
                  )}
                  {mode === 'changePassword' && (
                    <small className="text-secondary">
                      <button className="btn btn-link btn-sm p-0 text-primary" onClick={onClose}>
                        {localization?.['UI.Common.Cancel'] || 'Cancelar'}
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
